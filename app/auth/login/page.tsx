/**
 * Pembungkus server halaman masuk.
 *
 * `?error=` datang dari pantulan `/auth/continue` dan proxy, dan pesannya
 * harus sudah ada di HTML pertama -- bukan muncul belakangan setelah
 * hidrasi. Membacanya di sini, lalu meneruskannya sebagai prop, membuat
 * halaman ini dirender dinamis tanpa perlu batas Suspense yang mengosongkan
 * formulirnya saat prerender.
 */
import LoginForm from "./login-form";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const reason = (await searchParams).error;
  return <LoginForm bounceReason={typeof reason === "string" ? reason : null} />;
}
