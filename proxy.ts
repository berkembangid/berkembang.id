import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

const CHUNK_RE = /^(.+)\.(\d+)$/;

function reassembleCookies(request: NextRequest) {
  const chunks: Record<string, Record<number, string>> = {};
  const simple: Record<string, string> = {};

  for (const cookie of request.cookies.getAll()) {
    const m = cookie.name.match(CHUNK_RE);
    if (m) {
      const base = m[1];
      const idx = parseInt(m[2], 10);
      if (!chunks[base]) chunks[base] = {};
      chunks[base][idx] = cookie.value;
    } else {
      simple[cookie.name] = cookie.value;
    }
  }

  const reassembled: Record<string, string> = { ...simple };
  for (const [name, parts] of Object.entries(chunks)) {
    const sorted = Object.keys(parts)
      .map(Number)
      .sort((a, b) => a - b);
    reassembled[name] = sorted.map((i) => parts[i]).join("");
  }
  return reassembled;
}

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

  if (!supabaseUrl || !supabaseAnonKey) return response;

  const reassembled = reassembleCookies(request);

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return Object.entries(reassembled).map(([name, value]) => ({ name, value }));
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
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

  if (!user && isProtectedPath) {
    const url = request.nextUrl.clone();
    url.pathname = "/auth/login";
    url.searchParams.set("redirectTo", pathname);
    return NextResponse.redirect(url);
  }

  if (user && isAuthPath) {
    const userRole = user.user_metadata?.role || "umkm";
    const targetPath =
      userRole === "admin" ? "/admin" : userRole === "institution" ? "/institusi" : "/umkm";
    const url = request.nextUrl.clone();
    url.pathname = targetPath;
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
