import crypto from "crypto";
import { cookies } from "next/headers";

export type AuthProviderType = "google" | "github" | "credentials";
export type AccountType = "individual" | "org";

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  avatarUrl?: string;
  provider: AuthProviderType;
  accountType: AccountType;
  role: string;
  organization: string;
  signedInAt: string;
}

interface SessionPayload {
  user: SessionUser;
  exp: number;
  iat: number;
}

export const SESSION_COOKIE_NAME = "verisphere_session";
export const OAUTH_STATE_COOKIE_NAME = "verisphere_oauth_state";
export const OAUTH_VERIFIER_COOKIE_NAME = "verisphere_oauth_verifier";
export const OAUTH_ACCOUNT_TYPE_COOKIE_NAME = "verisphere_oauth_account_type";

const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7; // 7 days

function getAuthSecret(): string {
  const envSecret = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET;
  if (envSecret && envSecret.length >= 16) {
    return envSecret;
  }
  // Safe deterministic dev-only fallback so local demo works without crashing if AUTH_SECRET is omitted.
  // In production, always set AUTH_SECRET to a 32+ byte random string.
  return crypto
    .createHash("sha256")
    .update("verisphere-local-dev-session-secret-change-in-prod")
    .digest("hex");
}

function base64UrlEncode(input: Buffer | string): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function base64UrlDecode(input: string): string {
  const padLength = (4 - (input.length % 4)) % 4;
  const padded = input.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat(padLength);
  return Buffer.from(padded, "base64").toString("utf8");
}

function signData(data: string): string {
  return base64UrlEncode(
    crypto.createHmac("sha256", getAuthSecret()).update(data).digest()
  );
}

export function createSessionToken(user: SessionUser): string {
  const now = Math.floor(Date.now() / 1000);
  const payload: SessionPayload = {
    user,
    iat: now,
    exp: now + SESSION_MAX_AGE_SECONDS,
  };
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signature = signData(encodedPayload);
  return `${encodedPayload}.${signature}`;
}

export function verifySessionToken(token: string | undefined): SessionUser | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;

  const [encodedPayload, providedSig] = parts;
  const expectedSig = signData(encodedPayload);

  const providedBuf = Buffer.from(providedSig);
  const expectedBuf = Buffer.from(expectedSig);
  if (providedBuf.length !== expectedBuf.length) return null;
  if (!crypto.timingSafeEqual(providedBuf, expectedBuf)) return null;

  try {
    const parsed = JSON.parse(base64UrlDecode(encodedPayload)) as SessionPayload;
    if (!parsed.exp || parsed.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }
    return parsed.user;
  } catch {
    return null;
  }
}

export async function getServerSession(): Promise<SessionUser | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  return verifySessionToken(token);
}

export async function setSessionCookie(user: SessionUser): Promise<void> {
  const token = createSessionToken(user);
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
}

export async function clearSessionCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
}

export function generateOAuthState(): string {
  return base64UrlEncode(crypto.randomBytes(32));
}

export function generatePkcePair(): { verifier: string; challenge: string } {
  const verifier = base64UrlEncode(crypto.randomBytes(32));
  const challenge = base64UrlEncode(
    crypto.createHash("sha256").update(verifier).digest()
  );
  return { verifier, challenge };
}

export function safeEqual(a: string | undefined, b: string | undefined): boolean {
  if (!a || !b) return false;
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

export function getAppOrigin(requestUrl: string): string {
  if (process.env.NEXT_PUBLIC_APP_URL) {
    return process.env.NEXT_PUBLIC_APP_URL.replace(/\/+$/, "");
  }
  const url = new URL(requestUrl);
  return url.origin;
}

export function getConfiguredOAuthProviders() {
  return {
    google: Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
    github: Boolean(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET),
  };
}

