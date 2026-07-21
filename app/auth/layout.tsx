import Link from "next/link";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-[#001b85] to-[#006a6a] flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Link href="/">
            <span className="font-headline text-2xl font-extrabold text-white">BERKEMBANG.ID</span>
          </Link>
          <p className="text-white/70 text-sm mt-1">Platform UMKM Berbasis AI</p>
        </div>
        <div className="bg-white rounded-3xl shadow-2xl p-8">
          {children}
        </div>
      </div>
    </div>
  );
}
