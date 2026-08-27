begin;

-- UMKM adalah portal gratis satu pemilik: kepemilikan usaha ditentukan dari
-- businesses.legacy_profile_id, bukan dari keanggotaan/role. Baris
-- business_members tetap dikenali untuk kompatibilitas data lama, tetapi
-- tidak lagi menjadi syarat akses UMKM.
create or replace function public.recalculate_my_readiness()
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_user_id uuid := auth.uid(); v_business_id uuid; v_profile_id uuid; v_rule_id uuid; v_rule_version text;
  v_tx_count int:=0; v_tx_days int:=0; v_tx_span int:=0; v_digital_count int:=0; v_channel_count int:=0; v_utilities_count int:=0; v_closing_count int:=0;
  v_nib_count int:=0; v_nib_confirmed int:=0; v_nib_verified int:=0; v_certificate_count int:=0;
  v_profile_count int:=0; v_latest_tx timestamptz; v_latest_doc timestamptz; v_input_hash text; v_existing uuid; v_snapshot_id uuid;
  v_tx_score numeric; v_nib_score numeric; v_total numeric:=0;
begin
  if v_user_id is null then raise exception using errcode='42501',message='UNAUTHENTICATED'; end if;
  select member.business_id,member.profile_id into v_business_id,v_profile_id
  from public.business_members member where member.user_id=v_user_id and member.status='active' and member.role in ('owner','manager','staff')
  order by case member.role when 'owner' then 1 when 'manager' then 2 else 3 end,member.created_at limit 1;
  -- UMKM tunggal: usaha milik akun ditentukan langsung dari profilnya,
  -- keanggotaan tidak diperlukan.
  if v_business_id is null then
    select business.id,business.legacy_profile_id into v_business_id,v_profile_id
    from public.businesses business
    where business.legacy_profile_id=v_user_id and business.status='active'
    order by business.created_at limit 1;
  end if;
  if v_business_id is null then raise exception using errcode='42501',message='BUSINESS_ACCESS_DENIED'; end if;
  select id,version into v_rule_id,v_rule_version from public.readiness_rule_sets
  where status='published' and coalesce(effective_at,published_at,created_at)<=now()
  order by coalesce(effective_at,published_at,created_at) desc limit 1;
  if v_rule_id is null then raise exception using errcode='P0001',message='READINESS_RULE_UNAVAILABLE'; end if;

  select count(*),count(distinct transaction_date),coalesce((max(transaction_date)-min(transaction_date))+1,0),
    count(*) filter(where payment_method in ('qris','bank_transfer','ewallet')),
    count(*) filter(where sales_channel is not null),
    count(*) filter(where category_code in ('utilities','operations')),
    max(updated_at)
  into v_tx_count,v_tx_days,v_tx_span,v_digital_count,v_channel_count,v_utilities_count,v_latest_tx
  from public.transactions where business_id=v_business_id and ledger_status='confirmed';
  select count(*) into v_closing_count from public.daily_closings where business_id=v_business_id and status='closed';
  select count(*) filter(where d.doc_type='nib'),
    count(*) filter(where d.doc_type='nib' and e.owner_review_status in ('owner_confirmed','owner_corrected')),
    count(*) filter(where d.doc_type='nib' and verification.status='verified'),
    count(*) filter(where d.doc_type in ('halal','pirt','izin_edar','sertifikat','training')),
    max(d.updated_at)
  into v_nib_count,v_nib_confirmed,v_nib_verified,v_certificate_count,v_latest_doc
  from public.documents d
  left join public.document_versions doc_version on doc_version.document_id=d.id and doc_version.version=d.current_version
  left join public.document_extractions e on e.document_version_id=doc_version.id
  left join public.document_verifications verification on verification.document_version_id=doc_version.id
  where d.business_id=v_business_id and d.status not in ('archived','superseded');
  select (case when coalesce(profile.nama_usaha,business.name) is not null then 1 else 0 end
    +case when coalesce(profile.sektor_usaha,business.sector) is not null then 1 else 0 end
    +case when coalesce(profile.lokasi,business.location) is not null then 1 else 0 end
    +case when coalesce(profile.phone,business.phone,profile.email) is not null then 1 else 0 end)
  into v_profile_count from public.businesses business left join public.profiles profile on profile.id=coalesce(v_profile_id,business.legacy_profile_id)
  where business.id=v_business_id;
  v_profile_count:=coalesce(v_profile_count,0);

  v_input_hash:=md5(concat_ws('|',v_rule_id,v_tx_count,v_tx_days,v_tx_span,v_digital_count,v_channel_count,v_utilities_count,v_closing_count,v_nib_count,v_nib_confirmed,v_nib_verified,v_certificate_count,v_profile_count,coalesce(v_latest_tx::text,''),coalesce(v_latest_doc::text,'')));
  select id into v_existing from public.readiness_score_snapshots where business_id=v_business_id and rule_set_id=v_rule_id and input_hash=v_input_hash order by calculated_at desc limit 1;
  if v_existing is not null then return jsonb_build_object('snapshotId',v_existing,'idempotent',true); end if;

  v_tx_score:=case when v_tx_count=0 then null else least(15,v_tx_count*1.5)+least(20,v_tx_days*2)+least(10,v_tx_span) end;
  v_nib_score:=case when v_nib_count=0 then null when v_nib_verified>0 then 25 when v_nib_confirmed>0 then 18 else 8 end;
  v_total:=coalesce(v_tx_score,0)+coalesce(v_nib_score,0)
    +(case when v_tx_count=0 then 0 when v_utilities_count>0 then 6 else 0 end)
    +(case when v_tx_count=0 then 0 when v_channel_count>0 then 6 else 0 end)
    +(case when v_tx_count=0 then 0 when v_digital_count>0 then 6 else 0 end)
    +(v_profile_count*1.5)+(case when v_certificate_count>0 then 6 else 0 end);
  insert into public.readiness_score_snapshots(business_id,rule_set_id,total_score,input_hash,summary,calculated_by)
  values(v_business_id,v_rule_id,round(v_total,2),v_input_hash,jsonb_build_object('ruleVersion',v_rule_version,'disclaimer','Kesiapan Data Usaha bukan penilaian resmi atau jaminan pembiayaan.'),v_user_id)
  returning id into v_snapshot_id;

  insert into public.readiness_score_components(snapshot_id,component_key,component_status,raw_score,weight,weighted_score,max_score,confidence,freshness,evidence_count,explanation,next_action,quality_tier,evidence) values
  (v_snapshot_id,'transaction_recording',case when v_tx_count=0 then 'data_insufficient' else 'scored' end,v_tx_score,45,v_tx_score,45,case when v_tx_count=0 then 0 else least(1,v_tx_count/20.0) end,case when v_latest_tx>=now()-interval '30 days' then 'fresh' when v_latest_tx>=now()-interval '90 days' then 'aging' else 'stale' end,v_tx_count,case when v_tx_count=0 then 'Belum ada transaksi yang dikonfirmasi.' else format('%s transaksi pada %s hari aktif.',v_tx_count,v_tx_days) end,case when v_tx_days<20 then 'Catat transaksi yang benar-benar terjadi secara rutin.' else null end,case when v_closing_count>0 then 'confirmed' else 'recorded' end,jsonb_build_object('transactionCount',v_tx_count,'activityDays',v_tx_days,'durationDays',v_tx_span,'dailyClosings',v_closing_count)),
  (v_snapshot_id,'basic_legality',case when v_nib_count=0 then 'data_insufficient' else 'scored' end,v_nib_score,25,v_nib_score,25,case when v_nib_verified>0 then 1 when v_nib_confirmed>0 then .75 when v_nib_count>0 then .4 else 0 end,case when v_latest_doc>=now()-interval '90 days' then 'fresh' else 'stale' end,v_nib_count,case when v_nib_count=0 then 'NIB belum tersedia sebagai bukti legalitas dasar.' when v_nib_verified>0 then 'NIB telah diperiksa oleh petugas berwenang.' when v_nib_confirmed>0 then 'Data NIB telah dikonfirmasi pemilik, tetapi bukan verifikasi keaslian.' else 'NIB tersimpan dan masih perlu diperiksa.' end,case when v_nib_count=0 then 'Unggah NIB yang masih berlaku.' when v_nib_confirmed=0 then 'Periksa hasil baca NIB dan konfirmasi datanya.' else null end,case when v_nib_verified>0 then 'verified' when v_nib_confirmed>0 then 'confirmed' else 'recorded' end,jsonb_build_object('documentCount',v_nib_count,'ownerConfirmed',v_nib_confirmed,'verified',v_nib_verified)),
  (v_snapshot_id,'utilities',case when v_tx_count=0 then 'data_insufficient' else 'scored' end,case when v_tx_count=0 then null when v_utilities_count>0 then 6 else 0 end,6,case when v_tx_count=0 then null when v_utilities_count>0 then 6 else 0 end,6,case when v_tx_count=0 then 0 else .6 end,case when v_latest_tx>=now()-interval '30 days' then 'fresh' else 'stale' end,v_utilities_count,case when v_utilities_count>0 then 'Biaya rutin usaha sudah mulai tercatat.' else 'Belum ada biaya listrik, air, atau internet usaha yang tercatat.' end,case when v_utilities_count=0 then 'Catat biaya rutin usaha saat benar-benar dibayar.' else null end,'recorded',jsonb_build_object('transactionCount',v_utilities_count)),
  (v_snapshot_id,'digital_footprint',case when v_tx_count=0 then 'data_insufficient' else 'scored' end,case when v_tx_count=0 then null when v_channel_count>0 then 6 else 0 end,6,case when v_tx_count=0 then null when v_channel_count>0 then 6 else 0 end,6,case when v_tx_count=0 then 0 else .5 end,case when v_latest_tx>=now()-interval '30 days' then 'fresh' else 'stale' end,v_channel_count,case when v_channel_count>0 then 'Asal pesanan sudah dicatat pada transaksi.' else 'Asal pesanan atau kanal penjualan belum dicatat.' end,case when v_channel_count=0 then 'Isi asal pesanan pada transaksi berikutnya.' else null end,'recorded',jsonb_build_object('transactionCount',v_channel_count)),
  (v_snapshot_id,'digital_payments',case when v_tx_count=0 then 'data_insufficient' else 'scored' end,case when v_tx_count=0 then null when v_digital_count>0 then 6 else 0 end,6,case when v_tx_count=0 then null when v_digital_count>0 then 6 else 0 end,6,case when v_tx_count=0 then 0 else .8 end,case when v_latest_tx>=now()-interval '30 days' then 'fresh' else 'stale' end,v_digital_count,case when v_digital_count>0 then 'Pembayaran digital tercatat pada transaksi.' else 'Belum ada pembayaran QRIS, transfer, atau dompet digital yang tercatat.' end,case when v_digital_count=0 then 'Pilih cara pembayaran digital saat memang digunakan.' else null end,'recorded',jsonb_build_object('transactionCount',v_digital_count)),
  (v_snapshot_id,'complete_profile','scored',v_profile_count*1.5,6,v_profile_count*1.5,6,v_profile_count/4.0,'fresh',v_profile_count,format('%s dari 4 informasi dasar usaha telah terisi.',v_profile_count),case when v_profile_count<4 then 'Lengkapi profil usaha.' else null end,'confirmed',jsonb_build_object('completedFields',v_profile_count)),
  (v_snapshot_id,'certificates_training','scored',case when v_certificate_count>0 then 6 else 0 end,6,case when v_certificate_count>0 then 6 else 0 end,6,case when v_certificate_count>0 then .6 else .2 end,case when v_latest_doc>=now()-interval '365 days' then 'fresh' else 'stale' end,v_certificate_count,case when v_certificate_count>0 then 'Sertifikat atau izin pendukung tersimpan.' else 'Belum ada sertifikat atau pelatihan pendukung yang dicatat.' end,case when v_certificate_count=0 then 'Unggah hanya sertifikat yang benar-benar dimiliki.' else null end,'recorded',jsonb_build_object('documentCount',v_certificate_count));

  insert into public.business_missions(business_id,mission_id,status,progress,started_at,completed_at)
  select v_business_id,mission.id,
    case mission.code when 'record_transactions' then case when v_tx_count>0 then 'completed' else 'available' end
      when 'upload_nib' then case when v_nib_count>0 then 'completed' else 'available' end
      when 'complete_profile' then case when v_profile_count=4 then 'completed' else 'available' end
      when 'use_digital_payment' then case when v_digital_count>0 then 'completed' else 'available' end
      when 'record_utilities' then case when v_utilities_count>0 then 'completed' else 'available' end
      when 'record_sales_channel' then case when v_channel_count>0 then 'completed' else 'available' end
      when 'upload_certificate' then case when v_certificate_count>0 then 'completed' else 'available' end end,
    jsonb_build_object('evidenceCheckedAt',now()),now(),
    case mission.code when 'record_transactions' then case when v_tx_count>0 then now() end when 'upload_nib' then case when v_nib_count>0 then now() end when 'complete_profile' then case when v_profile_count=4 then now() end when 'use_digital_payment' then case when v_digital_count>0 then now() end when 'record_utilities' then case when v_utilities_count>0 then now() end when 'record_sales_channel' then case when v_channel_count>0 then now() end when 'upload_certificate' then case when v_certificate_count>0 then now() end end
  from public.missions mission where mission.status='active'
  on conflict(business_id,mission_id) do update set status=case when public.business_missions.status='dismissed' and excluded.status<>'completed' then 'dismissed' else excluded.status end,progress=excluded.progress,completed_at=case when excluded.status='completed' then coalesce(public.business_missions.completed_at,excluded.completed_at) else null end,updated_at=now();
  update public.profiles set readiness_score=round(v_total,2),updated_at=now() where id=coalesce(v_profile_id,(select legacy_profile_id from public.businesses where id=v_business_id));
  insert into public.audit_events(actor_user_id,actor_type,business_id,action,target_type,target_id,metadata)
  values(v_user_id,'user',v_business_id,'READINESS_SNAPSHOT_CREATED','readiness_score_snapshot',v_snapshot_id::text,jsonb_build_object('ruleVersion',v_rule_version,'score',round(v_total,2)));
  return jsonb_build_object('snapshotId',v_snapshot_id,'idempotent',false);
end $$;

create or replace function private.business_role(target_business_id uuid)
returns text
language sql
stable security definer
set search_path = ''
as $$
  select coalesce(
    (select member.role
    from public.business_members as member
    where member.business_id = target_business_id
      and member.user_id = (select auth.uid())
      and member.status = 'active'
    order by case member.role when 'owner' then 1 when 'manager' then 2 when 'staff' then 3 else 4 end
    limit 1),
    case when exists (
      select 1 from public.businesses as business
      where business.id = target_business_id
        and business.legacy_profile_id = (select auth.uid())
        and business.status = 'active'
    ) then 'owner' end
  );
$$;

commit;

