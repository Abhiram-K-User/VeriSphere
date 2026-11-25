"use client";

import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X,
  Lock,
  ShieldCheck,
  CreditCard,
  Smartphone,
  Building2,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  Tag,
  ArrowRight,
  Loader2,
  Download,
  RotateCcw,
  Check,
  QrCode,
  FileText,
} from "lucide-react";
import { toast } from "sonner";

export type Currency = "USD" | "INR";
export type PaymentMethod = "card" | "upi" | "netbanking";

export interface CheckoutItem {
  id: string;
  name: string;
  subtitle: string;
  type: "subscription" | "credits";
  billingCycle?: "monthly" | "annual";
  priceUSD: number;
  priceINR: number;
  creditsIncluded: number | "Unlimited";
  features: string[];
}

export interface DemoTransaction {
  id: string;
  invoiceNumber: string;
  itemName: string;
  amountFormatted: string;
  currency: Currency;
  methodLabel: string;
  status: "PAID";
  date: string;
  creditsAdded: number | "Unlimited";
}

interface PaymentGatewayModalProps {
  isOpen: boolean;
  onClose: () => void;
  item: CheckoutItem | null;
  currency: Currency;
  onSuccess: (transaction: DemoTransaction) => void;
}

const PROMO_CODES: Record<string, { discountPercent: number; label: string }> = {
  VERI20: { discountPercent: 20, label: "20% Launch Discount" },
  HACKATHON: { discountPercent: 50, label: "50% Hackathon Demo Promo" },
  DEMO100: { discountPercent: 100, label: "100% Sandbox Comp" },
};

const BANKS = [
  { id: "hdfc", name: "HDFC Bank", code: "HDFC" },
  { id: "icici", name: "ICICI Bank", code: "ICIC" },
  { id: "sbi", name: "State Bank of India", code: "SBIN" },
  { id: "axis", name: "Axis Bank", code: "UTIB" },
  { id: "chase", name: "JPMorgan Chase", code: "CHSE" },
  { id: "mercury", name: "Mercury Business", code: "MERC" },
];

const PROCESSING_STEPS = [
  "Encrypting payment payload (TLS 1.3)...",
  "Running 3D Secure 2.0 bank verification...",
  "Provisioning VeriSphere forensic credits...",
];

function formatCurrency(amount: number, currency: Currency): string {
  if (currency === "INR") {
    return `₹${Math.round(amount).toLocaleString("en-IN")}`;
  }
  return `$${amount.toFixed(2)}`;
}

function detectCardBrand(num: string): "VISA" | "MASTERCARD" | "AMEX" | "CARD" {
  const digits = num.replace(/\D/g, "");
  if (digits.startsWith("4")) return "VISA";
  if (/^5[1-5]/.test(digits) || /^2[2-7]/.test(digits)) return "MASTERCARD";
  if (/^3[47]/.test(digits)) return "AMEX";
  return "CARD";
}

function formatCardNumber(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 16);
  return digits.replace(/(\d{4})(?=\d)/g, "$1 ");
}

function formatExpiry(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 4);
  if (digits.length >= 3) {
    return `${digits.slice(0, 2)} / ${digits.slice(2)}`;
  }
  return digits;
}

export function PaymentGatewayModal({
  isOpen,
  onClose,
  item,
  currency,
  onSuccess,
}: PaymentGatewayModalProps) {
  const [method, setMethod] = useState<PaymentMethod>("card");

  // Card state
  const [cardNumber, setCardNumber] = useState("");
  const [cardName, setCardName] = useState("");
  const [expiry, setExpiry] = useState("");
  const [cvc, setCvc] = useState("");
  const [billingEmail, setBillingEmail] = useState("admin@verisphere.ai");

  // UPI state
  const [upiId, setUpiId] = useState("");
  const [selectedUpiApp, setSelectedUpiApp] = useState<string>("GPay");

  // Netbanking state
  const [selectedBank, setSelectedBank] = useState<string>("hdfc");

  // Promo code state
  const [promoInput, setPromoInput] = useState("");
  const [appliedPromo, setAppliedPromo] = useState<{
    code: string;
    discountPercent: number;
    label: string;
  } | null>(null);

  // Payment lifecycle state
  const [stage, setStage] = useState<"form" | "processing" | "success" | "declined">("form");
  const [processingStepIdx, setProcessingStepIdx] = useState(0);
  const [declineReason, setDeclineReason] = useState("");
  const [completedTx, setCompletedTx] = useState<DemoTransaction | null>(null);

  // Reset when modal opens with a new item
  useEffect(() => {
    if (isOpen) {
      setStage("form");
      setProcessingStepIdx(0);
      setDeclineReason("");
      setCompletedTx(null);
      setPromoInput("");
      setAppliedPromo(null);
    }
  }, [isOpen, item?.id]);

  // Close on Escape
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && stage !== "processing") {
        onClose();
      }
    };
    if (isOpen) window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isOpen, stage, onClose]);

  if (!isOpen || !item) return null;

  const basePrice = currency === "INR" ? item.priceINR : item.priceUSD;
  const discountAmount = appliedPromo ? (basePrice * appliedPromo.discountPercent) / 100 : 0;
  const discountedSubtotal = Math.max(0, basePrice - discountAmount);
  const taxRate = currency === "INR" ? 0.18 : 0.08;
  const taxAmount = discountedSubtotal * taxRate;
  const totalAmount = discountedSubtotal + taxAmount;

  const cardBrand = detectCardBrand(cardNumber);

  const handleApplyPromo = () => {
    const code = promoInput.trim().toUpperCase();
    if (!code) return;
    const match = PROMO_CODES[code];
    if (match) {
      setAppliedPromo({ code, ...match });
      toast.success(`Promo "${code}" applied: ${match.label}`);
    } else {
      toast.error("Invalid promo code. Try VERI20, HACKATHON, or DEMO100.");
    }
  };

  const autofillCard = (preset: "visa" | "mastercard" | "decline") => {
    setMethod("card");
    if (preset === "visa") {
      setCardNumber("4242 4242 4242 4242");
      setCardName("ABHIJAY M S");
      setExpiry("12 / 29");
      setCvc("842");
      toast.info("Filled Visa test card (Will Succeed)");
    } else if (preset === "mastercard") {
      setCardNumber("5555 5555 5555 4444");
      setCardName("VERISPHERE ENTERPRISE");
      setExpiry("08 / 28");
      setCvc("319");
      toast.info("Filled Mastercard test card (Will Succeed)");
    } else {
      setCardNumber("4000 0000 0000 0002");
      setCardName("TEST DECLINED");
      setExpiry("04 / 27");
      setCvc("000");
      toast.warning("Filled Decline test card (Will Simulate Failure)");
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (method === "card") {
      const digits = cardNumber.replace(/\D/g, "");
      if (digits.length < 15) {
        toast.error("Please enter a valid 16-digit card number or click Auto-fill Test Card.");
        return;
      }
      if (!cardName.trim()) {
        toast.error("Please enter the cardholder name.");
        return;
      }
      if (expiry.replace(/\D/g, "").length < 4) {
        toast.error("Please enter a valid expiry date (MM / YY).");
        return;
      }
      if (cvc.replace(/\D/g, "").length < 3) {
        toast.error("Please enter a valid 3 or 4-digit CVC.");
        return;
      }
    } else if (method === "upi") {
      if (!upiId.trim() || !upiId.includes("@")) {
        toast.error("Please enter a valid UPI ID (e.g. demo@okaxis).");
        return;
      }
    }

    // Begin simulated 3-step payment gateway flow
    setStage("processing");
    setProcessingStepIdx(0);

    const isDeclineTest =
      method === "card" && cardNumber.replace(/\D/g, "").startsWith("400000000000");

    setTimeout(() => setProcessingStepIdx(1), 850);
    setTimeout(() => setProcessingStepIdx(2), 1750);

    setTimeout(() => {
      if (isDeclineTest) {
        setDeclineReason(
          "Your issuing bank declined this authorization (Code: insufficient_funds). No funds were deducted."
        );
        setStage("declined");
        toast.error("Demo payment declined by simulated issuer.");
        return;
      }

      const last4 =
        method === "card"
          ? cardNumber.replace(/\D/g, "").slice(-4)
          : method === "upi"
          ? upiId
          : BANKS.find((b) => b.id === selectedBank)?.name || "Net Banking";

      const methodLabel =
        method === "card"
          ? `${cardBrand} •••• ${last4}`
          : method === "upi"
          ? `UPI (${last4})`
          : `Net Banking (${last4})`;

      const tx: DemoTransaction = {
        id: `txn_vs_${Math.random().toString(36).substring(2, 10).toUpperCase()}`,
        invoiceNumber: `INV-2026-${Math.floor(10000 + Math.random() * 90000)}`,
        itemName: `${item.name}${item.billingCycle ? ` (${item.billingCycle})` : ""}`,
        amountFormatted: formatCurrency(totalAmount, currency),
        currency,
        methodLabel,
        status: "PAID",
        date: new Date().toLocaleString("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        }),
        creditsAdded: item.creditsIncluded,
      };

      setCompletedTx(tx);
      setStage("success");
      onSuccess(tx);
      toast.success("Demo payment authorized! Plan upgraded.");
    }, 2600);
  };

  const handleDownloadReceipt = () => {
    if (!completedTx) return;
    const receiptText = [
      "====================================================",
      "           VERISPHERE PAYMENT RECEIPT (DEMO)        ",
      "====================================================",
      `Receipt / Invoice : ${completedTx.invoiceNumber}`,
      `Transaction ID    : ${completedTx.id}`,
      `Date              : ${completedTx.date}`,
      `Billed To         : ${billingEmail}`,
      "----------------------------------------------------",
      `Item              : ${completedTx.itemName}`,
      `Payment Method    : ${completedTx.methodLabel}`,
      `Status            : ${completedTx.status} (SANDBOX DEMO)`,
      `Total Paid        : ${completedTx.amountFormatted}`,
      "----------------------------------------------------",
      "NOTE: This is a simulated demo transaction.",
      "No real card or bank account was charged.",
      "====================================================",
    ].join("\n");

    const blob = new Blob([receiptText], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${completedTx.invoiceNumber}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Demo receipt downloaded.");
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 overflow-y-auto">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={() => stage !== "processing" && onClose()}
          className="fixed inset-0 bg-black/65 backdrop-blur-sm"
        />

        {/* Modal Container */}
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 16 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 16 }}
          transition={{ duration: 0.25, ease: "easeOut" }}
          className="relative z-10 w-full max-w-[960px] rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-strong)] shadow-2xl overflow-hidden my-auto"
        >
          {/* Top Bar */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border)] bg-[var(--bg-subtle)]">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-[var(--brand-blue)] flex items-center justify-center text-white shadow-sm">
                <ShieldCheck size={18} />
              </div>
              <div className="flex items-center gap-2.5">
                <span className="font-heading font-bold text-base text-[var(--text-primary)]">
                  VeriSphere Pay
                </span>
                <span className="px-2 py-0.5 text-[10px] font-mono font-semibold uppercase tracking-wider rounded-full bg-[var(--warning-bg)] text-[var(--warning)] border border-[var(--warning)]/30">
                  Sandbox Demo
                </span>
              </div>
            </div>

            <div className="flex items-center gap-4">
              <div className="hidden sm:flex items-center gap-1.5 text-xs text-[var(--text-tertiary)]">
                <Lock size={13} className="text-[var(--verified)]" />
                <span>256-bit TLS Encrypted</span>
              </div>
              <button
                onClick={() => stage !== "processing" && onClose()}
                disabled={stage === "processing"}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-muted)] disabled:opacity-40 transition-colors"
                aria-label="Close checkout"
              >
                <X size={18} />
              </button>
            </div>
          </div>

          {/* Body Content */}
          {stage === "processing" ? (
            <div className="p-12 flex flex-col items-center justify-center min-h-[460px] text-center">
              <div className="relative mb-6">
                <div className="w-20 h-20 rounded-full border-4 border-[var(--brand-blue)]/20 flex items-center justify-center">
                  <Loader2 size={38} className="text-[var(--brand-blue)] animate-spin" />
                </div>
                <div className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-[var(--bg-surface)] border border-[var(--border)] flex items-center justify-center shadow-sm">
                  <Lock size={13} className="text-[var(--verified)]" />
                </div>
              </div>

              <h3 className="font-heading font-bold text-xl text-[var(--text-primary)] mb-2">
                Authorizing Payment...
              </h3>
              <p className="text-sm text-[var(--text-secondary)] mb-8 max-w-sm">
                Please do not close this window while we verify your simulated transaction with the payment network.
              </p>

              <div className="w-full max-w-sm space-y-3 text-left">
                {PROCESSING_STEPS.map((step, idx) => {
                  const done = idx < processingStepIdx;
                  const active = idx === processingStepIdx;
                  return (
                    <div
                      key={step}
                      className={`flex items-center gap-3 px-4 py-2.5 rounded-xl border text-xs font-medium transition-all ${
                        done
                          ? "bg-[var(--verified-bg)] border-[var(--verified)]/30 text-[var(--verified)]"
                          : active
                          ? "bg-[var(--brand-blue-light)] border-[var(--brand-blue)]/40 text-[var(--brand-blue)]"
                          : "bg-[var(--bg-subtle)] border-[var(--border)] text-[var(--text-tertiary)]"
                      }`}
                    >
                      {done ? (
                        <CheckCircle2 size={15} className="shrink-0" />
                      ) : active ? (
                        <Loader2 size={15} className="shrink-0 animate-spin" />
                      ) : (
                        <span className="w-3.5 h-3.5 rounded-full border border-current shrink-0" />
                      )}
                      <span>{step}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : stage === "success" && completedTx ? (
            <div className="p-8 sm:p-10 flex flex-col items-center text-center min-h-[460px] justify-center">
              <motion.div
                initial={{ scale: 0.5, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: "spring", stiffness: 260, damping: 18 }}
                className="w-16 h-16 rounded-full bg-[var(--verified-bg)] border-2 border-[var(--verified)] flex items-center justify-center text-[var(--verified)] mb-5"
              >
                <CheckCircle2 size={34} />
              </motion.div>

              <h3 className="font-heading font-bold text-2xl text-[var(--text-primary)] mb-1">
                Payment Successful
              </h3>
              <p className="text-sm text-[var(--text-secondary)] mb-6">
                Your demo order has been confirmed and your workspace has been upgraded.
              </p>

              {/* Receipt Card */}
              <div className="w-full max-w-md rounded-xl bg-[var(--bg-subtle)] border border-[var(--border)] p-5 text-left space-y-3 mb-7">
                <div className="flex items-center justify-between pb-3 border-b border-[var(--border)]">
                  <span className="text-xs font-medium text-[var(--text-tertiary)] uppercase tracking-wider">
                    Amount Paid
                  </span>
                  <span className="font-heading font-bold text-xl text-[var(--text-primary)]">
                    {completedTx.amountFormatted}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-y-2.5 text-xs">
                  <span className="text-[var(--text-tertiary)]">Transaction ID</span>
                  <span className="font-mono text-right text-[var(--text-primary)] font-medium">
                    {completedTx.id}
                  </span>

                  <span className="text-[var(--text-tertiary)]">Invoice No.</span>
                  <span className="font-mono text-right text-[var(--text-primary)] font-medium">
                    {completedTx.invoiceNumber}
                  </span>

                  <span className="text-[var(--text-tertiary)]">Plan / Item</span>
                  <span className="text-right text-[var(--text-primary)] font-medium">
                    {completedTx.itemName}
                  </span>

                  <span className="text-[var(--text-tertiary)]">Payment Method</span>
                  <span className="text-right text-[var(--text-primary)] font-medium">
                    {completedTx.methodLabel}
                  </span>

                  <span className="text-[var(--text-tertiary)]">Date</span>
                  <span className="text-right text-[var(--text-secondary)]">
                    {completedTx.date}
                  </span>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-center gap-3">
                <button
                  onClick={handleDownloadReceipt}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface)] text-sm font-medium text-[var(--text-primary)] hover:bg-[var(--bg-subtle)] transition-colors"
                >
                  <Download size={16} />
                  Download Receipt
                </button>
                <button
                  onClick={onClose}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[var(--brand-blue)] text-white text-sm font-semibold hover:opacity-95 transition-opacity shadow-sm"
                >
                  Continue to VeriSphere
                  <ArrowRight size={16} />
                </button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-12">
              {/* LEFT PANEL: Order Summary */}
              <div className="lg:col-span-5 p-6 sm:p-7 bg-[var(--bg-subtle)] border-b lg:border-b-0 lg:border-r border-[var(--border)] flex flex-col justify-between">
                <div>
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-tertiary)]">
                    Order Summary
                  </span>

                  <div className="mt-3 p-4 rounded-xl bg-[var(--bg-surface)] border border-[var(--border)] shadow-sm">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h4 className="font-heading font-bold text-base text-[var(--text-primary)]">
                          {item.name}
                        </h4>
                        <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                          {item.subtitle}
                        </p>
                      </div>
                      <span className="font-heading font-bold text-base text-[var(--text-primary)] whitespace-nowrap">
                        {formatCurrency(basePrice, currency)}
                      </span>
                    </div>

                    <div className="mt-3 pt-3 border-t border-[var(--border)] space-y-1.5">
                      {item.features.slice(0, 4).map((f) => (
                        <div key={f} className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
                          <Check size={13} className="text-[var(--verified)] shrink-0" />
                          <span>{f}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Promo Code Box */}
                  <div className="mt-5">
                    <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">
                      Promo Code <span className="text-[var(--text-tertiary)]">(Try VERI20 or HACKATHON)</span>
                    </label>
                    <div className="flex gap-2">
                      <div className="relative flex-1">
                        <Tag
                          size={14}
                          className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)]"
                        />
                        <input
                          type="text"
                          value={promoInput}
                          onChange={(e) => setPromoInput(e.target.value)}
                          placeholder="Enter code"
                          className="w-full pl-8 pr-3 py-2 text-xs rounded-lg bg-[var(--bg-surface)] border border-[var(--border)] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:border-[var(--brand-blue)] uppercase font-mono"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={handleApplyPromo}
                        className="px-3.5 py-2 text-xs font-semibold rounded-lg bg-[var(--bg-surface)] border border-[var(--border-strong)] text-[var(--text-primary)] hover:bg-[var(--bg-muted)] transition-colors"
                      >
                        Apply
                      </button>
                    </div>
                    {appliedPromo && (
                      <div className="mt-2 flex items-center justify-between px-3 py-1.5 rounded-lg bg-[var(--verified-bg)] border border-[var(--verified)]/30 text-xs text-[var(--verified)]">
                        <span className="font-medium">
                          {appliedPromo.code} — {appliedPromo.label}
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            setAppliedPromo(null);
                            setPromoInput("");
                          }}
                          className="underline text-[11px]"
                        >
                          Remove
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Breakdown */}
                  <div className="mt-6 space-y-2.5 text-sm">
                    <div className="flex justify-between text-[var(--text-secondary)]">
                      <span>Subtotal</span>
                      <span>{formatCurrency(basePrice, currency)}</span>
                    </div>
                    {appliedPromo && (
                      <div className="flex justify-between text-[var(--verified)]">
                        <span>Discount ({appliedPromo.discountPercent}%)</span>
                        <span>-{formatCurrency(discountAmount, currency)}</span>
                      </div>
                    )}
                    <div className="flex justify-between text-[var(--text-secondary)]">
                      <span>{currency === "INR" ? "GST (18%)" : "Estimated Tax (8%)"}</span>
                      <span>{formatCurrency(taxAmount, currency)}</span>
                    </div>
                    <div className="pt-3 border-t border-[var(--border)] flex justify-between items-baseline">
                      <span className="font-heading font-bold text-[var(--text-primary)]">
                        Total due today
                      </span>
                      <span className="font-heading font-bold text-2xl text-[var(--text-primary)]">
                        {formatCurrency(totalAmount, currency)}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Trust Footer */}
                <div className="mt-6 pt-4 border-t border-[var(--border)] flex flex-wrap items-center gap-x-4 gap-y-2 text-[11px] text-[var(--text-tertiary)]">
                  <span className="inline-flex items-center gap-1">
                    <ShieldCheck size={13} className="text-[var(--verified)]" />
                    PCI-DSS Level 1
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Lock size={13} className="text-[var(--brand-blue)]" />
                    SOC 2 Type II
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <FileText size={13} />
                    Instant Invoice
                  </span>
                </div>
              </div>

              {/* RIGHT PANEL: Payment Form */}
              <div className="lg:col-span-7 p-6 sm:p-7">
                {stage === "declined" && (
                  <div className="mb-5 p-3.5 rounded-xl bg-[var(--danger-bg)] border border-[var(--danger)]/30 flex items-start gap-3">
                    <AlertCircle size={18} className="text-[var(--danger)] shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <p className="text-xs font-semibold text-[var(--danger)]">
                        Authorization Declined (Simulated)
                      </p>
                      <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                        {declineReason}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setStage("form")}
                      className="text-xs font-medium text-[var(--danger)] hover:underline inline-flex items-center gap-1"
                    >
                      <RotateCcw size={12} /> Retry
                    </button>
                  </div>
                )}

                {/* Payment Method Tabs */}
                <div className="grid grid-cols-3 gap-2 p-1 rounded-xl bg-[var(--bg-subtle)] border border-[var(--border)] mb-5">
                  {[
                    { id: "card" as const, label: "Card", icon: CreditCard },
                    { id: "upi" as const, label: "UPI / QR", icon: Smartphone },
                    { id: "netbanking" as const, label: "Net Banking", icon: Building2 },
                  ].map((tab) => {
                    const Icon = tab.icon;
                    const active = method === tab.id;
                    return (
                      <button
                        key={tab.id}
                        type="button"
                        onClick={() => setMethod(tab.id)}
                        className={`flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs font-semibold transition-all ${
                          active
                            ? "bg-[var(--bg-surface)] text-[var(--brand-blue)] shadow-sm border border-[var(--border)]"
                            : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                        }`}
                      >
                        <Icon size={15} />
                        <span>{tab.label}</span>
                      </button>
                    );
                  })}
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                  {/* Billing Email */}
                  <div>
                    <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                      Receipt Email
                    </label>
                    <input
                      type="email"
                      required
                      value={billingEmail}
                      onChange={(e) => setBillingEmail(e.target.value)}
                      placeholder="you@company.com"
                      className="w-full px-3.5 py-2.5 text-sm rounded-xl bg-[var(--bg-subtle)] border border-[var(--border)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--brand-blue)]"
                    />
                  </div>

                  {method === "card" && (
                    <>
                      {/* Live Interactive Card Preview */}
                      <div className="relative rounded-2xl p-5 text-white overflow-hidden shadow-md bg-gradient-to-br from-[#1B3A6B] via-[#1E40AF] to-[#0F172A]">
                        <div className="absolute -right-10 -top-10 w-36 h-36 rounded-full bg-white/10 blur-xl" />
                        <div className="absolute -left-8 -bottom-12 w-36 h-36 rounded-full bg-blue-400/20 blur-xl" />

                        <div className="relative z-10 flex items-center justify-between mb-6">
                          <div className="w-9 h-6 rounded-md bg-amber-300/85 border border-amber-100/50" />
                          <span className="font-mono text-xs font-bold tracking-widest uppercase px-2 py-0.5 rounded bg-white/15">
                            {cardBrand}
                          </span>
                        </div>

                        <div className="relative z-10 font-mono text-lg sm:text-xl tracking-[0.18em] mb-5">
                          {cardNumber || "•••• •••• •••• ••••"}
                        </div>

                        <div className="relative z-10 flex items-end justify-between text-[11px] uppercase tracking-wider">
                          <div>
                            <div className="text-white/60 text-[9px]">Card Holder</div>
                            <div className="font-medium truncate max-w-[180px]">
                              {cardName || "YOUR NAME"}
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="text-white/60 text-[9px]">Expires</div>
                            <div className="font-mono font-medium">{expiry || "MM / YY"}</div>
                          </div>
                        </div>
                      </div>

                      {/* Quick Demo Autofill Bar */}
                      <div className="flex flex-wrap items-center gap-2 pt-1">
                        <span className="text-[11px] font-medium text-[var(--text-tertiary)] inline-flex items-center gap-1">
                          <Sparkles size={12} className="text-[var(--brand-blue)]" />
                          Demo Presets:
                        </span>
                        <button
                          type="button"
                          onClick={() => autofillCard("visa")}
                          className="px-2.5 py-1 text-[11px] font-medium rounded-md bg-[var(--brand-blue-light)] text-[var(--brand-blue)] hover:opacity-85 transition-opacity"
                        >
                          Visa (Pass)
                        </button>
                        <button
                          type="button"
                          onClick={() => autofillCard("mastercard")}
                          className="px-2.5 py-1 text-[11px] font-medium rounded-md bg-[var(--bg-subtle)] border border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                        >
                          Mastercard (Pass)
                        </button>
                        <button
                          type="button"
                          onClick={() => autofillCard("decline")}
                          className="px-2.5 py-1 text-[11px] font-medium rounded-md bg-[var(--danger-bg)] text-[var(--danger)] hover:opacity-85 transition-opacity"
                        >
                          Test Decline
                        </button>
                      </div>

                      {/* Card Fields */}
                      <div>
                        <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                          Card Number
                        </label>
                        <input
                          type="text"
                          inputMode="numeric"
                          value={cardNumber}
                          onChange={(e) => setCardNumber(formatCardNumber(e.target.value))}
                          placeholder="4242 4242 4242 4242"
                          maxLength={19}
                          className="w-full px-3.5 py-2.5 text-sm font-mono rounded-xl bg-[var(--bg-subtle)] border border-[var(--border)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--brand-blue)]"
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                            Expiry Date
                          </label>
                          <input
                            type="text"
                            inputMode="numeric"
                            value={expiry}
                            onChange={(e) => setExpiry(formatExpiry(e.target.value))}
                            placeholder="MM / YY"
                            maxLength={7}
                            className="w-full px-3.5 py-2.5 text-sm font-mono rounded-xl bg-[var(--bg-subtle)] border border-[var(--border)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--brand-blue)]"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                            CVC / CVV
                          </label>
                          <input
                            type="password"
                            inputMode="numeric"
                            value={cvc}
                            onChange={(e) =>
                              setCvc(e.target.value.replace(/\D/g, "").slice(0, 4))
                            }
                            placeholder="•••"
                            maxLength={4}
                            className="w-full px-3.5 py-2.5 text-sm font-mono rounded-xl bg-[var(--bg-subtle)] border border-[var(--border)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--brand-blue)]"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                          Cardholder Name
                        </label>
                        <input
                          type="text"
                          value={cardName}
                          onChange={(e) => setCardName(e.target.value)}
                          placeholder="Full name as printed on card"
                          className="w-full px-3.5 py-2.5 text-sm rounded-xl bg-[var(--bg-subtle)] border border-[var(--border)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--brand-blue)]"
                        />
                      </div>
                    </>
                  )}

                  {method === "upi" && (
                    <div className="space-y-4">
                      <div className="p-4 rounded-xl bg-[var(--bg-subtle)] border border-[var(--border)] flex flex-col sm:flex-row items-center gap-4">
                        <div className="w-28 h-28 rounded-xl bg-white p-2.5 flex items-center justify-center border border-[var(--border)] shrink-0 shadow-sm">
                          <QrCode size={84} className="text-[#111827]" />
                        </div>
                        <div className="text-center sm:text-left">
                          <h5 className="font-heading font-semibold text-sm text-[var(--text-primary)]">
                            Instant UPI QR (Demo)
                          </h5>
                          <p className="text-xs text-[var(--text-secondary)] mt-1">
                            Scan with Google Pay, PhonePe, Paytm, or BHIM, or enter a simulated UPI ID below.
                          </p>
                          <div className="flex flex-wrap justify-center sm:justify-start gap-1.5 mt-2.5">
                            {["GPay", "PhonePe", "Paytm", "BHIM"].map((app) => (
                              <button
                                key={app}
                                type="button"
                                onClick={() => {
                                  setSelectedUpiApp(app);
                                  if (!upiId) setUpiId(`demo@${app.toLowerCase()}`);
                                }}
                                className={`px-2.5 py-1 rounded-md text-[11px] font-semibold border transition-colors ${
                                  selectedUpiApp === app
                                    ? "bg-[var(--brand-blue-light)] border-[var(--brand-blue)] text-[var(--brand-blue)]"
                                    : "bg-[var(--bg-surface)] border-[var(--border)] text-[var(--text-secondary)]"
                                }`}
                              >
                                {app}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                          UPI ID / VPA
                        </label>
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={upiId}
                            onChange={(e) => setUpiId(e.target.value)}
                            placeholder="username@okhdfcbank"
                            className="flex-1 px-3.5 py-2.5 text-sm font-mono rounded-xl bg-[var(--bg-subtle)] border border-[var(--border)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--brand-blue)]"
                          />
                          <button
                            type="button"
                            onClick={() => setUpiId("verisphere.demo@okicici")}
                            className="px-3 py-2 text-xs font-medium rounded-xl bg-[var(--brand-blue-light)] text-[var(--brand-blue)] whitespace-nowrap"
                          >
                            Auto-fill
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {method === "netbanking" && (
                    <div className="space-y-3">
                      <label className="block text-xs font-medium text-[var(--text-secondary)]">
                        Select Your Corporate or Retail Bank
                      </label>
                      <div className="grid grid-cols-2 gap-2.5">
                        {BANKS.map((bank) => {
                          const active = selectedBank === bank.id;
                          return (
                            <button
                              key={bank.id}
                              type="button"
                              onClick={() => setSelectedBank(bank.id)}
                              className={`flex items-center gap-3 p-3 rounded-xl border text-left transition-all ${
                                active
                                  ? "bg-[var(--brand-blue-light)] border-[var(--brand-blue)] text-[var(--brand-blue)]"
                                  : "bg-[var(--bg-subtle)] border-[var(--border)] text-[var(--text-primary)] hover:border-[var(--border-strong)]"
                              }`}
                            >
                              <div className="w-8 h-8 rounded-lg bg-[var(--bg-surface)] border border-[var(--border)] flex items-center justify-center font-mono text-[10px] font-bold text-[var(--text-secondary)] shrink-0">
                                {bank.code}
                              </div>
                              <span className="text-xs font-semibold truncate">{bank.name}</span>
                            </button>
                          );
                        })}
                      </div>
                      <p className="text-[11px] text-[var(--text-tertiary)]">
                        In demo mode, clicking Pay will simulate an instant bank portal authorization without redirecting externally.
                      </p>
                    </div>
                  )}

                  {/* Submit CTA */}
                  <button
                    type="submit"
                    className="w-full mt-2 py-3.5 px-5 rounded-xl bg-[var(--brand-blue)] text-white font-heading font-semibold text-sm flex items-center justify-center gap-2 shadow-md hover:opacity-95 active:scale-[0.99] transition-all"
                  >
                    <Lock size={15} />
                    <span>Pay {formatCurrency(totalAmount, currency)} (Demo)</span>
                    <ArrowRight size={15} />
                  </button>

                  <p className="text-[11px] text-center text-[var(--text-tertiary)]">
                    Demo gateway only — no real money will be charged or card data transmitted.
                  </p>
                </form>
              </div>
            </div>
          )}
        </motion.div>
      </div>
    </AnimatePresence>
  );
}

