import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({
    request,
  });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

  if (!supabaseUrl || !supabaseAnonKey) {
    return response;
  }

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
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

  const { pathname } = request.nextUrl;

  const isProtectedPath =
    pathname.startsWith("/umkm") ||
    pathname.startsWith("/admin") ||
    pathname.startsWith("/institusi");

  const isAuthPath =
    pathname.startsWith("/auth/login") || pathname.startsWith("/auth/register");

  // 1. Unauthenticated users trying to access protected paths -> Login
  if (!user && isProtectedPath) {
    const url = request.nextUrl.clone();
    url.pathname = "/auth/login";
    url.searchParams.set("redirectTo", pathname);
    return NextResponse.redirect(url);
  }

  const userRole = user?.user_metadata?.role || "umkm";

  // 2. Authenticated users trying to access auth pages -> Redirect to their portal
  if (user && isAuthPath) {
    const targetPath =
      userRole === "admin" ? "/admin" : userRole === "institution" ? "/institusi" : "/umkm";
    const url = request.nextUrl.clone();
    url.pathname = targetPath;
    return NextResponse.redirect(url);
  }

  // 3. Strict Role Access Control: Prevent cross-role access
  if (user && isProtectedPath) {
    const isAccessingUmkm = pathname.startsWith("/umkm");
    const isAccessingAdmin = pathname.startsWith("/admin");
    const isAccessingInstitusi = pathname.startsWith("/institusi");

    if (userRole === "admin" && !isAccessingAdmin) {
      const url = request.nextUrl.clone();
      url.pathname = "/admin";
      return NextResponse.redirect(url);
    }

    if (userRole === "institution" && !isAccessingInstitusi) {
      const url = request.nextUrl.clone();
      url.pathname = "/institusi";
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
