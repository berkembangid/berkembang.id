export default function DemoBanner({ children }: { children?: React.ReactNode }) {
  return (
    <div
      role="status"
      className="mb-5 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-xs font-semibold leading-5 text-amber-900"
    >
      <strong>Mode demo/simulasi.</strong>{" "}
      {children ?? "Data dan aksi pada halaman ini belum terhubung ke layanan produksi."}
    </div>
  );
}

