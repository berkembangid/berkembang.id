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

  if (!user) {
    return response;
  }

  // Determine user role with profile fallback and email fallback
  let userRole = user.user_metadata?.role;

  if (!userRole && user.email) {
    if (user.email.startsWith("admin@")) {
      userRole = "admin";
    } else if (user.email.startsWith("institusi@")) {
      userRole = "institution";
    }
  }

  if (!userRole) {
    try {
      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .maybeSingle();

      if (profile?.role) {
        userRole = profile.role;
      }
    } catch (err) {
      console.warn("Proxy profile lookup skipped:", err);
    }
  }

  // Fallback default
  userRole = userRole || "umkm";

  // 2. Authenticated users trying to access auth pages -> Redirect to their portal
  if (isAuthPath) {
    const targetPath =
      userRole === "admin" ? "/admin" : userRole === "institution" ? "/institusi" : "/umkm";
    const url = request.nextUrl.clone();
    url.pathname = targetPath;
    return NextResponse.redirect(url);
  }

  // 3. Strict Role Access Control: Block & Redirect cross-role access
  if (isProtectedPath) {
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
