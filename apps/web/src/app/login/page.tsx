"use client";

import React, { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  Lock,
  Mail,
  User,
  Building2,
  ArrowRight,
  ShieldCheck,
  AlertCircle,
  Loader2,
  Sparkles,
  CheckCircle2,
} from "lucide-react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { useAuth } from "@/components/auth-provider";

const OAUTH_ERROR_MESSAGES: Record<string, string> = {
  google_not_configured:
    "Google OAuth is ready in code, but GOOGLE_CLIENT_ID & GOOGLE_CLIENT_SECRET are not set in .env yet.",
  github_not_configured:
    "GitHub OAuth is ready in code, but GITHUB_CLIENT_ID & GITHUB_CLIENT_SECRET are not set in .env yet.",
  invalid_oauth_state:
    "OAuth CSRF state verification failed or expired. Please try signing in again.",
  google_token_exchange_failed: "Could not exchange Google authorization code.",
  github_token_exchange_failed: "Could not exchange GitHub authorization code.",
  oauth_access_denied: "You cancelled the OAuth sign-in request.",
  oauth_callback_exception: "An unexpected error occurred during OAuth sign-in.",
};

function GoogleIcon() {
  return (
    <svg className="w-5 h-5" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      />
    </svg>
  );
}

function GitHubIcon() {
  return (
    <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"
      />
    </svg>
  );
}

function LoginFormContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, providers, refreshSession } = useAuth();

  const [accountType, setAccountType] = useState<"individual" | "org">("individual");
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const errorParam = searchParams.get("error");

  useEffect(() => {
    if (errorParam) {
      setError(
        OAUTH_ERROR_MESSAGES[errorParam] ||
          `Authentication error: ${errorParam}`
      );
    }
  }, [errorParam]);

  useEffect(() => {
    if (user) {
      router.replace("/profile");
    }
  }, [user, router]);

  const handleOAuth = (provider: "google" | "github") => {
    setError("");
    if (provider === "google" && !providers.google) {
      setError(OAUTH_ERROR_MESSAGES.google_not_configured);
      toast.error("Set GOOGLE_CLIENT_ID & GOOGLE_CLIENT_SECRET in .env to enable Google OAuth.");
      return;
    }
    if (provider === "github" && !providers.github) {
      setError(OAUTH_ERROR_MESSAGES.github_not_configured);
      toast.error("Set GITHUB_CLIENT_ID & GITHUB_CLIENT_SECRET in .env to enable GitHub OAuth.");
      return;
    }
    window.location.href = `/api/auth/oauth/${provider}?accountType=${accountType}`;
  };

  const handleCredentialsSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, name, mode, accountType }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Sign in failed.");
        setSubmitting(false);
        return;
      }

      await refreshSession();
      toast.success(
        mode === "signup"
          ? `Account created as ${accountType === "org" ? "Organization" : "Individual"}!`
          : `Welcome back, ${data.user?.name || "User"} (${accountType === "org" ? "Org" : "Individual"})!`
      );
      router.push(accountType === "org" ? "/dashboard" : "/profile");
    } catch {
      setError("Network error while signing in.");
      setSubmitting(false);
    }
  };

  const fillDemoAdmin = () => {
    setMode("signin");
    setAccountType("individual");
    setEmail("admin@verisphere.ai");
    setPassword("password");
    setError("");
    toast.info("Demo admin credentials filled (Individual by default).");
  };

  return (
    <div className="min-h-[calc(100vh-72px)] bg-[var(--bg-page)] flex flex-col items-center justify-center p-6 relative overflow-hidden">
      {/* Background Decor */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[620px] h-[620px] bg-[var(--brand-blue)] opacity-5 rounded-full blur-3xl pointer-events-none" />

      <motion.div
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
        className="w-full max-w-[440px] relative z-10"
      >
        <div className="text-center mb-7 flex flex-col items-center">
          <div className="w-14 h-14 bg-[var(--brand-blue)] rounded-2xl flex items-center justify-center mb-4 shadow-lg shadow-blue-500/20">
            <ShieldCheck className="text-white w-7 h-7" />
          </div>
          <h1 className="font-heading text-3xl font-bold text-[var(--text-primary)] tracking-tight">
            {mode === "signin" ? "Sign in to VeriSphere" : "Create your account"}
          </h1>
          <p className="text-sm text-[var(--text-secondary)] mt-1.5">
            OAuth 2.0 (PKCE) & signed HttpOnly session authentication.
          </p>
        </div>

        <div className="bg-[var(--bg-surface)] p-7 sm:p-8 rounded-3xl border border-[var(--border)] shadow-[var(--shadow-lg)]">
          {/* Account Type Selector: Individual Candidate vs Organization */}
          <div className="mb-6">
            <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--text-tertiary)] mb-2">
              I am signing in as
            </label>
            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => setAccountType("individual")}
                className={`p-3 rounded-xl border text-left transition-all flex items-start gap-2.5 ${
                  accountType === "individual"
                    ? "bg-[var(--brand-blue-light)] border-[var(--brand-blue)] ring-1 ring-[var(--brand-blue)]/30"
                    : "bg-[var(--bg-subtle)] border-[var(--border)] hover:border-[var(--border-strong)]"
                }`}
              >
                <div
                  className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                    accountType === "individual"
                      ? "bg-[var(--brand-blue)] text-white"
                      : "bg-[var(--bg-surface)] text-[var(--text-secondary)] border border-[var(--border)]"
                  }`}
                >
                  <User size={16} />
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-bold text-[var(--text-primary)] leading-tight">
                    Individual
                  </div>
                  <div className="text-[10px] text-[var(--text-tertiary)] mt-0.5 leading-snug">
                    3 free verifications / mo
                  </div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setAccountType("org")}
                className={`p-3 rounded-xl border text-left transition-all flex items-start gap-2.5 ${
                  accountType === "org"
                    ? "bg-[var(--brand-blue-light)] border-[var(--brand-blue)] ring-1 ring-[var(--brand-blue)]/30"
                    : "bg-[var(--bg-subtle)] border-[var(--border)] hover:border-[var(--border-strong)]"
                }`}
              >
                <div
                  className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                    accountType === "org"
                      ? "bg-[var(--brand-blue)] text-white"
                      : "bg-[var(--bg-surface)] text-[var(--text-secondary)] border border-[var(--border)]"
                  }`}
                >
                  <Building2 size={16} />
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-bold text-[var(--text-primary)] leading-tight">
                    Organization
                  </div>
                  <div className="text-[10px] text-[var(--text-tertiary)] mt-0.5 leading-snug">
                    Bulk upload &amp; batches
                  </div>
                </div>
              </button>
            </div>
          </div>

          {/* OAuth 2.0 Providers */}
          <div className="space-y-3">
            <button
              type="button"
              onClick={() => handleOAuth("google")}
              className="w-full py-3 px-4 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface)] hover:bg-[var(--bg-subtle)] text-sm font-semibold text-[var(--text-primary)] flex items-center justify-center gap-3 transition-colors"
            >
              <GoogleIcon />
              <span>Continue with Google</span>
              {providers.google && (
                <span className="ml-auto text-[10px] font-mono px-1.5 py-0.5 rounded bg-[var(--verified-bg)] text-[var(--verified)]">
                  LIVE
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => handleOAuth("github")}
              className="w-full py-3 px-4 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface)] hover:bg-[var(--bg-subtle)] text-sm font-semibold text-[var(--text-primary)] flex items-center justify-center gap-3 transition-colors"
            >
              <GitHubIcon />
              <span>Continue with GitHub</span>
              {providers.github && (
                <span className="ml-auto text-[10px] font-mono px-1.5 py-0.5 rounded bg-[var(--verified-bg)] text-[var(--verified)]">
                  LIVE
                </span>
              )}
            </button>
          </div>

          {/* Divider */}
          <div className="relative my-6 flex items-center">
            <div className="flex-grow border-t border-[var(--border)]" />
            <span className="px-3 text-xs font-medium text-[var(--text-tertiary)] uppercase tracking-wider">
              or with email
            </span>
            <div className="flex-grow border-t border-[var(--border)]" />
          </div>

          {/* Mode Tabs */}
          <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-[var(--bg-subtle)] border border-[var(--border)] mb-5">
            <button
              type="button"
              onClick={() => {
                setMode("signin");
                setError("");
              }}
              className={`py-2 text-xs font-semibold rounded-lg transition-all ${
                mode === "signin"
                  ? "bg-[var(--bg-surface)] text-[var(--text-primary)] shadow-sm border border-[var(--border)]"
                  : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              }`}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => {
                setMode("signup");
                setError("");
              }}
              className={`py-2 text-xs font-semibold rounded-lg transition-all ${
                mode === "signup"
                  ? "bg-[var(--bg-surface)] text-[var(--text-primary)] shadow-sm border border-[var(--border)]"
                  : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              }`}
            >
              Create Account
            </button>
          </div>

          {error && (
            <div className="mb-4 p-3 rounded-xl bg-[var(--danger-bg)] border border-[var(--danger)]/30 flex items-start gap-2.5 text-xs text-[var(--danger)]">
              <AlertCircle size={16} className="shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleCredentialsSubmit} className="space-y-4">
            {mode === "signup" && (
              <div>
                <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">
                  Full Name
                </label>
                <div className="relative flex items-center">
                  <User className="absolute left-3.5 text-[var(--text-tertiary)] w-4 h-4" />
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Abhijay M S"
                    required
                    className="w-full bg-[var(--bg-subtle)] border border-[var(--border)] focus:border-[var(--brand-blue)] rounded-xl py-2.5 pl-10 pr-4 text-sm text-[var(--text-primary)] outline-none"
                  />
                </div>
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">
                Email Address
              </label>
              <div className="relative flex items-center">
                <Mail className="absolute left-3.5 text-[var(--text-tertiary)] w-4 h-4" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@verisphere.ai"
                  required
                  className="w-full bg-[var(--bg-subtle)] border border-[var(--border)] focus:border-[var(--brand-blue)] rounded-xl py-2.5 pl-10 pr-4 text-sm text-[var(--text-primary)] outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">
                Password
              </label>
              <div className="relative flex items-center">
                <Lock className="absolute left-3.5 text-[var(--text-tertiary)] w-4 h-4" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  minLength={6}
                  className="w-full bg-[var(--bg-subtle)] border border-[var(--border)] focus:border-[var(--brand-blue)] rounded-xl py-2.5 pl-10 pr-4 text-sm text-[var(--text-primary)] outline-none"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full py-3.5 bg-[var(--brand-blue)] hover:opacity-95 disabled:opacity-60 text-white rounded-xl font-heading font-semibold text-sm flex items-center justify-center gap-2 shadow-sm transition-all"
            >
              {submitting ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  <span>Authenticating...</span>
                </>
              ) : (
                <>
                  <span>{mode === "signin" ? "Sign In" : "Create Demo Account"}</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          {/* Quick Demo Helper */}
          <div className="mt-5 pt-4 border-t border-[var(--border)] flex items-center justify-between gap-2">
            <span className="text-[11px] text-[var(--text-tertiary)] flex items-center gap-1">
              <CheckCircle2 size={12} className="text-[var(--verified)]" />
              Demo credentials ready
            </span>
            <button
              type="button"
              onClick={fillDemoAdmin}
              className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--brand-blue)] hover:underline"
            >
              <Sparkles size={12} />
              Fill Demo Admin
            </button>
          </div>
        </div>

        <p className="mt-5 text-center text-xs text-[var(--text-tertiary)]">
          Protected with OAuth 2.0 PKCE (S256), CSRF state verification, and HMAC-SHA256 HttpOnly cookies.{" "}
          <Link href="/pricing" className="text-[var(--brand-blue)] hover:underline">
            View Plans
          </Link>
        </p>
      </motion.div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-[calc(100vh-72px)] flex items-center justify-center bg-[var(--bg-page)]">
          <Loader2 className="w-7 h-7 animate-spin text-[var(--brand-blue)]" />
        </div>
      }
    >
      <LoginFormContent />
    </Suspense>
  );
}
