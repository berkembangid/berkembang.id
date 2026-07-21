"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"umkm" | "institution" | "admin">("umkm");
  const router = useRouter();

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (role === "umkm") router.push("/umkm");
    else if (role === "institution") router.push("/institusi");
    else router.push("/admin");
  };

  return (
    <>
      <h1 className="font-headline text-2xl font-bold text-[#141a34] mb-1">Selamat Datang!</h1>
      <p className="text-sm text-[#444655] mb-6">Masuk ke akun Anda</p>

      {/* Role selector */}
      <div className="flex gap-2 mb-6 p-1 bg-[#f3f2ff] rounded-xl">
        {(["umkm", "institution", "admin"] as const).map((r) => (
          <button
            key={r}
            onClick={() => setRole(r)}
            className={`flex-1 text-xs font-bold py-2 rounded-lg transition-colors capitalize ${
              role === r ? "bg-white text-[#001b85] shadow-sm" : "text-[#444655]"
            }`}
          >
            {r === "umkm" ? "UMKM" : r === "institution" ? "Institusi" : "Admin"}
          </button>
        ))}
      </div>

      <form onSubmit={handleLogin} className="space-y-4">
        <div>
          <label className="block text-xs font-bold text-[#444655] mb-1.5">Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="email@contoh.com"
            className="w-full px-4 py-3 rounded-xl border border-[#c5c5d7] text-sm focus:border-[#001b85] focus:outline-none transition-colors"
            required
          />
        </div>
        <div>
          <label className="block text-xs font-bold text-[#444655] mb-1.5">Kata Sandi</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            className="w-full px-4 py-3 rounded-xl border border-[#c5c5d7] text-sm focus:border-[#001b85] focus:outline-none transition-colors"
            required
          />
        </div>
        <button
          type="submit"
          className="w-full bg-[#001b85] text-white font-bold py-3.5 rounded-xl text-sm hover:bg-[#0e32c2] transition-colors mt-2"
        >
          Masuk
        </button>
      </form>

      <p className="text-xs text-center text-[#444655] mt-4">
        Belum punya akun UMKM?{" "}
        <Link href="/auth/register/umkm" className="text-[#001b85] font-bold hover:underline">
          Daftar Gratis
        </Link>
      </p>
    </>
  );
}
