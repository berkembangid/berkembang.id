import { createBrowserClient } from "@supabase/ssr";
import { type CookieOptions } from "@supabase/ssr";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn("Supabase credentials missing. Check your environment variables.");
}

// Cookie chunk size to avoid HTTP 431 (Request Header Too Large)
// Supabase auth tokens can exceed 4KB per cookie — chunking splits them
const COOKIE_CHUNK_SIZE = 3180;

function chunkCookieValue(value: string): string[] {
  const chunks: string[] = [];
  for (let i = 0; i < value.length; i += COOKIE_CHUNK_SIZE) {
    chunks.push(value.slice(i, i + COOKIE_CHUNK_SIZE));
  }
  return chunks;
}

function getCookie(name: string): string | undefined {
  if (typeof document === "undefined") return undefined;
  const cookies = document.cookie.split(";");
  // Reassemble chunked cookies
  const chunks: { [key: string]: string } = {};
  const fullValues: { [key: string]: string } = {};
  
  for (const cookie of cookies) {
    const [key, ...valueParts] = cookie.trim().split("=");
    const value = valueParts.join("=");
    const chunkMatch = key.match(/^(.+)\.(\d+)$/);
    if (chunkMatch) {
      const baseName = chunkMatch[1];
      const index = parseInt(chunkMatch[2]);
      if (!chunks[baseName]) chunks[baseName] = "";
      chunks[baseName] = chunks[baseName] + value;
    } else {
      fullValues[key] = value;
    }
  }
  
  return chunks[name] || fullValues[name];
}

function setCookie(name: string, value: string, options: CookieOptions) {
  if (typeof document === "undefined") return;
  
  // Remove any existing chunks for this cookie
  const existingCookies = document.cookie.split(";");
  for (const cookie of existingCookies) {
    const key = cookie.trim().split("=")[0];
    if (key.startsWith(`${name}.`)) {
      document.cookie = `${key}=; Max-Age=0; path=/`;
    }
  }
  document.cookie = `${name}=; Max-Age=0; path=/`;

  if (!value) return;

  const chunks = chunkCookieValue(value);
  const cookieOptions = `; path=${options.path || "/"}${options.maxAge ? `; Max-Age=${options.maxAge}` : ""}${options.domain ? `; Domain=${options.domain}` : ""}${options.secure ? "; Secure" : ""}${options.sameSite ? `; SameSite=${options.sameSite}` : ""}`;

  if (chunks.length === 1) {
    document.cookie = `${name}=${value}${cookieOptions}`;
  } else {
    chunks.forEach((chunk, i) => {
      document.cookie = `${name}.${i}=${chunk}${cookieOptions}`;
    });
  }
}

function removeCookie(name: string, options: CookieOptions) {
  setCookie(name, "", { ...options, maxAge: 0 });
}

export const supabase = createBrowserClient(supabaseUrl, supabaseAnonKey, {
  cookies: {
    get: getCookie,
    set: setCookie,
    remove: removeCookie,
  },
  cookieOptions: {
    maxAge: 60 * 60 * 24 * 7, // 7 days
  },
});
