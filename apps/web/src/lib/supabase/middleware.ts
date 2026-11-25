import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Checks whether any Supabase auth cookie exists and whether its JWT access token
 * is still valid for > 5 minutes. Avoids making a 300–900ms remote HTTPS call to
 * Supabase Auth on every single route click when the token is already fresh.
 */
function shouldRefreshSession(request: NextRequest): boolean {
  const allCookies = request.cookies.getAll();
  const authCookies = allCookies.filter((c) => c.name.startsWith("sb-") && c.name.includes("auth-token"));
  if (authCookies.length === 0) {
    return false; // Visitor is not signed in — zero remote calls needed
  }

  try {
    // Reassemble single or chunked Supabase auth cookie
    const combined = authCookies
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((c) => c.value)
      .join("");

    let rawJson = combined;
    if (combined.startsWith("base64-")) {
      rawJson = atob(combined.slice(7));
    } else if (combined.startsWith("%7B") || combined.startsWith("%5B")) {
      rawJson = decodeURIComponent(combined);
    }

    const parsed = JSON.parse(rawJson);
    const accessToken: string | undefined =
      typeof parsed?.access_token === "string"
        ? parsed.access_token
        : Array.isArray(parsed) && typeof parsed[0] === "string"
        ? parsed[0]
        : undefined;

    if (!accessToken) return true;

    const parts = accessToken.split(".");
    if (parts.length !== 3) return true;

    const payloadJson = atob(parts[1].replace(/-/g, "+").replace(/_/g, "/"));
    const payload = JSON.parse(payloadJson) as { exp?: number };
    if (!payload.exp) return true;

    const nowSec = Math.floor(Date.now() / 1000);
    // Only call Supabase remotely if token expires within the next 5 minutes
    return payload.exp - nowSec < 300;
  } catch {
    // If cookie format can't be parsed locally, let Supabase SDK refresh safely
    return true;
  }
}

export async function updateSession(request: NextRequest) {
  const supabaseResponse = NextResponse.next({ request });

  // Skip middleware network round-trips on Next.js <Link> prefetches
  if (
    request.headers.get("next-router-prefetch") === "1" ||
    request.headers.get("purpose") === "prefetch"
  ) {
    return supabaseResponse;
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey || !url.startsWith("http")) {
    return supabaseResponse;
  }

  if (!shouldRefreshSession(request)) {
    return supabaseResponse;
  }

  let refreshedResponse = supabaseResponse;

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        refreshedResponse = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          refreshedResponse.cookies.set(name, value, options)
        );
      },
    },
  });

  await supabase.auth.getUser();

  return refreshedResponse;
}
