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
  Check,
  Crown,
} from "lucide-react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { useAuth } from "@/components/auth-provider";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  ROLE_DEFINITIONS,
  SelectableRole,
  resolveAccountRole,
  isAdminEmail,
} from "@/lib/roles";

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
  const { user, supabaseConfigured, refreshSession } = useAuth();

  const [accountType, setAccountType] = useState<SelectableRole>("individual");
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [infoMessage, setInfoMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [oauthLoading, setOauthLoading] = useState<"google" | "github" | null>(null);

  const errorParam = searchParams.get("error");
  const selectedRoleDef = ROLE_DEFINITIONS[accountType];
  const typedEmailIsAdmin = isAdminEmail(email);

  useEffect(() => {
    if (errorParam) {
      setError(decodeURIComponent(errorParam));
    }
  }, [errorParam]);

  useEffect(() => {
    if (user) {
      router.replace(
        user.accountType === "org" || user.accountType === "admin"
          ? "/dashboard"
          : "/profile"
      );
    }
  }, [user, router]);

  const handleOAuth = async (provider: "google" | "github") => {
    setError("");
    setInfoMessage("");
    const supabase = createSupabaseBrowserClient();
    if (!supabase) {
      setError(
        "Supabase Auth is not configured yet. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to apps/web/.env.local."
      );
      return;
    }

    setOauthLoading(provider);
    const redirectTo = `${window.location.origin}/auth/callback?accountType=${accountType}`;

    const { error: oauthErr } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo,
        queryParams:
          provider === "google" ? { prompt: "select_account" } : undefined,
      },
    });

    if (oauthErr) {
      setError(oauthErr.message);
      setOauthLoading(null);
    }
  };

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setInfoMessage("");

    const supabase = createSupabaseBrowserClient();
    if (!supabase) {
      setError(
        "Supabase Auth is not configured yet. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to apps/web/.env.local."
      );
      return;
    }

    setSubmitting(true);
    const cleanEmail = email.trim().toLowerCase();
    const resolvedRole = resolveAccountRole(cleanEmail, accountType);

    try {
      if (mode === "signup") {
        const displayName =
          name.trim() ||
          cleanEmail
            .split("@")[0]
            .replace(/[._-]+/g, " ")
            .replace(/\b\w/g, (c: string) => c.toUpperCase());

        const { data, error: signUpErr } = await supabase.auth.signUp({
          email: cleanEmail,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/auth/callback?accountType=${accountType}`,
            data: {
              full_name: displayName,
              account_type: resolvedRole,
              role_title:
                resolvedRole === "admin"
                  ? "Platform Administrator"
                  : resolvedRole === "org"
                  ? "Organization Hiring Lead"
                  : "Individual Candidate",
              organization:
                resolvedRole === "admin"
                  ? "VeriSphere Core Admin"
                  : resolvedRole === "org"
                  ? "Organization Workspace"
                  : "Personal Account",
            },
          },
        });

        if (signUpErr) {
          setError(signUpErr.message);
          setSubmitting(false);
          return;
        }

        if (data.session) {
          await refreshSession();
          toast.success(
            `Account created as ${ROLE_DEFINITIONS[resolvedRole].label}!`
          );
          router.push(
            resolvedRole === "org" || resolvedRole === "admin"
              ? "/dashboard"
              : "/profile"
          );
        } else {
          setInfoMessage(
            "Confirmation link sent! Please check your email inbox to verify your Supabase account, then sign in."
          );
          setSubmitting(false);
        }
        return;
      }

      // Sign In with Supabase Auth
      const { data, error: signInErr } = await supabase.auth.signInWithPassword({
        email: cleanEmail,
        password,
      });

      if (signInErr) {
        setError(signInErr.message);
        setSubmitting(false);
        return;
      }

      // Sync chosen role into Supabase user_metadata (admin emails are always elevated to "admin")
      if (data.user) {
        const finalRole = resolveAccountRole(data.user.email, accountType);
        if (data.user.user_metadata?.account_type !== finalRole) {
          await supabase.auth.updateUser({
            data: { account_type: finalRole },
          });
        }
        await refreshSession();
        toast.success(`Signed in as ${ROLE_DEFINITIONS[finalRole].label}`);
        router.push(
          finalRole === "org" || finalRole === "admin" ? "/dashboard" : "/profile"
        );
      }
    } catch (err: any) {
      setError(err?.message || "Authentication failed.");
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-[calc(100vh-72px)] bg-[var(--bg-page)] flex flex-col items-center justify-center p-6 relative overflow-hidden">
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[620px] h-[620px] bg-[var(--brand-blue)] opacity-5 rounded-full blur-3xl pointer-events-none" />

      <motion.div
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
        className="w-full max-w-[480px] relative z-10"
      >
        <div className="text-center mb-6 flex flex-col items-center">
          <div className="w-14 h-14 bg-[var(--brand-blue)] rounded-2xl flex items-center justify-center mb-4 shadow-lg shadow-blue-500/20">
            <ShieldCheck className="text-white w-7 h-7" />
          </div>
          <h1 className="font-heading text-3xl font-bold text-[var(--text-primary)] tracking-tight">
            {mode === "signin" ? "Sign in to VeriSphere" : "Create your account"}
          </h1>
          <p className="text-sm text-[var(--text-secondary)] mt-1.5">
            Powered by Supabase Auth · Choose your account role to begin.
          </p>
        </div>

        <div className="bg-[var(--bg-surface)] p-7 sm:p-8 rounded-3xl border border-[var(--border)] shadow-[var(--shadow-lg)]">
          {!supabaseConfigured && (
            <div className="mb-5 p-3.5 rounded-xl bg-[var(--warning-bg)] border border-[var(--warning)]/40 text-xs text-[var(--text-primary)]">
              <strong className="text-[var(--warning)] block mb-1">
                Supabase Env Vars Required
              </strong>
              Add <code className="font-mono">NEXT_PUBLIC_SUPABASE_URL</code> and{" "}
              <code className="font-mono">NEXT_PUBLIC_SUPABASE_ANON_KEY</code> to{" "}
              <code className="font-mono">apps/web/.env.local</code> and restart the web server.
            </div>
          )}

          {/* STEP 1: Account Role Choice (Clearly Defined) */}
          <div className="mb-5">
            <label className="block text-xs font-bold uppercase tracking-wider text-[var(--text-tertiary)] mb-2">
              1. Select Account Role
            </label>
            <div className="grid grid-cols-2 gap-2.5">
              {(["individual", "org"] as const).map((roleKey) => {
                const def = ROLE_DEFINITIONS[roleKey];
                const selected = accountType === roleKey;
                const Icon = roleKey === "org" ? Building2 : User;
                return (
                  <button
                    key={roleKey}
                    type="button"
                    onClick={() => setAccountType(roleKey)}
                    className={`p-3.5 rounded-xl border text-left transition-all flex items-start gap-2.5 ${
                      selected
                        ? "bg-[var(--brand-blue-light)] border-[var(--brand-blue)] ring-1 ring-[var(--brand-blue)]/30"
                        : "bg-[var(--bg-subtle)] border-[var(--border)] hover:border-[var(--border-strong)]"
                    }`}
                  >
                    <div
                      className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                        selected
                          ? "bg-[var(--brand-blue)] text-white"
                          : "bg-[var(--bg-surface)] text-[var(--text-secondary)] border border-[var(--border)]"
                      }`}
                    >
                      <Icon size={16} />
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-[var(--text-primary)] leading-tight">
                        {roleKey === "org" ? "Organization" : "Individual"}
                      </div>
                      <div className="text-[10px] text-[var(--text-tertiary)] mt-0.5 leading-snug">
                        {roleKey === "org"
                          ? "Bulk upload & batches"
                          : "3 free credits / month"}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Clear Role Capabilities Preview */}
            <div className="mt-2.5 p-3 rounded-xl bg-[var(--bg-subtle)] border border-[var(--border)]">
              <div className="text-[11px] font-bold text-[var(--text-primary)] mb-1">
                {selectedRoleDef.label} Permissions:
              </div>
              <ul className="space-y-1">
                {selectedRoleDef.capabilities.slice(0, 3).map((cap) => (
                  <li
                    key={cap}
                    className="flex items-start gap-1.5 text-[11px] text-[var(--text-secondary)]"
                  >
                    <Check size={12} className="text-[var(--verified)] shrink-0 mt-0.5" />
                    <span>{cap}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* STEP 2: OAuth via Supabase */}
          <div className="space-y-2.5">
            <label className="block text-xs font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
              2. Authenticate via Supabase
            </label>
            <button
              type="button"
              disabled={oauthLoading !== null}
              onClick={() => handleOAuth("google")}
              className="w-full py-3 px-4 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface)] hover:bg-[var(--bg-subtle)] disabled:opacity-60 text-sm font-semibold text-[var(--text-primary)] flex items-center justify-center gap-3 transition-colors"
            >
              {oauthLoading === "google" ? (
                <Loader2 size={18} className="animate-spin text-[var(--brand-blue)]" />
              ) : (
                <GoogleIcon />
              )}
              <span>Continue with Google</span>
            </button>

            <button
              type="button"
              disabled={oauthLoading !== null}
              onClick={() => handleOAuth("github")}
              className="w-full py-3 px-4 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface)] hover:bg-[var(--bg-subtle)] disabled:opacity-60 text-sm font-semibold text-[var(--text-primary)] flex items-center justify-center gap-3 transition-colors"
            >
              {oauthLoading === "github" ? (
                <Loader2 size={18} className="animate-spin text-[var(--brand-blue)]" />
              ) : (
                <GitHubIcon />
              )}
              <span>Continue with GitHub</span>
            </button>
          </div>

          {/* Divider */}
          <div className="relative my-5 flex items-center">
            <div className="flex-grow border-t border-[var(--border)]" />
            <span className="px-3 text-xs font-medium text-[var(--text-tertiary)] uppercase tracking-wider">
              or with email
            </span>
            <div className="flex-grow border-t border-[var(--border)]" />
          </div>

          {/* Sign In / Sign Up Switch */}
          <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-[var(--bg-subtle)] border border-[var(--border)] mb-4">
            <button
              type="button"
              onClick={() => {
                setMode("signin");
                setError("");
                setInfoMessage("");
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
                setInfoMessage("");
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

          {typedEmailIsAdmin && (
            <div className="mb-4 p-3 rounded-xl bg-purple-500/10 border border-purple-500/30 flex items-center gap-2 text-xs text-purple-600 dark:text-purple-400">
              <Crown size={15} className="shrink-0" />
              <span>
                Admin email detected — this account will sign in with{" "}
                <strong>Admin (Unlimited Credits &amp; Controls)</strong>.
              </span>
            </div>
          )}

          {error && (
            <div className="mb-4 p-3 rounded-xl bg-[var(--danger-bg)] border border-[var(--danger)]/30 flex items-start gap-2.5 text-xs text-[var(--danger)]">
              <AlertCircle size={16} className="shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {infoMessage && (
            <div className="mb-4 p-3 rounded-xl bg-[var(--verified-bg)] border border-[var(--verified)]/30 text-xs text-[var(--verified)]">
              {infoMessage}
            </div>
          )}

          <form onSubmit={handleEmailAuth} className="space-y-3.5">
            {mode === "signup" && (
              <div>
                <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
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
              <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                Email Address
              </label>
              <div className="relative flex items-center">
                <Mail className="absolute left-3.5 text-[var(--text-tertiary)] w-4 h-4" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                  className="w-full bg-[var(--bg-subtle)] border border-[var(--border)] focus:border-[var(--brand-blue)] rounded-xl py-2.5 pl-10 pr-4 text-sm text-[var(--text-primary)] outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
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
                  <span>Authenticating via Supabase...</span>
                </>
              ) : (
                <>
                  <span>
                    {mode === "signin"
                      ? `Sign In as ${typedEmailIsAdmin ? "Admin" : selectedRoleDef.label}`
                      : `Create ${selectedRoleDef.label} Account`}
                  </span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>
        </div>

        <p className="mt-5 text-center text-xs text-[var(--text-tertiary)]">
          Secured by Supabase Auth (PKCE + SSR HTTP-only session cookies).{" "}
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
