"use client";

import React, { useState, useEffect, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import {
  User,
  ShieldCheck,
  CreditCard,
  Receipt,
  Settings,
  LogOut,
  Check,
  Sparkles,
  ArrowRight,
  Download,
  Lock,
  Calendar,
  Coins,
  Building2,
  Loader2,
  CheckCircle2,
  KeyRound,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/components/auth-provider";
import type { DemoTransaction } from "@/components/ui/PaymentGatewayModal";

const PLAN_FEATURES: Record<string, string[]> = {
  starter: [
    "3 free candidate verifications / month",
    "Automatic 1-month credit reset",
    "AI resume & GitHub cross-referencing",
    "Unified Trust Score (0–100)",
    "Basic risk indicator alerts",
  ],
  pro: [
    "100 candidate verifications / month",
    "Deep PDF certificate tampering forensics",
    "SHA-256 document integrity verification",
    "AI-generated targeted interview questions",
    "Downloadable white-label PDF audit reports",
    "Priority GitHub & AI analysis queue",
  ],
  enterprise: [
    "Unlimited candidate verifications",
    "REST API & ATS webhooks (Greenhouse, Lever)",
    "Dedicated PostgreSQL + NoSQL audit trails",
    "Role-based access control (RBAC) & SSO",
    "Custom university & issuer registries",
    "24/7 dedicated forensic engineering support",
  ],
};

function ProfileContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const {
    user,
    providers,
    loading,
    billing,
    logout,
    updateProfile,
    downgradeToStarter,
  } = useAuth();

  const [activeTab, setActiveTab] = useState<"plan" | "billing" | "security">("plan");

  // Editable profile fields
  const [editName, setEditName] = useState("");
  const [editRole, setEditRole] = useState("");
  const [editOrg, setEditOrg] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);

  useEffect(() => {
    const welcome = searchParams.get("welcome");
    if (welcome === "google") {
      toast.success("Signed in securely with Google OAuth 2.0!");
    } else if (welcome === "github") {
      toast.success("Signed in securely with GitHub OAuth 2.0!");
    }
  }, [searchParams]);

  useEffect(() => {
    if (user) {
      setEditName(user.name);
      setEditRole(user.role);
      setEditOrg(user.organization);
    }
  }, [user]);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingProfile(true);
    const ok = await updateProfile({
      name: editName,
      role: editRole,
      organization: editOrg,
    });
    setSavingProfile(false);
    if (ok) {
      toast.success("Profile updated in signed session.");
    } else {
      toast.error("Failed to update profile.");
    }
  };

  const handleLogout = async () => {
    await logout();
    toast.success("Signed out safely.");
    router.push("/login");
  };

  const handleDownloadReceipt = (tx: DemoTransaction) => {
    const content = [
      "====================================================",
      "           VERISPHERE PAYMENT RECEIPT (DEMO)        ",
      "====================================================",
      `Invoice Number : ${tx.invoiceNumber}`,
      `Transaction ID : ${tx.id}`,
      `Date           : ${tx.date}`,
      `Account        : ${user?.email || "guest@verisphere.ai"}`,
      "----------------------------------------------------",
      `Description    : ${tx.itemName}`,
      `Payment Method : ${tx.methodLabel}`,
      `Amount Paid    : ${tx.amountFormatted}`,
      `Status         : ${tx.status} (SANDBOX DEMO)`,
      "====================================================",
    ].join("\n");

    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${tx.invoiceNumber}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Downloaded ${tx.invoiceNumber}`);
  };

  if (loading) {
    return (
      <div className="min-h-[calc(100vh-72px)] flex items-center justify-center bg-[var(--bg-page)]">
        <Loader2 className="w-7 h-7 animate-spin text-[var(--brand-blue)]" />
      </div>
    );
  }

  if (!user) {
    return (
      <main className="min-h-[calc(100vh-72px)] bg-[var(--bg-page)] flex items-center justify-center p-6">
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-md w-full rounded-3xl bg-[var(--bg-surface)] border border-[var(--border)] shadow-[var(--shadow-lg)] p-8 text-center"
        >
          <div className="w-14 h-14 rounded-2xl bg-[var(--brand-blue-light)] text-[var(--brand-blue)] flex items-center justify-center mx-auto mb-5">
            <User size={26} />
          </div>
          <h1 className="font-heading font-bold text-2xl text-[var(--text-primary)]">
            Sign in to view your Profile
          </h1>
          <p className="text-sm text-[var(--text-secondary)] mt-2 mb-6">
            Access your active VeriSphere plan, forensic verification credits, billing receipts, and OAuth security settings.
          </p>
          <div className="flex flex-col gap-3">
            <Link
              href="/login"
              className="w-full py-3 px-4 rounded-xl bg-[var(--brand-blue)] text-white font-heading font-semibold text-sm flex items-center justify-center gap-2 hover:opacity-95 transition-opacity"
            >
              <span>Sign In / OAuth Login</span>
              <ArrowRight size={16} />
            </Link>
            <Link
              href="/pricing"
              className="w-full py-3 px-4 rounded-xl bg-[var(--bg-subtle)] border border-[var(--border)] text-[var(--text-primary)] font-semibold text-sm hover:bg-[var(--bg-muted)] transition-colors"
            >
              Browse Pricing Plans
            </Link>
          </div>
        </motion.div>
      </main>
    );
  }

  const initials = user.name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  const features = PLAN_FEATURES[billing.planId] || PLAN_FEATURES.starter;

  const creditPercent =
    billing.credits === "Unlimited" || billing.creditsLimit === "Unlimited"
      ? 100
      : Math.min(
          100,
          Math.round((billing.credits / Math.max(1, billing.creditsLimit)) * 100)
        );

  const providerLabel =
    user.provider === "google"
      ? "Google OAuth 2.0"
      : user.provider === "github"
      ? "GitHub OAuth 2.0"
      : "Email & Password";

  return (
    <main className="min-h-[calc(100vh-72px)] bg-[var(--bg-page)] pb-20">
      {/* Top Profile Banner */}
      <section className="bg-[var(--bg-surface)] border-b border-[var(--border)] py-10 px-6 dot-pattern">
        <div className="max-w-[1160px] mx-auto flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="flex items-center gap-5">
            {user.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={user.avatarUrl}
                alt={user.name}
                className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl object-cover border-2 border-[var(--brand-blue)]/30 shadow-md shrink-0"
              />
            ) : (
              <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-gradient-to-br from-[#1B3A6B] to-[#2563EB] text-white font-heading font-bold text-2xl flex items-center justify-center shadow-md shrink-0">
                {initials}
              </div>
            )}

            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="font-heading font-bold text-2xl sm:text-3xl text-[var(--text-primary)] tracking-tight">
                  {user.name}
                </h1>
                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wider bg-[var(--bg-subtle)] text-[var(--text-secondary)] border border-[var(--border-strong)]">
                  {user.accountType === "org" ? "Organization" : "Individual"}
                </span>
                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wider bg-[var(--brand-blue-light)] text-[var(--brand-blue)] border border-[var(--brand-blue)]/25">
                  {billing.planName} Plan
                </span>
              </div>

              <p className="text-sm text-[var(--text-secondary)] mt-1">
                {user.email} · {user.role} at {user.organization}
              </p>

              <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-[var(--text-tertiary)]">
                <span className="inline-flex items-center gap-1 text-[var(--verified)] font-medium">
                  <ShieldCheck size={14} />
                  Authenticated via {providerLabel}
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Link
              href="/pricing"
              className="px-4 py-2.5 rounded-xl bg-[var(--brand-blue)] text-white text-xs sm:text-sm font-semibold flex items-center gap-2 hover:opacity-95 shadow-sm transition-opacity"
            >
              <Sparkles size={15} />
              <span>Upgrade / Buy Credits</span>
            </Link>
            <button
              onClick={handleLogout}
              className="px-4 py-2.5 rounded-xl bg-[var(--bg-subtle)] border border-[var(--border-strong)] text-xs sm:text-sm font-semibold text-[var(--text-secondary)] hover:text-[var(--danger)] hover:border-[var(--danger)]/40 flex items-center gap-2 transition-colors"
            >
              <LogOut size={15} />
              <span>Sign Out</span>
            </button>
          </div>
        </div>
      </section>

      <div className="max-w-[1160px] mx-auto px-6 mt-8">
        {/* Quick KPI Row */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <div className="p-5 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border)] shadow-sm">
            <div className="flex items-center justify-between text-[var(--text-tertiary)] mb-2">
              <span className="text-xs font-medium uppercase tracking-wider">Current Plan</span>
              <Sparkles size={16} className="text-[var(--brand-blue)]" />
            </div>
            <div className="font-heading font-bold text-xl text-[var(--text-primary)]">
              {billing.planName}
            </div>
            <div className="text-xs text-[var(--text-tertiary)] mt-1 capitalize">
              {billing.billingCycle} billing
            </div>
          </div>

          <div className="p-5 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border)] shadow-sm">
            <div className="flex items-center justify-between text-[var(--text-tertiary)] mb-2">
              <span className="text-xs font-medium uppercase tracking-wider">Credits Left</span>
              <Coins size={16} className="text-[var(--verified)]" />
            </div>
            <div className="font-heading font-bold text-xl text-[var(--brand-blue)]">
              {billing.credits === "Unlimited" ? "∞ Unlimited" : billing.credits}
            </div>
            <div className="text-xs text-[var(--text-tertiary)] mt-1">
              Ready for verifications
            </div>
          </div>

          <div className="p-5 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border)] shadow-sm">
            <div className="flex items-center justify-between text-[var(--text-tertiary)] mb-2">
              <span className="text-xs font-medium uppercase tracking-wider">Next Renewal</span>
              <Calendar size={16} className="text-[var(--text-secondary)]" />
            </div>
            <div className="font-heading font-bold text-xl text-[var(--text-primary)]">
              {billing.renewalDate}
            </div>
            <div className="text-xs text-[var(--text-tertiary)] mt-1">
              Sandbox demo cycle
            </div>
          </div>

          <div className="p-5 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border)] shadow-sm">
            <div className="flex items-center justify-between text-[var(--text-tertiary)] mb-2">
              <span className="text-xs font-medium uppercase tracking-wider">Invoices</span>
              <Receipt size={16} className="text-[var(--text-secondary)]" />
            </div>
            <div className="font-heading font-bold text-xl text-[var(--text-primary)]">
              {billing.transactions.length}
            </div>
            <div className="text-xs text-[var(--verified)] mt-1 font-medium">
              All paid & current
            </div>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex flex-wrap gap-2 border-b border-[var(--border)] mb-7">
          {[
            { id: "plan" as const, label: "Plan & Usage", icon: CreditCard },
            { id: "billing" as const, label: "Billing & Invoices", icon: Receipt },
            { id: "security" as const, label: "Account & OAuth Security", icon: Settings },
          ].map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`inline-flex items-center gap-2 px-5 py-3 text-sm font-heading font-semibold border-b-2 transition-colors ${
                  active
                    ? "border-[var(--brand-blue)] text-[var(--brand-blue)]"
                    : "border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                }`}
              >
                <Icon size={16} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* TAB 1: Plan & Usage */}
        {activeTab === "plan" && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-7 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border)] shadow-sm p-6 sm:p-7">
              <div className="flex items-start justify-between gap-4 pb-5 border-b border-[var(--border)]">
                <div>
                  <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--brand-blue)]">
                    Subscription Details
                  </span>
                  <h2 className="font-heading font-bold text-2xl text-[var(--text-primary)] mt-1">
                    VeriSphere {billing.planName}
                  </h2>
                  <p className="text-xs text-[var(--text-secondary)] mt-1">
                    {billing.planId === "starter"
                      ? "Free workspace tier · Upgrade anytime for deep PDF forensics & unlimited scale."
                      : `Active ${billing.billingCycle} subscription · Renews on ${billing.renewalDate}`}
                  </p>
                </div>
                <span className="px-3 py-1 rounded-full text-xs font-bold bg-[var(--verified-bg)] text-[var(--verified)]">
                  ACTIVE
                </span>
              </div>

              {/* Credit Meter */}
              <div className="my-6">
                <div className="flex items-center justify-between text-xs font-medium mb-2">
                  <span className="text-[var(--text-secondary)]">
                    Forensic Verification Credits
                  </span>
                  <span className="font-mono font-bold text-[var(--text-primary)]">
                    {billing.credits === "Unlimited"
                      ? "Unlimited Available"
                      : `${billing.credits} / ${billing.creditsLimit} available`}
                  </span>
                </div>
                <div className="w-full h-2.5 rounded-full bg-[var(--bg-muted)] overflow-hidden">
                  <div
                    className="h-full rounded-full bg-[var(--brand-blue)] transition-all duration-500"
                    style={{ width: `${creditPercent}%` }}
                  />
                </div>
              </div>

              {/* Plan Features */}
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-tertiary)] mb-3">
                  Included in Your Plan
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {features.map((feat) => (
                    <div
                      key={feat}
                      className="flex items-start gap-2 text-sm text-[var(--text-secondary)]"
                    >
                      <Check size={15} className="text-[var(--verified)] shrink-0 mt-0.5" />
                      <span>{feat}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Actions */}
              <div className="mt-7 pt-5 border-t border-[var(--border)] flex flex-wrap items-center gap-3">
                <Link
                  href="/pricing"
                  className="px-4 py-2.5 rounded-xl bg-[var(--brand-blue)] text-white text-xs font-semibold inline-flex items-center gap-1.5 hover:opacity-95"
                >
                  <span>Change Plan</span>
                  <ArrowRight size={14} />
                </Link>
                <Link
                  href="/pricing"
                  className="px-4 py-2.5 rounded-xl bg-[var(--bg-subtle)] border border-[var(--border-strong)] text-[var(--text-primary)] text-xs font-semibold hover:bg-[var(--bg-muted)]"
                >
                  Buy Extra Credits
                </Link>
                {billing.planId !== "starter" && (
                  <button
                    type="button"
                    onClick={() => {
                      downgradeToStarter();
                      toast.info("Workspace reset to Starter (Demo).");
                    }}
                    className="ml-auto text-xs font-medium text-[var(--text-tertiary)] hover:text-[var(--danger)] transition-colors"
                  >
                    Downgrade to Starter
                  </button>
                )}
              </div>
            </div>

            {/* Right Quick Shortcuts */}
            <div className="lg:col-span-5 space-y-5">
              <div className="rounded-2xl bg-[var(--bg-surface)] border border-[var(--border)] shadow-sm p-6">
                <h3 className="font-heading font-bold text-base text-[var(--text-primary)] mb-2">
                  Ready to verify a candidate?
                </h3>
                <p className="text-xs text-[var(--text-secondary)] mb-4">
                  Each forensic run cross-checks resume claims, GitHub repos, academic records, and PDF certificate metadata.
                </p>
                <Link
                  href="/verify"
                  className="w-full py-2.5 px-4 rounded-xl bg-[var(--brand-blue-light)] text-[var(--brand-blue)] border border-[var(--brand-blue)]/25 font-semibold text-xs flex items-center justify-center gap-2 hover:opacity-90"
                >
                  <span>Launch New Verification</span>
                  <ArrowRight size={14} />
                </Link>
              </div>

              <div className="rounded-2xl bg-[var(--bg-surface)] border border-[var(--border)] shadow-sm p-6">
                <div className="flex items-center gap-2 text-[var(--verified)] text-xs font-bold uppercase tracking-wider mb-2">
                  <Lock size={14} />
                  <span>Session Security Active</span>
                </div>
                <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                  Your account session is protected by an HMAC-SHA256 signed <code className="px-1 py-0.5 rounded bg-[var(--bg-subtle)] font-mono">HttpOnly</code> cookie with CSRF protection.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: Billing & Invoices */}
        {activeTab === "billing" && (
          <div className="rounded-2xl bg-[var(--bg-surface)] border border-[var(--border)] shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-[var(--border)] flex items-center justify-between">
              <h2 className="font-heading font-bold text-base text-[var(--text-primary)]">
                Payment History & Receipts
              </h2>
              <Link
                href="/pricing"
                className="text-xs font-semibold text-[var(--brand-blue)] hover:underline"
              >
                + New Purchase
              </Link>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-[var(--border)] bg-[var(--bg-subtle)] text-[11px] font-semibold uppercase tracking-wider text-[var(--text-tertiary)]">
                    <th className="py-3 px-6">Invoice</th>
                    <th className="py-3 px-6">Item</th>
                    <th className="py-3 px-6">Method</th>
                    <th className="py-3 px-6">Date</th>
                    <th className="py-3 px-6">Amount</th>
                    <th className="py-3 px-6 text-right">Receipt</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)] text-sm">
                  {billing.transactions.map((tx) => (
                    <tr key={tx.id} className="hover:bg-[var(--bg-subtle)]/50">
                      <td className="py-3.5 px-6 font-mono text-xs font-medium text-[var(--text-primary)]">
                        {tx.invoiceNumber}
                      </td>
                      <td className="py-3.5 px-6 text-[var(--text-primary)] font-medium">
                        {tx.itemName}
                      </td>
                      <td className="py-3.5 px-6 text-xs text-[var(--text-secondary)]">
                        {tx.methodLabel}
                      </td>
                      <td className="py-3.5 px-6 text-xs text-[var(--text-secondary)]">
                        {tx.date}
                      </td>
                      <td className="py-3.5 px-6 font-heading font-semibold text-[var(--text-primary)]">
                        {tx.amountFormatted}
                      </td>
                      <td className="py-3.5 px-6 text-right">
                        <button
                          onClick={() => handleDownloadReceipt(tx)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--bg-subtle)] hover:bg-[var(--bg-muted)] border border-[var(--border)] text-xs font-semibold text-[var(--text-primary)] transition-colors"
                        >
                          <Download size={13} />
                          <span>Receipt</span>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 3: Account & OAuth Security */}
        {activeTab === "security" && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Edit Profile Form */}
            <form
              onSubmit={handleSaveProfile}
              className="lg:col-span-6 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border)] shadow-sm p-6 space-y-4"
            >
              <h2 className="font-heading font-bold text-lg text-[var(--text-primary)]">
                Profile Information
              </h2>

              <div>
                <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                  Full Name
                </label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-sm rounded-xl bg-[var(--bg-subtle)] border border-[var(--border)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--brand-blue)]"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                  Email Address (Read-only)
                </label>
                <input
                  type="email"
                  value={user.email}
                  disabled
                  className="w-full px-3.5 py-2.5 text-sm rounded-xl bg-[var(--bg-muted)] border border-[var(--border)] text-[var(--text-tertiary)] cursor-not-allowed"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                    Role / Title
                  </label>
                  <input
                    type="text"
                    value={editRole}
                    onChange={(e) => setEditRole(e.target.value)}
                    className="w-full px-3.5 py-2.5 text-sm rounded-xl bg-[var(--bg-subtle)] border border-[var(--border)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--brand-blue)]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                    Organization
                  </label>
                  <div className="relative flex items-center">
                    <Building2 size={15} className="absolute left-3 text-[var(--text-tertiary)]" />
                    <input
                      type="text"
                      value={editOrg}
                      onChange={(e) => setEditOrg(e.target.value)}
                      className="w-full pl-9 pr-3.5 py-2.5 text-sm rounded-xl bg-[var(--bg-subtle)] border border-[var(--border)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--brand-blue)]"
                    />
                  </div>
                </div>
              </div>

              <button
                type="submit"
                disabled={savingProfile}
                className="px-5 py-2.5 rounded-xl bg-[var(--brand-blue)] text-white text-xs font-semibold hover:opacity-95 disabled:opacity-60 inline-flex items-center gap-2"
              >
                {savingProfile && <Loader2 size={14} className="animate-spin" />}
                <span>Save Profile Changes</span>
              </button>
            </form>

            {/* Connected OAuth & Security Specs */}
            <div className="lg:col-span-6 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border)] shadow-sm p-6 space-y-5">
              <div className="flex items-center gap-2">
                <KeyRound size={18} className="text-[var(--brand-blue)]" />
                <h2 className="font-heading font-bold text-lg text-[var(--text-primary)]">
                  Connected OAuth Providers & Security
                </h2>
              </div>

              <div className="space-y-3">
                {[
                  {
                    id: "google",
                    name: "Google OAuth 2.0",
                    connected: user.provider === "google",
                    configured: providers.google,
                  },
                  {
                    id: "github",
                    name: "GitHub OAuth 2.0",
                    connected: user.provider === "github",
                    configured: providers.github,
                  },
                ].map((p) => (
                  <div
                    key={p.id}
                    className="flex items-center justify-between p-3.5 rounded-xl bg-[var(--bg-subtle)] border border-[var(--border)]"
                  >
                    <div>
                      <div className="text-sm font-semibold text-[var(--text-primary)]">
                        {p.name}
                      </div>
                      <div className="text-[11px] text-[var(--text-tertiary)]">
                        {p.connected
                          ? "Active sign-in provider for this session"
                          : p.configured
                          ? "Configured & ready on server"
                          : "Add client ID & secret in .env to activate"}
                      </div>
                    </div>
                    {p.connected ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-[var(--verified-bg)] text-[var(--verified)]">
                        <CheckCircle2 size={12} /> Connected
                      </span>
                    ) : (
                      <span className="px-2.5 py-1 rounded-full text-[11px] font-medium bg-[var(--bg-surface)] border border-[var(--border)] text-[var(--text-tertiary)]">
                        {p.configured ? "Available" : "Not Set"}
                      </span>
                    )}
                  </div>
                ))}
              </div>

              <div className="pt-3 border-t border-[var(--border)]">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-tertiary)] mb-2.5">
                  Active Security Controls
                </h3>
                <div className="grid grid-cols-2 gap-2 text-xs text-[var(--text-secondary)]">
                  <div className="flex items-center gap-1.5">
                    <Check size={14} className="text-[var(--verified)]" />
                    <span>PKCE S256 Challenge</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Check size={14} className="text-[var(--verified)]" />
                    <span>Timing-Safe CSRF State</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Check size={14} className="text-[var(--verified)]" />
                    <span>HttpOnly Signed Cookie</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Check size={14} className="text-[var(--verified)]" />
                    <span>Server-Side Token Exchange</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}

export default function ProfilePage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-[calc(100vh-72px)] flex items-center justify-center bg-[var(--bg-page)]">
          <Loader2 className="w-7 h-7 animate-spin text-[var(--brand-blue)]" />
        </div>
      }
    >
      <ProfileContent />
    </Suspense>
  );
}

