"use client";

import React, { useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import {
  Check,
  Sparkles,
  ShieldCheck,
  Zap,
  Building2,
  CreditCard,
  Receipt,
  Coins,
  ArrowRight,
  Lock,
  AlertTriangle,
} from "lucide-react";
import {
  PaymentGatewayModal,
  CheckoutItem,
  Currency,
  DemoTransaction,
} from "@/components/ui/PaymentGatewayModal";
import { useAuth } from "@/components/auth-provider";

interface PlanDefinition {
  id: string;
  name: string;
  tagline: string;
  monthlyUSD: number;
  monthlyINR: number;
  popular?: boolean;
  badge?: string;
  credits: number | "Unlimited";
  features: string[];
  cta: string;
}

const PLANS: PlanDefinition[] = [
  {
    id: "starter",
    name: "Starter",
    tagline: "For individual candidates testing forensic resume verification.",
    monthlyUSD: 0,
    monthlyINR: 0,
    credits: 3,
    cta: "Current Plan",
    features: [
      "3 free candidate verifications / month",
      "Automatic monthly credit reset",
      "AI resume & GitHub cross-referencing",
      "Unified Trust Score (0–100)",
      "Basic risk indicator alerts",
    ],
  },
  {
    id: "pro",
    name: "Pro Recruiter",
    tagline: "Full forensic intelligence for scaling technical hiring teams.",
    monthlyUSD: 49,
    monthlyINR: 3999,
    popular: true,
    badge: "Most Popular",
    credits: 100,
    cta: "Upgrade to Pro",
    features: [
      "100 candidate verifications / month",
      "Deep PDF certificate tampering forensics",
      "SHA-256 document integrity verification",
      "AI-generated targeted interview questions",
      "Downloadable white-label PDF audit reports",
      "Priority GitHub & AI analysis queue",
    ],
  },
  {
    id: "enterprise",
    name: "Enterprise",
    tagline: "Unlimited forensic scale, custom SSO, and ATS API access.",
    monthlyUSD: 199,
    monthlyINR: 16499,
    badge: "Custom SLA",
    credits: "Unlimited",
    cta: "Upgrade to Enterprise",
    features: [
      "Unlimited candidate verifications",
      "REST API & ATS webhooks (Greenhouse, Lever)",
      "Dedicated PostgreSQL + NoSQL audit trails",
      "Role-based access control (RBAC) & SSO",
      "Custom university & issuer registries",
      "24/7 dedicated forensic engineering support",
    ],
  },
];

const CREDIT_PACKS = [
  {
    id: "credits-25",
    name: "25 Forensic Credits",
    subtitle: "Pay-as-you-go top-up · Never expires",
    credits: 25,
    priceUSD: 19,
    priceINR: 1499,
    badge: "Quick Top-Up",
  },
  {
    id: "credits-100",
    name: "100 Forensic Credits",
    subtitle: "Best value for campus hiring drives",
    credits: 100,
    priceUSD: 59,
    priceINR: 4799,
    badge: "Save 22%",
  },
  {
    id: "credits-500",
    name: "500 Forensic Credits",
    subtitle: "High-volume recruitment cohorts",
    credits: 500,
    priceUSD: 249,
    priceINR: 19999,
    badge: "Volume Pack",
  },
];

function formatPrice(amount: number, currency: Currency): string {
  if (amount === 0) return currency === "INR" ? "₹0" : "$0";
  if (currency === "INR") return `₹${Math.round(amount).toLocaleString("en-IN")}`;
  return `$${Math.round(amount)}`;
}

function PricingPageContent() {
  const searchParams = useSearchParams();
  const limitReached = searchParams.get("reason") === "limit_reached";
  const { billing, recordDemoPurchase } = useAuth();
  const [billingCycle, setBillingCycle] = useState<"monthly" | "annual">("monthly");
  const [currency, setCurrency] = useState<Currency>("USD");

  const activePlanId = billing.planId;
  const availableCredits = billing.credits;
  const transactions = billing.transactions;

  // Checkout modal state
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<CheckoutItem | null>(null);

  const openPlanCheckout = (plan: PlanDefinition) => {
    if (plan.monthlyUSD === 0) return;

    const multiplier = billingCycle === "annual" ? 0.8 * 12 : 1;
    setSelectedItem({
      id: `${plan.id}-${billingCycle}`,
      name: `VeriSphere ${plan.name}`,
      subtitle:
        billingCycle === "annual"
          ? "Billed annually (20% annual savings applied)"
          : "Billed monthly · Cancel anytime",
      type: "subscription",
      billingCycle,
      priceUSD: Math.round(plan.monthlyUSD * multiplier),
      priceINR: Math.round(plan.monthlyINR * multiplier),
      creditsIncluded: plan.credits,
      features: plan.features,
    });
    setCheckoutOpen(true);
  };

  const openCreditCheckout = (pack: (typeof CREDIT_PACKS)[number]) => {
    setSelectedItem({
      id: pack.id,
      name: pack.name,
      subtitle: pack.subtitle,
      type: "credits",
      priceUSD: pack.priceUSD,
      priceINR: pack.priceINR,
      creditsIncluded: pack.credits,
      features: [
        `${pack.credits} full forensic verification runs`,
        "Includes GitHub, Resume AI, & PDF forensics",
        "Credits roll over indefinitely",
        "Instant invoice generation",
      ],
    });
    setCheckoutOpen(true);
  };

  const handlePaymentSuccess = (tx: DemoTransaction) => {
    if (!selectedItem) return;
    const basePlanId = selectedItem.id.split("-")[0] as "starter" | "pro" | "enterprise";
    const planObj = PLANS.find((p) => p.id === basePlanId);

    recordDemoPurchase({
      transaction: tx,
      itemType: selectedItem.type,
      planId: selectedItem.type === "subscription" ? basePlanId : undefined,
      planName: selectedItem.type === "subscription" ? planObj?.name : undefined,
      billingCycle: selectedItem.billingCycle,
      creditsIncluded: selectedItem.creditsIncluded,
    });
  };

  const activePlanLabel = billing.planName || (PLANS.find((p) => p.id === activePlanId) || PLANS[0]).name;

  return (
    <main className="min-h-screen bg-[var(--bg-page)] pb-24">
      {/* Header Hero */}
      <section className="relative pt-14 pb-10 px-6 border-b border-[var(--border)] bg-[var(--bg-surface)] dot-pattern">
        <div className="max-w-[1200px] mx-auto text-center">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[var(--brand-blue-light)] border border-[var(--brand-blue)]/25 text-xs font-semibold text-[var(--brand-blue)] mb-5"
          >
            <Sparkles size={14} />
            <span>Interactive Sandbox Payment Gateway Demo</span>
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 }}
            className="font-heading font-bold text-3xl sm:text-5xl text-[var(--text-primary)] tracking-tight max-w-3xl mx-auto"
          >
            Transparent Pricing for{" "}
            <span className="text-[var(--brand-blue)]">Forensic Hiring</span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="mt-4 text-base text-[var(--text-secondary)] max-w-2xl mx-auto"
          >
            Verify resumes, GitHub repositories, academic credentials, and PDF certificates at scale.
            Select any plan or credit pack below to experience the full VeriSphere checkout flow.
          </motion.p>

          {/* Controls: Billing Toggle + Currency Switcher */}
          <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
            {/* Monthly / Annual */}
            <div className="inline-flex items-center p-1 rounded-xl bg-[var(--bg-subtle)] border border-[var(--border)]">
              <button
                onClick={() => setBillingCycle("monthly")}
                className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all ${
                  billingCycle === "monthly"
                    ? "bg-[var(--bg-surface)] text-[var(--text-primary)] shadow-sm border border-[var(--border)]"
                    : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                }`}
              >
                Monthly Billing
              </button>
              <button
                onClick={() => setBillingCycle("annual")}
                className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
                  billingCycle === "annual"
                    ? "bg-[var(--bg-surface)] text-[var(--text-primary)] shadow-sm border border-[var(--border)]"
                    : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                }`}
              >
                <span>Annual Billing</span>
                <span className="px-1.5 py-0.5 rounded bg-[var(--verified-bg)] text-[var(--verified)] text-[10px] font-bold">
                  -20%
                </span>
              </button>
            </div>

            {/* Currency Switcher */}
            <div className="inline-flex items-center p-1 rounded-xl bg-[var(--bg-subtle)] border border-[var(--border)]">
              {(["USD", "INR"] as const).map((curr) => (
                <button
                  key={curr}
                  onClick={() => setCurrency(curr)}
                  className={`px-3.5 py-2 rounded-lg text-xs font-mono font-semibold transition-all ${
                    currency === curr
                      ? "bg-[var(--bg-surface)] text-[var(--brand-blue)] shadow-sm border border-[var(--border)]"
                      : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                  }`}
                >
                  {curr === "USD" ? "$ USD" : "₹ INR"}
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      <div className="max-w-[1200px] mx-auto px-6 mt-10 space-y-14">
        {/* Free Credit Limit Reached Banner */}
        {limitReached && (
          <div className="rounded-2xl p-5 bg-[var(--warning-bg)] border border-[var(--warning)]/40 flex flex-col sm:flex-row items-start sm:items-center gap-3.5 shadow-sm">
            <AlertTriangle size={22} className="text-[var(--warning)] shrink-0" />
            <div className="flex-1">
              <h3 className="font-heading font-bold text-sm text-[var(--text-primary)]">
                Free Monthly Verification Limit Reached (0 / 3 Credits Remaining)
              </h3>
              <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                Upgrade to <strong>Pro Recruiter</strong> or purchase a one-time credit pack below to continue verifying resumes immediately, or wait for your automatic monthly reset on{" "}
                <strong>{billing.renewalDate}</strong>.
              </p>
            </div>
          </div>
        )}

        {/* Current Workspace Billing Status Banner */}
        <div className="rounded-2xl p-5 sm:p-6 bg-[var(--bg-surface)] border border-[var(--border)] shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-[var(--brand-blue-light)] border border-[var(--brand-blue)]/25 flex items-center justify-center text-[var(--brand-blue)] shrink-0">
              <ShieldCheck size={24} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-[var(--text-tertiary)]">
                  Active Workspace Plan
                </span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[var(--verified-bg)] text-[var(--verified)]">
                  ACTIVE
                </span>
              </div>
              <h2 className="font-heading font-bold text-xl text-[var(--text-primary)] mt-0.5">
                VeriSphere {activePlanLabel}
              </h2>
            </div>
          </div>

          <div className="flex items-center gap-6 w-full sm:w-auto justify-between sm:justify-end border-t sm:border-t-0 pt-4 sm:pt-0 border-[var(--border)]">
            <div>
              <div className="text-[11px] font-medium text-[var(--text-tertiary)] uppercase tracking-wider">
                Available Credits
              </div>
              <div className="font-heading font-bold text-xl text-[var(--brand-blue)]">
                {availableCredits === "Unlimited" ? "∞ Unlimited" : `${availableCredits} Credits`}
              </div>
            </div>
            <div className="text-right">
              <div className="text-[11px] font-medium text-[var(--text-tertiary)] uppercase tracking-wider">
                Gateway Mode
              </div>
              <div className="text-xs font-mono font-semibold text-[var(--warning)]">
                SANDBOX DEMO
              </div>
            </div>
          </div>
        </div>

        {/* Subscription Tiers Grid */}
        <section>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {PLANS.map((plan, index) => {
              const isCurrent = activePlanId === plan.id;
              const rawMonthly = currency === "INR" ? plan.monthlyINR : plan.monthlyUSD;
              const displayMonthly =
                billingCycle === "annual" ? rawMonthly * 0.8 : rawMonthly;

              return (
                <motion.div
                  key={plan.id}
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.08 }}
                  className={`relative rounded-2xl p-6 sm:p-7 flex flex-col justify-between transition-all ${
                    plan.popular
                      ? "bg-[var(--bg-surface)] border-2 border-[var(--brand-blue)] shadow-lg"
                      : "bg-[var(--bg-surface)] border border-[var(--border)] shadow-sm hover:border-[var(--border-strong)]"
                  }`}
                >
                  {plan.badge && (
                    <div
                      className={`absolute -top-3 right-6 px-3 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider shadow-sm ${
                        plan.popular
                          ? "bg-[var(--brand-blue)] text-white"
                          : "bg-[var(--bg-subtle)] text-[var(--text-secondary)] border border-[var(--border-strong)]"
                      }`}
                    >
                      {plan.badge}
                    </div>
                  )}

                  <div>
                    <div className="flex items-center gap-2.5 mb-2">
                      {plan.id === "starter" && <Zap size={18} className="text-[var(--text-secondary)]" />}
                      {plan.id === "pro" && <Sparkles size={18} className="text-[var(--brand-blue)]" />}
                      {plan.id === "enterprise" && <Building2 size={18} className="text-[var(--brand-navy)]" />}
                      <h3 className="font-heading font-bold text-xl text-[var(--text-primary)]">
                        {plan.name}
                      </h3>
                    </div>

                    <p className="text-xs text-[var(--text-secondary)] min-h-[36px]">
                      {plan.tagline}
                    </p>

                    <div className="mt-5 pb-5 border-b border-[var(--border)]">
                      <div className="flex items-baseline gap-1.5">
                        <span className="font-heading font-bold text-4xl text-[var(--text-primary)]">
                          {formatPrice(displayMonthly, currency)}
                        </span>
                        <span className="text-sm text-[var(--text-tertiary)]">/ month</span>
                      </div>
                      <p className="text-[11px] text-[var(--text-tertiary)] mt-1">
                        {plan.monthlyUSD === 0
                          ? "Free forever · No credit card required"
                          : billingCycle === "annual"
                          ? `Billed ${formatPrice(displayMonthly * 12, currency)} annually`
                          : "Billed monthly · Cancel anytime"}
                      </p>
                    </div>

                    <ul className="mt-5 space-y-3">
                      {plan.features.map((feature) => (
                        <li
                          key={feature}
                          className="flex items-start gap-2.5 text-sm text-[var(--text-secondary)]"
                        >
                          <Check
                            size={16}
                            className="text-[var(--verified)] shrink-0 mt-0.5"
                          />
                          <span>{feature}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <button
                    onClick={() => openPlanCheckout(plan)}
                    disabled={isCurrent || plan.monthlyUSD === 0}
                    className={`mt-8 w-full py-3 px-4 rounded-xl font-heading font-semibold text-sm flex items-center justify-center gap-2 transition-all ${
                      isCurrent
                        ? "bg-[var(--verified-bg)] text-[var(--verified)] border border-[var(--verified)]/30 cursor-default"
                        : plan.popular
                        ? "bg-[var(--brand-blue)] text-white hover:opacity-95 shadow-md"
                        : plan.monthlyUSD === 0
                        ? "bg-[var(--bg-subtle)] text-[var(--text-tertiary)] border border-[var(--border)] cursor-default"
                        : "bg-[var(--bg-subtle)] text-[var(--text-primary)] border border-[var(--border-strong)] hover:bg-[var(--bg-muted)]"
                    }`}
                  >
                    {isCurrent ? (
                      <>
                        <Check size={16} />
                        <span>Active Plan</span>
                      </>
                    ) : (
                      <>
                        <CreditCard size={15} />
                        <span>{plan.cta}</span>
                        {plan.monthlyUSD > 0 && <ArrowRight size={15} />}
                      </>
                    )}
                  </button>
                </motion.div>
              );
            })}
          </div>
        </section>

        {/* Pay-As-You-Go Forensic Credit Packs */}
        <section>
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-2 mb-5">
            <div>
              <div className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-[var(--brand-blue)] mb-1">
                <Coins size={14} />
                <span>Pay-As-You-Go Top-Ups</span>
              </div>
              <h2 className="font-heading font-bold text-2xl text-[var(--text-primary)]">
                One-Time Forensic Credit Packs
              </h2>
            </div>
            <p className="text-xs text-[var(--text-secondary)]">
              Need extra verifications for a campus drive? Buy credits without changing your subscription.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {CREDIT_PACKS.map((pack) => (
              <div
                key={pack.id}
                className="rounded-2xl p-5 bg-[var(--bg-surface)] border border-[var(--border)] hover:border-[var(--brand-blue)]/50 transition-all shadow-sm flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-[var(--brand-blue-light)] text-[var(--brand-blue)]">
                      {pack.badge}
                    </span>
                    <span className="font-heading font-bold text-xl text-[var(--text-primary)]">
                      {formatPrice(
                        currency === "INR" ? pack.priceINR : pack.priceUSD,
                        currency
                      )}
                    </span>
                  </div>
                  <h3 className="font-heading font-bold text-base text-[var(--text-primary)]">
                    {pack.name}
                  </h3>
                  <p className="text-xs text-[var(--text-secondary)] mt-1">
                    {pack.subtitle}
                  </p>
                </div>

                <button
                  onClick={() => openCreditCheckout(pack)}
                  className="mt-5 w-full py-2.5 px-4 rounded-xl bg-[var(--bg-subtle)] hover:bg-[var(--brand-blue)] hover:text-white border border-[var(--border-strong)] hover:border-[var(--brand-blue)] text-xs font-semibold text-[var(--text-primary)] transition-all flex items-center justify-center gap-1.5"
                >
                  <span>Purchase Pack</span>
                  <ArrowRight size={14} />
                </button>
              </div>
            ))}
          </div>
        </section>

        {/* Demo Billing & Transaction History */}
        <section className="rounded-2xl bg-[var(--bg-surface)] border border-[var(--border)] shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-[var(--border)] flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <Receipt size={18} className="text-[var(--brand-blue)]" />
              <h2 className="font-heading font-bold text-base text-[var(--text-primary)]">
                Billing History & Receipts (Session Demo)
              </h2>
            </div>
            <span className="inline-flex items-center gap-1 text-[11px] text-[var(--text-tertiary)]">
              <Lock size={12} />
              Simulated Ledger
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[var(--border)] bg-[var(--bg-subtle)] text-[11px] font-semibold uppercase tracking-wider text-[var(--text-tertiary)]">
                  <th className="py-3 px-6">Invoice</th>
                  <th className="py-3 px-6">Description</th>
                  <th className="py-3 px-6">Method</th>
                  <th className="py-3 px-6">Date</th>
                  <th className="py-3 px-6">Amount</th>
                  <th className="py-3 px-6 text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)] text-sm">
                {transactions.map((tx) => (
                  <tr
                    key={tx.id}
                    className="hover:bg-[var(--bg-subtle)]/50 transition-colors"
                  >
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
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-[var(--verified-bg)] text-[var(--verified)]">
                        <Check size={11} />
                        {tx.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      {/* Interactive Payment Gateway Modal */}
      <PaymentGatewayModal
        isOpen={checkoutOpen}
        onClose={() => setCheckoutOpen(false)}
        item={selectedItem}
        currency={currency}
        onSuccess={handlePaymentSuccess}
      />
    </main>
  );
}

export default function PricingPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[var(--bg-page)]" />}>
      <PricingPageContent />
    </Suspense>
  );
}

