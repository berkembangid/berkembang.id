import { NextResponse } from "next/server";
import { z } from "zod";
import { getEffectivePortalRole } from "@/lib/auth/authorization";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const uuid = z.uuid();
const shortText = z.string().trim().min(1).max(200);
const optionalText = z.string().trim().max(320).optional();

const operationSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("create_admin"), email: z.email(), password: z.string().min(8).max(128), name: shortText }),
  z.object({ action: z.literal("deactivate_admin"), profileId: uuid }),
  z.object({
    action: z.literal("save_institution"),
    source: z.enum(["institutions", "profiles"]),
    id: uuid.optional(),
    name: shortText,
    type: shortText,
    programsCount: z.number().int().min(0).max(10000),
    active: z.boolean(),
    contactName: optionalText,
    contactEmail: z.union([z.literal(""), z.email()]).optional(),
    location: optionalText,
  }),
  z.object({ action: z.literal("deactivate_institution"), source: z.enum(["institutions", "profiles"]), id: uuid }),
  z.object({ action: z.literal("set_institution_active"), source: z.enum(["institutions", "profiles"]), id: uuid, active: z.boolean() }),
  z.object({
    action: z.literal("save_mitra"),
    id: uuid.optional(),
    name: shortText,
    type: shortText,
    coverage: z.string().trim().max(300),
    umkmManaged: z.number().int().min(0).max(10000000),
    active: z.boolean(),
  }),
  z.object({ action: z.literal("delete_mitra"), id: uuid }),
  z.object({
    action: z.literal("publish_rules"),
    version: z.string().trim().regex(/^v[0-9]+$/).max(32),
    weights: z.object({
      konsistensi: z.number().min(0).max(100),
      kas: z.number().min(0).max(100),
      legalitas: z.number().min(0).max(100),
      stabilitas: z.number().min(0).max(100),
    }),
    thresholds: z.object({
      maxDailyExpense: z.number().int().min(0),
      maxDailyIncome: z.number().int().min(0),
    }),
  }),
  z.object({
    action: z.literal("save_umkm"),
    id: uuid.optional(),
    ownerName: shortText,
    businessName: shortText,
    sector: shortText,
    location: z.string().trim().max(200),
    email: z.union([z.literal(""), z.email()]).optional(),
    score: z.number().min(0).max(100),
    consistencyDays: z.number().int().min(0).max(100000),
    status: z.enum(["active", "inactive", "pending", "suspended"]),
    reason: z.string().trim().max(500).optional(),
  }),
  z.object({ action: z.literal("set_umkm_score"), id: uuid, score: z.number().min(0).max(100), reason: z.string().trim().min(1).max(500) }),
]);

type AdminClient = ReturnType<typeof createServiceRoleClient>;

async function writeAudit(
  admin: AdminClient,
  actorUserId: string,
  actorEmail: string | null,
  action: string,
  targetType: string,
  targetId: string | null,
  metadata: Record<string, string | number | boolean | null>,
) {
  const event = await admin
    .from("audit_events")
    .insert({
      actor_user_id: actorUserId,
      actor_type: "platform_admin",
      action,
      target_type: targetType,
      target_id: targetId,
      metadata,
      status: "success",
    })
    .select("id")
    .single();
  if (event.error) throw new Error("AUDIT_WRITE_FAILED");

  const { error } = await admin.from("audit_logs").insert({
    audit_event_id: event.data.id,
    user_email: actorEmail,
    action,
    details: JSON.stringify({ targetType, targetId, ...metadata }),
    status: "success",
  });
  if (error) throw new Error("AUDIT_COMPAT_WRITE_FAILED");
}

function ensureNoError(error: { message: string } | null, code: string) {
  if (error) throw new Error(code);
}

export async function POST(request: Request) {
  const sessionClient = await createServerSupabaseClient();
  const {
    data: { user },
  } = await sessionClient.auth.getUser();
  if (!user) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });

  try {
    if ((await getEffectivePortalRole(sessionClient, user.id)) !== "admin") {
      return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    }
  } catch {
    return NextResponse.json({ error: "AUTHORIZATION_UNAVAILABLE" }, { status: 503 });
  }

  const parsed = operationSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "INVALID_ADMIN_OPERATION" }, { status: 400 });
  }

  try {
    const admin = createServiceRoleClient();
    const operation = parsed.data;
    let resultId: string | undefined;

    switch (operation.action) {
      case "create_admin": {
        const created = await admin.auth.admin.createUser({
          email: operation.email,
          password: operation.password,
          email_confirm: true,
          user_metadata: { name: operation.name },
        });
        if (created.error || !created.data.user) throw new Error("ADMIN_AUTH_CREATE_FAILED");
        const newUserId = created.data.user.id;
        try {
          const profile = await admin.from("profiles").upsert({
            id: newUserId,
            auth_user_id: newUserId,
            email: operation.email,
            name: operation.name,
            role: "admin",
            status: "active",
          });
          ensureNoError(profile.error, "ADMIN_PROFILE_CREATE_FAILED");
          const authority = await admin.from("platform_admins").insert({
            user_id: newUserId,
            profile_id: newUserId,
            status: "active",
            source: "server_provisioning",
            provisioned_by: user.id,
          });
          ensureNoError(authority.error, "ADMIN_AUTHORITY_CREATE_FAILED");
        } catch (error) {
          await admin.auth.admin.deleteUser(newUserId);
          throw error;
        }
        resultId = newUserId;
        await writeAudit(admin, user.id, user.email ?? null, "CREATE_ADMIN_ACCOUNT", "platform_admin", newUserId, { email: operation.email });
        break;
      }
      case "deactivate_admin": {
        const authority = await admin
          .from("platform_admins")
          .select("user_id")
          .eq("profile_id", operation.profileId)
          .eq("status", "active")
          .maybeSingle();
        ensureNoError(authority.error, "ADMIN_AUTHORITY_LOOKUP_FAILED");
        if (!authority.data) throw new Error("ADMIN_NOT_FOUND");
        if (authority.data.user_id === user.id) throw new Error("CANNOT_DEACTIVATE_SELF");
        const activeAdmins = await admin.from("platform_admins").select("user_id", { count: "exact", head: true }).eq("status", "active");
        ensureNoError(activeAdmins.error, "ADMIN_COUNT_FAILED");
        if ((activeAdmins.count ?? 0) <= 1) throw new Error("CANNOT_DEACTIVATE_LAST_ADMIN");
        ensureNoError((await admin.from("platform_admins").update({ status: "revoked", updated_at: new Date().toISOString() }).eq("user_id", authority.data.user_id)).error, "ADMIN_DEACTIVATE_FAILED");
        ensureNoError((await admin.from("profiles").update({ status: "inactive" }).eq("id", operation.profileId)).error, "ADMIN_PROFILE_DEACTIVATE_FAILED");
        const banned = await admin.auth.admin.updateUserById(authority.data.user_id, { ban_duration: "876000h" });
        if (banned.error) throw new Error("ADMIN_AUTH_DEACTIVATE_FAILED");
        await writeAudit(admin, user.id, user.email ?? null, "DEACTIVATE_ADMIN_ACCOUNT", "platform_admin", authority.data.user_id, {});
        break;
      }
      case "set_institution_active": {
        if (operation.source === "institutions") {
          ensureNoError((await admin.from("institutions").update({ active: operation.active, status: operation.active ? "active" : "inactive" }).eq("id", operation.id)).error, "INSTITUTION_STATUS_UPDATE_FAILED");
        } else {
          ensureNoError((await admin.from("profiles").update({ status: operation.active ? "active" : "inactive" }).eq("id", operation.id)).error, "INSTITUTION_PROFILE_STATUS_UPDATE_FAILED");
        }
        await writeAudit(admin, user.id, user.email ?? null, "UPDATE_INSTITUTION_STATUS", operation.source, operation.id, { active: operation.active });
        break;
      }
      case "save_institution": {
        if (operation.source === "profiles") {
          if (!operation.id) throw new Error("INSTITUTION_PROFILE_ID_REQUIRED");
          ensureNoError((await admin.from("profiles").update({
            nama_institusi: operation.name,
            name: operation.contactName || operation.name,
            jenis_institusi: operation.type,
            nama_contact: operation.contactName || null,
            email: operation.contactEmail || null,
            lokasi: operation.location || null,
          }).eq("id", operation.id)).error, "INSTITUTION_PROFILE_UPDATE_FAILED");
          resultId = operation.id;
        } else if (operation.id) {
          ensureNoError((await admin.from("institutions").update({
            name: operation.name,
            type: operation.type,
            programs_count: operation.programsCount,
            active: operation.active,
            status: operation.active ? "active" : "inactive",
            contact_name: operation.contactName || null,
            contact_email: operation.contactEmail || null,
            location: operation.location || null,
          }).eq("id", operation.id)).error, "INSTITUTION_UPDATE_FAILED");
          resultId = operation.id;
        } else {
          const created = await admin.from("institutions").insert({
            name: operation.name,
            type: operation.type,
            programs_count: operation.programsCount,
            active: operation.active,
            status: operation.active ? "active" : "inactive",
            contact_name: operation.contactName || null,
            contact_email: operation.contactEmail || null,
            location: operation.location || null,
          }).select("id").single();
          ensureNoError(created.error, "INSTITUTION_CREATE_FAILED");
          resultId = created.data?.id;
        }
        await writeAudit(admin, user.id, user.email ?? null, "SAVE_INSTITUTION", operation.source, resultId ?? null, { name: operation.name });
        break;
      }
      case "deactivate_institution": {
        if (operation.source === "institutions") {
          ensureNoError((await admin.from("institutions").update({ active: false, status: "archived" }).eq("id", operation.id)).error, "INSTITUTION_DEACTIVATE_FAILED");
        } else {
          ensureNoError((await admin.from("profiles").update({ status: "inactive" }).eq("id", operation.id)).error, "INSTITUTION_PROFILE_DEACTIVATE_FAILED");
        }
        await writeAudit(admin, user.id, user.email ?? null, "DEACTIVATE_INSTITUTION", operation.source, operation.id, {});
        break;
      }
      case "save_mitra": {
        if (operation.id) {
          ensureNoError((await admin.from("mitra").update({
            name: operation.name,
            type: operation.type,
            coverage: operation.coverage,
            umkm_managed: operation.umkmManaged,
            active: operation.active,
          }).eq("id", operation.id)).error, "MITRA_UPDATE_FAILED");
          resultId = operation.id;
        } else {
          const created = await admin.from("mitra").insert({
            name: operation.name,
            type: operation.type,
            coverage: operation.coverage,
            umkm_managed: operation.umkmManaged,
            active: operation.active,
          }).select("id").single();
          ensureNoError(created.error, "MITRA_CREATE_FAILED");
          resultId = created.data?.id;
        }
        await writeAudit(admin, user.id, user.email ?? null, "SAVE_MITRA", "mitra", resultId ?? null, { name: operation.name });
        break;
      }
      case "delete_mitra": {
        ensureNoError((await admin.from("mitra").delete().eq("id", operation.id)).error, "MITRA_DELETE_FAILED");
        await writeAudit(admin, user.id, user.email ?? null, "DELETE_MITRA", "mitra", operation.id, {});
        break;
      }
      case "publish_rules": {
        const total = Object.values(operation.weights).reduce((sum, weight) => sum + weight, 0);
        if (total !== 100) throw new Error("RULE_WEIGHTS_MUST_TOTAL_100");
        ensureNoError((await admin.from("readiness_rule_sets").update({ status: "retired" }).eq("status", "published")).error, "RULE_RETIRE_FAILED");
        ensureNoError((await admin.from("rules_config").update({ is_active: false }).eq("is_active", true)).error, "LEGACY_RULE_RETIRE_FAILED");
        const canonical = await admin.from("readiness_rule_sets").insert({
          version: operation.version,
          status: "published",
          weights: operation.weights,
          thresholds: operation.thresholds,
          rules: { source: "admin_rules_ui" },
          created_by: user.id,
          published_by: user.id,
          published_at: new Date().toISOString(),
        }).select("id").single();
        ensureNoError(canonical.error, "RULE_PUBLISH_FAILED");
        ensureNoError((await admin.from("rules_config").insert({
          rule_set_id: canonical.data?.id,
          version: operation.version,
          weights: operation.weights,
          thresholds: operation.thresholds,
          is_active: true,
          created_by: user.email ?? user.id,
        })).error, "LEGACY_RULE_PUBLISH_FAILED");
        resultId = canonical.data?.id;
        await writeAudit(admin, user.id, user.email ?? null, "PUBLISH_RULE_SET", "readiness_rule_set", resultId ?? null, { version: operation.version });
        break;
      }
      case "set_umkm_score": {
        ensureNoError((await admin.from("profiles").update({ readiness_score: operation.score }).eq("id", operation.id)).error, "UMKM_SCORE_UPDATE_FAILED");
        await writeAudit(admin, user.id, user.email ?? null, "OVERRIDE_SCORE", "profile", operation.id, { score: operation.score, reason: operation.reason });
        break;
      }
      case "save_umkm": {
        if (operation.id) {
          ensureNoError((await admin.from("profiles").update({
            name: operation.ownerName,
            nama_usaha: operation.businessName,
            sektor_usaha: operation.sector,
            lokasi: operation.location,
            email: operation.email || null,
            readiness_score: operation.score,
            konsistensi_days: operation.consistencyDays,
            status: operation.status,
            role: "umkm",
          }).eq("id", operation.id)).error, "UMKM_UPDATE_FAILED");
          await admin.from("businesses").update({
            name: operation.businessName,
            sector: operation.sector,
            location: operation.location,
            status: operation.status === "active" ? "active" : "inactive",
          }).eq("legacy_profile_id", operation.id);
          resultId = operation.id;
        } else {
          const profile = await admin.from("profiles").insert({
            name: operation.ownerName,
            nama_usaha: operation.businessName,
            sektor_usaha: operation.sector,
            lokasi: operation.location,
            email: operation.email || null,
            readiness_score: operation.score,
            konsistensi_days: operation.consistencyDays,
            status: operation.status,
            role: "umkm",
          }).select("id").single();
          ensureNoError(profile.error, "UMKM_CREATE_FAILED");
          resultId = profile.data?.id;
          if (resultId) {
            ensureNoError((await admin.from("businesses").insert({
              legacy_profile_id: resultId,
              name: operation.businessName,
              sector: operation.sector,
              location: operation.location,
              status: operation.status === "active" ? "active" : "inactive",
            })).error, "UMKM_BUSINESS_CREATE_FAILED");
          }
        }
        await writeAudit(admin, user.id, user.email ?? null, "SAVE_UMKM", "profile", resultId ?? null, { businessName: operation.businessName, reason: operation.reason ?? null });
        break;
      }
    }

    return NextResponse.json({ ok: true, id: resultId });
  } catch (error) {
    const code = error instanceof Error ? error.message : "ADMIN_OPERATION_FAILED";
    return NextResponse.json({ error: code }, { status: 500 });
  }
}
