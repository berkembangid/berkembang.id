"use client";

/**
 * Wizard kondisi awal usaha: enam pertanyaan, satu pertanyaan per layar.
 *
 * Tanpa ini "Kondisi Usaha" tidak bisa dijawab jujur, karena saldo kas dan
 * nilai alat tidak dimulai dari nol. Setiap pertanyaan boleh dilewati dengan
 * nilai kosong; yang penting pemilik sampai ke layar terakhir.
 *
 * Layar yang sama dipakai untuk memperbaikinya. Pertanyaannya identik, jadi
 * membuat layar koreksi tersendiri berarti dua tempat menyimpan kalimat yang
 * sama persis. Bedanya hanya: jawabannya sudah terisi, kata "sekarang" diganti
 * tanggal saat pemilik mulai mencatat, dan sebelum menyimpan ia diberi tahu
 * apa akibatnya lalu diminta menuliskan alasannya.
 */

import { useState } from "react";
import { ArrowLeft, ArrowRight, CheckCircle2, LoaderCircle, Plus, X } from "lucide-react";
import {
  AccountingClientError,
  saveOpeningBalancesClient,
} from "@/modules/accounting/accounting-client";
import {
  assetCategories,
  assetCategoryLabels,
  lenderTypeLabels,
  lenderTypes,
  type AssetCategory,
  type LenderType,
} from "@/modules/accounting/period-schema";
import { InlineMoneyInput, MoneyInput } from "@/components/warung/MoneyInput";
import {
  defaultUsefulLifeMonths,
  inventoryKindHelpers,
  inventoryKindLabels,
  inventoryKinds,
  type InventoryKind,
} from "@/modules/accounting/period-schema";
import { formatIdr } from "@/modules/accounting/warung";
import { useConfirm } from "@/components/ui/confirm";
import { notifySuccess } from "@/lib/notify";
import { jakartaDate } from "@/modules/ledger/capture-schema";

type InventoryItemRow = { name: string; amount: number | null };
type InventoryGroup = { items: InventoryItemRow[]; other: number | null };

/** Sama dengan batas di skema dan di `save_opening_balances`. */
const MAX_INVENTORY_ITEMS = 20;

type ReceivableRow = { name: string; amount: number | null };
type PayableRow = { name: string; amount: number | null; lenderType: LenderType; installment: number | null };
type AssetRow = {
  name: string;
  cost: number | null;
  acquiredOn: string;
  category: AssetCategory;
  /** Umur ekonomis dalam TAHUN. Bulan adalah satuan pembukuan, bukan satuan orang. */
  years: string;
  salvage: number | null;
};

/**
 * Menjelaskan penyusutan dengan angka pemiliknya sendiri.
 *
 * Menyebut « metode garis lurus » tidak menolong siapa pun yang belum pernah
 * belajar akuntansi. Yang menolong adalah melihat hitungannya berjalan:
 * berapa yang menyusut, dari angka mana, dibagi berapa lama, dan berapa yang
 * tersisa di ujungnya. Ketika angkanya bergerak mengikuti isian, metodenya
 * terjelaskan sendiri tanpa perlu disebut namanya.
 */
function depreciationNote(row: AssetRow): string | null {
  const cost = row.cost ?? 0;
  const salvage = row.salvage ?? 0;
  const months = (Number(row.years) || 0) * 12;
  if (cost <= 0 || months <= 0) return null;
  if (salvage >= cost) return "Perkiraan harga jual nanti harus lebih kecil dari harga belinya.";
  const monthly = Math.trunc((cost - salvage) / months);
  return (
    `Nilainya turun sekitar ${formatIdr(monthly)} tiap bulan: ` +
    `${formatIdr(cost)} dikurangi perkiraan harga jual nanti ${formatIdr(salvage)}, ` +
    `dibagi ${months} bulan. Setelah ${row.years} tahun, nilainya berhenti di ${formatIdr(salvage)} — ` +
    `tidak pernah menjadi nol selama Anda masih memperkirakan alatnya laku.`
  );
}

const inputClass =
  "min-h-11 w-full rounded-xl border border-[#d5dfe9] bg-white px-3 text-sm font-medium text-[#1b2a3a] outline-none focus:border-[#0b5f86]";
const labelClass = "block text-xs font-bold text-[#1b2a3a]";
const helperClass = "mt-1 text-[11px] leading-relaxed text-[#6e859e]";

function amount(value: number | null) {
  return value ?? 0;
}

export function OpeningBalanceWizard({
  onDone,
  onSkip,
}: {
  onDone: () => void;
  onSkip?: () => void;
  /** Jawaban lama; kehadirannya yang menentukan wizard jadi layar koreksi. */
}) {
  const { confirm } = useConfirm();
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // Selalu kosong: kondisi awal diisi sekali, jadi tidak ada jawaban lama yang
  // perlu dimuat kembali. Salah ketik diperbaiki lewat catat transaksi, bukan
  // dengan membuka kembali layar ini.
  const [startDate, setStartDate] = useState(jakartaDate());
  const [cash, setCash] = useState<number | null>(null);
  const [bank, setBank] = useState<number | null>(null);
  // Tiga jenis persediaan, bukan satu. Bagi usaha yang mengolah, bahan yang
  // belum disentuh dan barang yang tinggal dijual punya arti yang sama sekali
  // berbeda -- yang pertama modal yang belum bekerja, yang terakhir uang yang
  // tinggal diambil. Satu angka gabungan menyembunyikan perbedaan itu.
  const [inventory, setInventory] = useState<Record<InventoryKind, InventoryGroup>>({
    bahan_baku: { items: [], other: null },
    setengah_jadi: { items: [], other: null },
    barang_jadi: { items: [], other: null },
  });
  const kindTotal = (kind: InventoryKind) =>
    inventory[kind].items.reduce((sum, item) => sum + amount(item.amount), 0) + amount(inventory[kind].other);
  const inventoryTotal = inventoryKinds.reduce((sum, kind) => sum + kindTotal(kind), 0);

  function editKind(kind: InventoryKind, change: (group: InventoryGroup) => InventoryGroup) {
    setInventory((current) => ({ ...current, [kind]: change(current[kind]) }));
  }
  const [receivables, setReceivables] = useState<ReceivableRow[]>([]);
  const [payables, setPayables] = useState<PayableRow[]>([]);
  const [assets, setAssets] = useState<AssetRow[]>([]);

  const whenLabel = "sekarang";

  const receivableTotal = receivables.reduce((sum, row) => sum + amount(row.amount), 0);
  const payableTotal = payables.reduce((sum, row) => sum + amount(row.amount), 0);
  const assetTotal = assets.reduce((sum, row) => sum + amount(row.cost), 0);
  const ownedTotal = amount(cash) + amount(bank) + receivableTotal + inventoryTotal + assetTotal;
  const netWorth = ownedTotal - payableTotal;

  /**
   * Satu-satunya tindakan di aplikasi ini yang benar-benar tidak bisa diulang.
   *
   * Kondisi awal diisi sekali seumur usaha; tidak ada layar yang membukanya
   * kembali, dan operasi koreksinya sudah ditutup sejak `0064`. Tombolnya
   * sendiri hanya berbunyi "Mulai" -- kata yang terdengar seperti awal sebuah
   * proses, bukan seperti akhir dari satu-satunya kesempatan mengisinya.
   *
   * Jadi yang ditanyakan bukan "Anda yakin?" melainkan angka yang barusan
   * disusun, supaya yang dibaca terakhir kali adalah isinya, bukan peringatan.
   */
  const submit = async () => {
    const yes = await confirm({
      title: "Simpan kondisi awal usaha?",
      description: `Milik usaha ${formatIdr(ownedTotal)}, masih harus dibayar ${formatIdr(payableTotal)}, jadi modal usaha ${formatIdr(netWorth)} per ${startDate}. Kondisi awal hanya diisi sekali. Kalau nanti ada yang keliru, perbaikannya lewat catat pemasukan atau pengeluaran biasa -- layar ini tidak terbuka lagi.`,
      confirmLabel: "Ya, simpan",
      cancelLabel: "Periksa lagi",
    });
    if (!yes) return;

    setBusy(true);
    setError("");
    try {
      const payload = {
        startDate,
        cashIdr: amount(cash),
        bankIdr: amount(bank),
        // Hanya yang benar-benar diisi yang dikirim; totalnya dijumlahkan di
        // basis data, bukan di sini.
        // Kategori yang seluruhnya kosong tidak dikirim; totalnya dijumlahkan
        // di basis data dari barang ditambah sisanya, bukan di sini.
        inventory: inventoryKinds
          .filter((kind) => kindTotal(kind) > 0)
          .map((kind) => ({
            kind,
            items: inventory[kind].items
              .filter((item) => item.name.trim() !== "" && amount(item.amount) > 0)
              .map((item) => ({ name: item.name.trim(), amountIdr: amount(item.amount) })),
            otherAmountIdr: amount(inventory[kind].other),
          })),
        receivables: receivables
          .filter((row) => row.name.trim() && amount(row.amount) > 0)
          .map((row) => ({ name: row.name.trim(), amountIdr: amount(row.amount) })),
        payables: payables
          .filter((row) => row.name.trim() && amount(row.amount) > 0)
          .map((row) => ({
            name: row.name.trim(),
            amountIdr: amount(row.amount),
            lenderType: row.lenderType,
            monthlyInstallmentIdr: amount(row.installment) > 0 ? amount(row.installment) : null,
          })),
        assets: assets
          .filter((row) => row.name.trim() && amount(row.cost) > 0)
          .map((row) => ({
            name: row.name.trim(),
            costIdr: amount(row.cost),
            acquiredOn: row.acquiredOn || startDate,
            category: row.category,
            // Pemilik menjawab dalam tahun; pembukuan menghitung dalam bulan.
            usefulLifeMonths: (Number(row.years) || defaultUsefulLifeMonths[row.category] / 12) * 12,
            salvageValueIdr: amount(row.salvage),
          })),
        notes: null,
      };
      await saveOpeningBalancesClient(payload);
      notifySuccess("Kondisi awal usaha tersimpan", {
        description: `Modal usaha Anda mulai dihitung dari ${formatIdr(netWorth)} per ${startDate}.`,
        duration: 7000,
      });
      onDone();
    } catch (cause) {
      setError(
        cause instanceof AccountingClientError ? cause.message : "Kondisi awal usaha belum tersimpan. Coba lagi.",
      );
    } finally {
      setBusy(false);
    }
  };

  const steps = [
    {
      title: `Uang di laci ${whenLabel} berapa?`,
      helper: "Hitung uang tunai yang benar-benar ada di tempat usaha hari ini.",
      body: (
        <MoneyInput
          label="Uang tunai"
          value={cash}
          onChange={setCash}
          autoFocus
          helper="Boleh dikosongkan kalau belum sempat menghitung."
        />
      ),
    },
    {
      title: `Saldo rekening atau QRIS ${whenLabel} berapa?`,
      helper: "Uang usaha yang ada di bank, e-wallet, atau saldo QRIS.",
      body: (
        <MoneyInput
          label="Saldo rekening"
          value={bank}
          onChange={setBank}
          helper="Gabungkan saldo bank, e-wallet, dan QRIS yang dipakai untuk usaha."
        />
      ),
    },
    {
      title: "Ada yang masih berutang ke Anda?",
      helper: "Pelanggan yang sudah menerima barang tapi belum membayar.",
      body: (
        <div className="space-y-3">
          {receivables.map((row, index) => (
            <div key={index} className="flex gap-2">
              <input
                value={row.name}
                onChange={(event) =>
                  setReceivables((rows) => rows.map((item, i) => (i === index ? { ...item, name: event.target.value } : item)))
                }
                placeholder="Nama pelanggan"
                className={inputClass}
              />
              <div className="w-40 shrink-0">
                <InlineMoneyInput
                  ariaLabel="Sisa utang pelanggan"
                  value={row.amount}
                  onChange={(value) =>
                    setReceivables((rows) => rows.map((item, i) => (i === index ? { ...item, amount: value } : item)))
                  }
                />
              </div>
              <button
                type="button"
                aria-label="Hapus baris"
                onClick={() => setReceivables((rows) => rows.filter((_, i) => i !== index))}
                className="min-h-11 shrink-0 rounded-xl px-2 text-[#b4304a]"
              >
                <X size={16} />
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => setReceivables((rows) => [...rows, { name: "", amount: null }])}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-[#addcf4] bg-[#eef8fd] px-3 text-xs font-bold text-[#0b5f86]"
          >
            <Plus size={14} /> Tambah pelanggan
          </button>
          <p className={helperClass}>Total: {formatIdr(receivableTotal)}</p>
        </div>
      ),
    },
    {
      title: "Anda masih berutang ke siapa?",
      helper: "Pinjaman koperasi, bank, keluarga, atau belanja yang belum dibayar ke pemasok.",
      body: (
        <div className="space-y-3">
          {payables.map((row, index) => (
            <div key={index} className="space-y-2 rounded-xl border border-[#e3e9f0] p-3">
              <div className="flex gap-2">
                <input
                  value={row.name}
                  onChange={(event) =>
                    setPayables((rows) => rows.map((item, i) => (i === index ? { ...item, name: event.target.value } : item)))
                  }
                  placeholder="Nama pemberi pinjaman"
                  className={inputClass}
                />
                <button
                  type="button"
                  aria-label="Hapus baris"
                  onClick={() => setPayables((rows) => rows.filter((_, i) => i !== index))}
                  className="min-h-11 shrink-0 rounded-xl px-2 text-[#b4304a]"
                >
                  <X size={16} />
                </button>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <label className={labelClass}>
                  Sisa utang
                  <div className="mt-1.5">
                    <InlineMoneyInput
                      ariaLabel="Sisa utang"
                      value={row.amount}
                      onChange={(value) =>
                        setPayables((rows) => rows.map((item, i) => (i === index ? { ...item, amount: value } : item)))
                      }
                    />
                  </div>
                </label>
                <label className={labelClass}>
                  Cicilan per bulan
                  <div className="mt-1.5">
                    <InlineMoneyInput
                      ariaLabel="Cicilan per bulan"
                      value={row.installment}
                      onChange={(value) =>
                        setPayables((rows) => rows.map((item, i) => (i === index ? { ...item, installment: value } : item)))
                      }
                    />
                  </div>
                </label>
              </div>
              <select
                value={row.lenderType}
                onChange={(event) =>
                  setPayables((rows) =>
                    rows.map((item, i) => (i === index ? { ...item, lenderType: event.target.value as LenderType } : item)),
                  )
                }
                className={inputClass}
              >
                {lenderTypes.map((type) => (
                  <option key={type} value={type}>
                    {lenderTypeLabels[type]}
                  </option>
                ))}
              </select>
            </div>
          ))}
          <button
            type="button"
            onClick={() =>
              setPayables((rows) => [...rows, { name: "", amount: null, lenderType: "KOPERASI", installment: null }])
            }
            className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-[#addcf4] bg-[#eef8fd] px-3 text-xs font-bold text-[#0b5f86]"
          >
            <Plus size={14} /> Tambah utang
          </button>
          <p className={helperClass}>Total: {formatIdr(payableTotal)}</p>
        </div>
      ),
    },
    {
      title: `Stok barang ${whenLabel} kira-kira senilai berapa?`,
      helper: "Perkiraan kasar sudah cukup. Kosongkan yang tidak ada di usaha Anda.",
      body: (
        <div className="space-y-5">
          {inventoryKinds.map((kind) => (
            <div key={kind} className="rounded-xl border border-[#e3e9f0] p-3">
              <p className="text-xs font-bold text-[#1b2a3a]">{inventoryKindLabels[kind]}</p>
              <p className="mt-0.5 text-[11px] leading-relaxed text-[#6e859e]">{inventoryKindHelpers[kind]}</p>

              {inventory[kind].items.length > 0 && (
                <div className="mt-3 space-y-2">
                  {inventory[kind].items.map((item, index) => (
                    <div key={index} className="flex gap-2">
                      <input
                        value={item.name}
                        onChange={(event) =>
                          editKind(kind, (group) => ({
                            ...group,
                            items: group.items.map((row, i) => (i === index ? { ...row, name: event.target.value } : row)),
                          }))
                        }
                        placeholder="Nama barang"
                        className={inputClass}
                      />
                      <div className="w-36 shrink-0">
                        <InlineMoneyInput
                          ariaLabel={`Nilai ${inventoryKindLabels[kind]} baris ${index + 1}`}
                          value={item.amount}
                          onChange={(value) =>
                            editKind(kind, (group) => ({
                              ...group,
                              items: group.items.map((row, i) => (i === index ? { ...row, amount: value } : row)),
                            }))
                          }
                        />
                      </div>
                      <button
                        type="button"
                        aria-label="Hapus barang"
                        onClick={() => editKind(kind, (group) => ({ ...group, items: group.items.filter((_, i) => i !== index) }))}
                        className="min-h-11 shrink-0 rounded-xl px-2 text-[#b4304a]"
                      >
                        <X size={16} />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {inventory[kind].items.length < MAX_INVENTORY_ITEMS && (
                <button
                  type="button"
                  onClick={() => editKind(kind, (group) => ({ ...group, items: [...group.items, { name: "", amount: null }] }))}
                  className="mt-2 min-h-10 text-[11px] font-bold text-[#0b5f86]"
                >
                  + Sebutkan barangnya
                </button>
              )}

              <div className="mt-3">
                <MoneyInput
                  label={inventory[kind].items.length > 0 ? "Sisanya (digabung)" : "Perkiraan nilainya"}
                  value={inventory[kind].other}
                  onChange={(value) => editKind(kind, (group) => ({ ...group, other: value }))}
                  helper={
                    inventory[kind].items.length > 0
                      ? "Nilai barang lain yang tidak disebutkan satu per satu."
                      : "Kalau stoknya banyak, cukup isi totalnya. Sebutkan barangnya hanya bila perlu."
                  }
                  compact
                />
              </div>

              {kindTotal(kind) > 0 && (
                <p className="mt-2 text-[11px] font-bold text-[#1b2a3a]">
                  Jumlah {inventoryKindLabels[kind].toLowerCase()}: {formatIdr(kindTotal(kind))}
                </p>
              )}
            </div>
          ))}
          <p className="rounded-xl border border-[#e3e9f0] bg-[#f8fafc] p-3 text-xs font-bold text-[#1b2a3a]">
            Jumlah stok barang: {formatIdr(inventoryTotal)}
          </p>
        </div>
      ),
    },
    {
      title: "Alat usaha apa yang Anda punya?",
      helper: "Kulkas, etalase, gerobak, motor — yang dipakai bertahun-tahun.",
      body: (
        <div className="space-y-3">
          {assets.map((row, index) => (
            <div key={index} className="space-y-2 rounded-xl border border-[#e3e9f0] p-3">
              <div className="flex gap-2">
                <input
                  value={row.name}
                  onChange={(event) =>
                    setAssets((rows) => rows.map((item, i) => (i === index ? { ...item, name: event.target.value } : item)))
                  }
                  placeholder="Nama alat"
                  className={inputClass}
                />
                <button
                  type="button"
                  aria-label="Hapus baris"
                  onClick={() => setAssets((rows) => rows.filter((_, i) => i !== index))}
                  className="min-h-11 shrink-0 rounded-xl px-2 text-[#b4304a]"
                >
                  <X size={16} />
                </button>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <label className={labelClass}>
                  Harga beli dulu
                  <div className="mt-1.5">
                    <InlineMoneyInput
                      ariaLabel="Harga beli alat"
                      value={row.cost}
                      onChange={(value) =>
                        setAssets((rows) => rows.map((item, i) => (i === index ? { ...item, cost: value } : item)))
                      }
                    />
                  </div>
                </label>
                <label className={labelClass}>
                  Dibeli kapan
                  <input
                    type="date"
                    max={startDate}
                    value={row.acquiredOn}
                    onChange={(event) =>
                      setAssets((rows) => rows.map((item, i) => (i === index ? { ...item, acquiredOn: event.target.value } : item)))
                    }
                    className={`${inputClass} mt-1.5`}
                  />
                </label>
              </div>
              <select
                value={row.category}
                onChange={(event) => {
                  const category = event.target.value as AssetCategory;
                  setAssets((rows) =>
                    rows.map((item, i) =>
                      i === index
                        ? {
                            ...item,
                            category,
                            // Umur bawaan ikut berubah selama pemilik belum
                            // menggantinya sendiri; kalau sudah, angkanya
                            // miliknya dan tidak boleh ditimpa diam-diam.
                            years: item.years === String(defaultUsefulLifeMonths[item.category] / 12)
                              ? String(defaultUsefulLifeMonths[category] / 12)
                              : item.years,
                          }
                        : item,
                    ),
                  );
                }}
                className={inputClass}
              >
                {assetCategories.map((category) => (
                  <option key={category} value={category}>
                    {assetCategoryLabels[category]}
                  </option>
                ))}
              </select>

              <div className="grid gap-2 sm:grid-cols-2">
                <label className={labelClass}>
                  Masih bisa dipakai berapa lama?
                  <div className="mt-1.5 flex items-center gap-2">
                    <input
                      inputMode="numeric"
                      value={row.years}
                      onChange={(event) =>
                        setAssets((rows) =>
                          rows.map((item, i) => (i === index ? { ...item, years: event.target.value.replace(/\D/g, "").slice(0, 2) } : item)),
                        )
                      }
                      className={`${inputClass} w-20`}
                      aria-label="Umur ekonomis dalam tahun"
                    />
                    <span className="text-xs font-bold text-[#6e859e]">tahun</span>
                  </div>
                  <span className={helperClass}>
                    Perkiraan saja. Bawaannya {defaultUsefulLifeMonths[row.category] / 12} tahun untuk{" "}
                    {assetCategoryLabels[row.category].split(" (")[0].toLowerCase()}.
                  </span>
                </label>
                <label className={labelClass}>
                  Kalau nanti dijual, kira-kira laku berapa?
                  <div className="mt-1.5">
                    <InlineMoneyInput
                      ariaLabel="Perkiraan harga jual setelah tidak dipakai"
                      value={row.salvage}
                      onChange={(value) =>
                        setAssets((rows) => rows.map((item, i) => (i === index ? { ...item, salvage: value } : item)))
                      }
                    />
                  </div>
                  <span className={helperClass}>
                    Boleh dikosongkan kalau nanti dianggap sudah tidak laku sama sekali.
                  </span>
                </label>
              </div>

              {/*
                Metode penyusutannya dijelaskan dengan angka pemiliknya sendiri,
                bukan dengan namanya. « Garis lurus » tidak berarti apa-apa bagi
                pemilik warung; « turun Rp 25.000 tiap bulan, karena ... »
                langsung terbaca, dan angkanya bisa ia cocokkan sendiri.
              */}
              {depreciationNote(row) && (
                <p className="rounded-xl border border-[#dbe8f0] bg-[#f2f8fb] p-3 text-[11px] leading-relaxed text-[#0b5f86]">
                  {depreciationNote(row)}
                </p>
              )}
            </div>
          ))}
          <button
            type="button"
            onClick={() =>
              setAssets((rows) => [...rows, { name: "", cost: null, acquiredOn: startDate, category: "peralatan", years: String(defaultUsefulLifeMonths.peralatan / 12), salvage: null }])
            }
            className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-[#addcf4] bg-[#eef8fd] px-3 text-xs font-bold text-[#0b5f86]"
          >
            <Plus size={14} /> Tambah alat
          </button>
          <p className={helperClass}>Total: {formatIdr(assetTotal)}</p>
        </div>
      ),
    },
  ];

  const isSummary = step === steps.length;

  return (
    <section className="rounded-2xl border border-[#e3e9f0] bg-white p-5 shadow-[0_8px_30px_rgba(27,42,58,.04)]">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[11px] font-bold uppercase tracking-wide text-[#0b5f86]">
          Kondisi awal usaha ·{" "}
          {Math.min(step + 1, steps.length)} dari {steps.length}
        </p>
        {onSkip && !isSummary && (
          <button type="button" onClick={onSkip} className="min-h-10 text-[11px] font-bold text-[#6e859e]">
            Nanti saja
          </button>
        )}
      </div>

      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#eef2f6]">
        <div
          className="h-full rounded-full bg-[#0b5f86] transition-[width]"
          style={{ width: `${((isSummary ? steps.length : step) / steps.length) * 100}%` }}
        />
      </div>

      {isSummary ? (
        <div className="mt-5 space-y-4">
          <h2 className="text-base font-bold text-[#1b2a3a]">
            Modal usaha Anda saat ini {formatIdr(netWorth)}
          </h2>
          <p className="text-xs leading-relaxed text-[#6e859e]">
            Angka ini adalah semua yang usaha punya ({formatIdr(ownedTotal)}) dikurangi yang masih harus dibayar (
            {formatIdr(payableTotal)}).
            {netWorth < 0
              ? " Utangnya lebih besar dari yang dipunya, dan itu tidak apa-apa — sekarang jadi terlihat dan bisa dikejar."
              : ""}
          </p>

          <label className={labelClass}>
            Mulai mencatat sejak
            <input
              type="date"
              max={jakartaDate()}
              value={startDate}
              onChange={(event) => setStartDate(event.target.value)}
              className={`${inputClass} mt-1.5`}
            />
            <span className={helperClass}>
              Catatan sebelum tanggal ini tidak bisa dimasukkan lagi, karena sudah terhitung di angka di atas.
            </span>
          </label>

          {error && (
            <p role="alert" className="rounded-xl border border-[#f3c6cf] bg-[#fdf1f3] p-3 text-xs font-semibold text-[#b4304a]">
              {error}
            </p>
          )}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setStep(steps.length - 1)}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-[#d5dfe9] px-4 text-xs font-bold text-[#1b2a3a]"
            >
              <ArrowLeft size={14} /> Kembali
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void submit()}
              className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-[#0b5f86] px-4 text-xs font-bold text-white disabled:opacity-60"
            >
              {busy ? <LoaderCircle className="animate-spin" size={15} /> : <CheckCircle2 size={15} />}
              {busy ? "Menyimpan..." : "Mulai"}
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-5 space-y-4">
          <div>
            <h2 className="text-base font-bold text-[#1b2a3a]">{steps[step].title}</h2>
            <p className="mt-1 text-xs leading-relaxed text-[#6e859e]">{steps[step].helper}</p>
          </div>
          {steps[step].body}
          <div className="flex gap-2">
            {step > 0 && (
              <button
                type="button"
                onClick={() => setStep((value) => value - 1)}
                className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-[#d5dfe9] px-4 text-xs font-bold text-[#1b2a3a]"
              >
                <ArrowLeft size={14} /> Kembali
              </button>
            )}
            <button
              type="button"
              onClick={() => setStep((value) => value + 1)}
              className="inline-flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-xl bg-[#0b5f86] px-4 text-xs font-bold text-white"
            >
              Lanjut <ArrowRight size={14} />
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
