import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  getAppOrigin,
  OAUTH_STATE_COOKIE_NAME,
  OAUTH_VERIFIER_COOKIE_NAME,
  OAUTH_ACCOUNT_TYPE_COOKIE_NAME,
  safeEqual,
  SessionUser,
  setSessionCookie,
} from "@/lib/auth";

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ provider: string }> }
) {
  const { provider } = await context.params;
  const origin = getAppOrigin(req.url);
  const url = new URL(req.url);

  const code = url.searchParams.get("code");
  const returnedState = url.searchParams.get("state");
  const oauthError = url.searchParams.get("error");

  const cookieStore = await cookies();
  const storedState = cookieStore.get(OAUTH_STATE_COOKIE_NAME)?.value;
  const storedVerifier = cookieStore.get(OAUTH_VERIFIER_COOKIE_NAME)?.value;
  const storedAccountType =
    cookieStore.get(OAUTH_ACCOUNT_TYPE_COOKIE_NAME)?.value === "org" ? "org" : "individual";

  // Always clear single-use OAuth cookies immediately
  cookieStore.set(OAUTH_STATE_COOKIE_NAME, "", { httpOnly: true, path: "/", maxAge: 0 });
  cookieStore.set(OAUTH_VERIFIER_COOKIE_NAME, "", { httpOnly: true, path: "/", maxAge: 0 });
  cookieStore.set(OAUTH_ACCOUNT_TYPE_COOKIE_NAME, "", { httpOnly: true, path: "/", maxAge: 0 });

  if (oauthError) {
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent(`oauth_${oauthError}`)}`
    );
  }

  if (!code || !returnedState || !safeEqual(returnedState, storedState)) {
    return NextResponse.redirect(`${origin}/login?error=invalid_oauth_state`);
  }

  try {
    if (provider === "google") {
      const clientId = process.env.GOOGLE_CLIENT_ID;
      const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
      if (!clientId || !clientSecret) {
        return NextResponse.redirect(`${origin}/login?error=google_not_configured`);
      }

      const redirectUri = `${origin}/api/auth/callback/google`;
      const tokenParams = new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      });
      if (storedVerifier) {
        tokenParams.set("code_verifier", storedVerifier);
      }

      const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: tokenParams.toString(),
      });

      if (!tokenRes.ok) {
        return NextResponse.redirect(`${origin}/login?error=google_token_exchange_failed`);
      }

      const tokenData = (await tokenRes.json()) as { access_token?: string };
      if (!tokenData.access_token) {
        return NextResponse.redirect(`${origin}/login?error=google_missing_token`);
      }

      const userRes = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      });

      if (!userRes.ok) {
        return NextResponse.redirect(`${origin}/login?error=google_userinfo_failed`);
      }

      const profile = (await userRes.json()) as {
        sub: string;
        name?: string;
        email?: string;
        picture?: string;
      };

      const user: SessionUser = {
        id: `google_${profile.sub}`,
        name: profile.name || profile.email?.split("@")[0] || "Google User",
        email: profile.email || "user@google.oauth",
        avatarUrl: profile.picture,
        provider: "google",
        accountType: storedAccountType,
        role: storedAccountType === "org" ? "Organization Hiring Lead" : "Individual Candidate",
        organization: storedAccountType === "org" ? "Google Workspace Org" : "Personal Account",
        signedInAt: new Date().toISOString(),
      };

      await setSessionCookie(user);
      return NextResponse.redirect(`${origin}/profile?welcome=google`);
    }

    if (provider === "github") {
      const clientId = process.env.GITHUB_CLIENT_ID;
      const clientSecret = process.env.GITHUB_CLIENT_SECRET;
      if (!clientId || !clientSecret) {
        return NextResponse.redirect(`${origin}/login?error=github_not_configured`);
      }

      const redirectUri = `${origin}/api/auth/callback/github`;
      const tokenBody: Record<string, string> = {
        client_id: clientId,
        client_secret: clientSecret,
        code,
        redirect_uri: redirectUri,
      };
      if (storedVerifier) {
        tokenBody.code_verifier = storedVerifier;
      }

      const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(tokenBody),
      });

      if (!tokenRes.ok) {
        return NextResponse.redirect(`${origin}/login?error=github_token_exchange_failed`);
      }

      const tokenData = (await tokenRes.json()) as { access_token?: string };
      if (!tokenData.access_token) {
        return NextResponse.redirect(`${origin}/login?error=github_missing_token`);
      }

      const userRes = await fetch("https://api.github.com/user", {
        headers: {
          Authorization: `Bearer ${tokenData.access_token}`,
          Accept: "application/vnd.github+json",
          "User-Agent": "VeriSphere-OAuth",
        },
      });

      if (!userRes.ok) {
        return NextResponse.redirect(`${origin}/login?error=github_userinfo_failed`);
      }

      const profile = (await userRes.json()) as {
        id: number;
        login: string;
        name?: string | null;
        email?: string | null;
        avatar_url?: string;
        company?: string | null;
      };

      let primaryEmail = profile.email || "";
      if (!primaryEmail) {
        const emailsRes = await fetch("https://api.github.com/user/emails", {
          headers: {
            Authorization: `Bearer ${tokenData.access_token}`,
            Accept: "application/vnd.github+json",
            "User-Agent": "VeriSphere-OAuth",
          },
        });
        if (emailsRes.ok) {
          const emails = (await emailsRes.json()) as Array<{
            email: string;
            primary: boolean;
            verified: boolean;
          }>;
          const primary = emails.find((e) => e.primary && e.verified) || emails[0];
          if (primary?.email) {
            primaryEmail = primary.email;
          }
        }
      }

      const user: SessionUser = {
        id: `github_${profile.id}`,
        name: profile.name || profile.login,
        email: primaryEmail || `${profile.login}@users.noreply.github.com`,
        avatarUrl: profile.avatar_url,
        provider: "github",
        accountType: storedAccountType,
        role: storedAccountType === "org" ? "Organization Reviewer" : "Individual Candidate",
        organization:
          profile.company?.replace(/^@/, "") ||
          (storedAccountType === "org" ? `GitHub Org (@${profile.login})` : "Personal Account"),
        signedInAt: new Date().toISOString(),
      };

      await setSessionCookie(user);
      return NextResponse.redirect(`${origin}/profile?welcome=github`);
    }

    return NextResponse.redirect(`${origin}/login?error=unsupported_provider`);
  } catch (err) {
    console.error(`[OAuth Callback Error - ${provider}]:`, err);
    return NextResponse.redirect(`${origin}/login?error=oauth_callback_exception`);
  }
}

