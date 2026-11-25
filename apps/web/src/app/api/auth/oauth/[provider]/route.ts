import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  generateOAuthState,
  generatePkcePair,
  getAppOrigin,
  OAUTH_STATE_COOKIE_NAME,
  OAUTH_VERIFIER_COOKIE_NAME,
  OAUTH_ACCOUNT_TYPE_COOKIE_NAME,
} from "@/lib/auth";

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ provider: string }> }
) {
  const { provider } = await context.params;
  const origin = getAppOrigin(req.url);
  const reqUrl = new URL(req.url);
  const accountType = reqUrl.searchParams.get("accountType") === "org" ? "org" : "individual";

  if (provider !== "google" && provider !== "github") {
    return NextResponse.redirect(`${origin}/login?error=unsupported_provider`);
  }

  const state = generateOAuthState();
  const { verifier, challenge } = generatePkcePair();

  const cookieStore = await cookies();
  const cookieOpts = {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 600, // 10 minutes
  };

  if (provider === "google") {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      return NextResponse.redirect(`${origin}/login?error=google_not_configured`);
    }

    cookieStore.set(OAUTH_STATE_COOKIE_NAME, state, cookieOpts);
    cookieStore.set(OAUTH_VERIFIER_COOKIE_NAME, verifier, cookieOpts);
    cookieStore.set(OAUTH_ACCOUNT_TYPE_COOKIE_NAME, accountType, cookieOpts);

    const redirectUri = `${origin}/api/auth/callback/google`;
    const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    authUrl.searchParams.set("client_id", clientId);
    authUrl.searchParams.set("redirect_uri", redirectUri);
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("scope", "openid email profile");
    authUrl.searchParams.set("state", state);
    authUrl.searchParams.set("code_challenge", challenge);
    authUrl.searchParams.set("code_challenge_method", "S256");
    authUrl.searchParams.set("prompt", "select_account");

    return NextResponse.redirect(authUrl.toString());
  }

  // GitHub OAuth 2.0 + PKCE
  const clientId = process.env.GITHUB_CLIENT_ID;
  const clientSecret = process.env.GITHUB_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return NextResponse.redirect(`${origin}/login?error=github_not_configured`);
  }

  cookieStore.set(OAUTH_STATE_COOKIE_NAME, state, cookieOpts);
  cookieStore.set(OAUTH_VERIFIER_COOKIE_NAME, verifier, cookieOpts);

  const redirectUri = `${origin}/api/auth/callback/github`;
  const authUrl = new URL("https://github.com/login/oauth/authorize");
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("scope", "read:user user:email");
  authUrl.searchParams.set("state", state);
  authUrl.searchParams.set("code_challenge", challenge);
  authUrl.searchParams.set("code_challenge_method", "S256");

  return NextResponse.redirect(authUrl.toString());
}

