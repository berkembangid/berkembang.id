import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import {
  portalPathForRole,
} from "@/modules/auth/role-resolution";
import { getEffectivePortalRole } from "@/lib/auth/authorization";
import type { Database } from "@/types/database.generated";

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({
    request,
  });

  const { pathname } = request.nextUrl;

  // ── Pemulangan OAuth yang jatuh di halaman depan ──────────────────────────
  //
  // DIAGNOSIS, dari keadaan produksi yang sebenarnya:
  //
  //   `www.berkembang.id` adalah host yang melayani aplikasi; domain apex
  //   308-redirect ke sana. Tetapi `site_url` dan `uri_allow_list` di proyek
  //   Supabase menyebut APEX. Jadi `redirectTo` yang dikirim tombol Google --
  //   `https://www.berkembang.id/auth/callback` -- tidak cocok dengan daftar
  //   izin, dan Supabase memantulkan orangnya ke `site_url` sebagai gantinya,
  //   dengan `?code=` masih menempel. Apex lalu 308 ke www, membawa query-nya.
  //
  // Akibatnya adalah bug yang paling sulit dilaporkan orang: halaman depan
  // adalah komponen server yang tidak memuat klien Supabase sama sekali, jadi
  // kodenya TIDAK PERNAH ditukar. Orangnya berhenti di halaman depan, belum
  // masuk, tanpa satu pun petunjuk -- dan menekan tombol masuk lagi hanya
  // mengulang lingkarannya.
  //
  // Penerusan di bawah benar-benar menyelesaikan alurnya, bukan menambalnya:
  // `?code=` sampai di www, yaitu origin yang sama tempat kuki penanda PKCE
  // ditulis, jadi `/auth/callback` bisa menukarnya. Ia juga tetap bekerja
  // untuk sebab lain apa pun yang membuat Supabase jatuh ke `site_url`.
  //
  // Daftar izinnya TETAP harus dibetulkan. Selama ia menyebut host yang salah,
  // setiap tautan di dalam surel juga menunjuk ke alamat yang salah.
  //
  // Galat OAuth ikut diteruskan. Orang yang membatalkan di layar Google juga
  // dipantulkan ke `site_url`, dan tanpa ini ia mendarat di halaman depan
  // tanpa penjelasan apa pun -- persis kebingungan yang sama.
  //
  // Sengaja HANYA halaman depan, dan hanya nama parameter yang memang dipakai
  // Supabase: `code` terlalu umum untuk dibajak di sembarang alamat.
  if (pathname === "/") {
    const query = request.nextUrl.searchParams;
    if (query.has("code") || query.has("error") || query.has("error_description")) {
      const target = request.nextUrl.clone();
      target.pathname = "/auth/callback";
      return NextResponse.redirect(target);
    }
  }

  const isAdminLogin = pathname === "/auth/login/admin";

  const isProtectedPath =
    (pathname.startsWith("/umkm") ||
    pathname.startsWith("/admin") ||
    pathname.startsWith("/lembaga") ||
    pathname.startsWith("/investor"));

  const isAuthPath =
    pathname.startsWith("/auth/login") || pathname.startsWith("/auth/register");

  // Fast-path: Skip Supabase auth check completely for public pages (e.g. landing page '/')
  if (!isProtectedPath && !isAuthPath) {
    return response;
  }

  const allCookies = request.cookies.getAll();
  const hasAuthCookie = allCookies.some(
    (c) => c.name.includes("sb-") || c.name.includes("supabase") || c.name.includes("auth-token")
  );

  // Fast-path: Unauthenticated user on login/register page -> return immediately without external call
  if (isAuthPath && !hasAuthCookie) {
    return response;
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

  if ((!supabaseUrl || !supabaseAnonKey) && isProtectedPath) {
    const url = request.nextUrl.clone();
    url.pathname = "/auth/login";
    url.searchParams.set("error", "auth_unavailable");
    return NextResponse.redirect(url);
  }

  if (!supabaseUrl || !supabaseAnonKey) {
    return response;
  }

  const supabase = createServerClient<Database>(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({
          request,
        });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options)
        );
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // 1. Unauthenticated users trying to access protected paths -> Login
  if (!user && isProtectedPath) {
    const url = request.nextUrl.clone();
    url.pathname = "/auth/login";
    url.searchParams.set("redirectTo", pathname);
    return NextResponse.redirect(url);
  }

  if (!user) {
    return response;
  }

  let userRole = null;
  try {
    userRole = await getEffectivePortalRole(supabase, user.id);
  } catch {
    // Fail closed. A temporary authorization lookup failure must never grant a
    // portal based on client-controlled identity fields.
  }

  // 2. Authenticated users trying to access auth pages -> Redirect to their portal
  if (isAuthPath && userRole) {
    const targetPath = portalPathForRole(userRole);
    const url = request.nextUrl.clone();
    url.pathname = targetPath;
    return NextResponse.redirect(url);
  }

  if (isProtectedPath && !userRole) {
    if (pathname.startsWith("/umkm")) {
      userRole = "umkm";
    } else {
      const url = request.nextUrl.clone();
      url.pathname = "/auth/login";
      url.searchParams.set("error", "membership_required");
      return NextResponse.redirect(url);
    }
  }

  // 3. Strict Role Access Control: Block & Redirect cross-role access
  if (isProtectedPath) {
    const isAccessingUmkm = pathname.startsWith("/umkm");
    const isAccessingAdmin = pathname.startsWith("/admin");
    const isAccessingLembaga = pathname.startsWith("/lembaga");
    const isAccessingInvestor = pathname.startsWith("/investor");

    if (userRole === "admin" && !isAccessingAdmin) {
      const url = request.nextUrl.clone();
      url.pathname = "/admin";
      return NextResponse.redirect(url);
    }

    if (userRole === "institution" && !isAccessingLembaga) {
      const url = request.nextUrl.clone();
      url.pathname = "/lembaga";
      return NextResponse.redirect(url);
    }

    if (userRole === "investor" && !isAccessingInvestor) {
      const url = request.nextUrl.clone();
      url.pathname = "/investor";
      return NextResponse.redirect(url);
    }

    if (userRole === "umkm" && !isAccessingUmkm) {
      const url = request.nextUrl.clone();
      url.pathname = "/umkm";
      return NextResponse.redirect(url);
    }
  }

  return response;

}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
