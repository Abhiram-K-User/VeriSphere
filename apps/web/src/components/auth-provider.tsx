"use client";

import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import type { SessionUser, AccountType } from "@/lib/auth";
import type { DemoTransaction } from "@/components/ui/PaymentGatewayModal";

export type PlanId = "starter" | "pro" | "enterprise";

export interface UserBillingState {
  planId: PlanId;
  planName: string;
  billingCycle: "monthly" | "annual";
  credits: number | "Unlimited";
  creditsLimit: number | "Unlimited";
  creditsResetAt: string; // ISO timestamp for 1-month automatic credit reset
  renewalDate: string;
  transactions: DemoTransaction[];
}

interface OAuthProviderStatus {
  google: boolean;
  github: boolean;
}

interface AuthContextValue {
  user: SessionUser | null;
  providers: OAuthProviderStatus;
  loading: boolean;
  billing: UserBillingState;
  refreshSession: () => Promise<void>;
  logout: () => Promise<void>;
  updateProfile: (fields: {
    name?: string;
    role?: string;
    organization?: string;
    accountType?: AccountType;
  }) => Promise<boolean>;
  consumeCredits: (count?: number) => { allowed: boolean; remaining: number | "Unlimited" };
  recordDemoPurchase: (params: {
    transaction: DemoTransaction;
    itemType: "subscription" | "credits";
    planId?: PlanId;
    planName?: string;
    billingCycle?: "monthly" | "annual";
    creditsIncluded: number | "Unlimited";
  }) => void;
  downgradeToStarter: () => void;
}

function addOneMonth(from: Date = new Date()): Date {
  const next = new Date(from.getTime());
  next.setMonth(next.getMonth() + 1);
  return next;
}

function formatDateShort(date: Date): string {
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function getStarterAllowance(accountType?: AccountType): number {
  return accountType === "org" ? 25 : 3;
}

function buildDefaultBilling(accountType?: AccountType): UserBillingState {
  const starterCredits = getStarterAllowance(accountType);
  const resetDate = addOneMonth(new Date());
  return {
    planId: "starter",
    planName: "Starter",
    billingCycle: "monthly",
    credits: starterCredits,
    creditsLimit: starterCredits,
    creditsResetAt: resetDate.toISOString(),
    renewalDate: formatDateShort(resetDate),
    transactions: [
      {
        id: "txn_vs_INITIAL01",
        invoiceNumber: "INV-2026-00104",
        itemName:
          accountType === "org"
            ? "Starter Organization Trial Allocation"
            : "Starter Free Plan (3 Monthly Credits)",
        amountFormatted: "$0.00",
        currency: "USD",
        methodLabel: "Free Monthly Grant",
        status: "PAID",
        date: formatDateShort(new Date()),
        creditsAdded: starterCredits,
      },
    ],
  };
}

function applyMonthlyResetIfDue(
  state: UserBillingState,
  accountType?: AccountType
): { state: UserBillingState; changed: boolean } {
  const now = new Date();
  let changed = false;
  let next = { ...state };

  // Migrate legacy 5-credit individual starter states to the strict 3-credit free cap
  if (
    next.planId === "starter" &&
    accountType !== "org" &&
    typeof next.creditsLimit === "number" &&
    next.creditsLimit > 3
  ) {
    next.creditsLimit = 3;
    if (typeof next.credits === "number") {
      next.credits = Math.min(next.credits, 3);
    }
    changed = true;
  }

  // Ensure creditsResetAt is present
  if (!next.creditsResetAt || isNaN(new Date(next.creditsResetAt).getTime())) {
    const resetDate = addOneMonth(now);
    next.creditsResetAt = resetDate.toISOString();
    next.renewalDate = formatDateShort(resetDate);
    changed = true;
  }

  // Automatic 1-month credit reset
  if (now.getTime() >= new Date(next.creditsResetAt).getTime()) {
    const nextReset = addOneMonth(now);
    const allowance: number | "Unlimited" =
      next.planId === "enterprise"
        ? "Unlimited"
        : next.planId === "pro"
        ? 100
        : getStarterAllowance(accountType);

    next = {
      ...next,
      credits: allowance,
      creditsLimit: allowance,
      creditsResetAt: nextReset.toISOString(),
      renewalDate: formatDateShort(nextReset),
    };
    changed = true;
  }

  return { state: next, changed };
}

function getBillingStorageKey(email?: string, accountType?: AccountType): string {
  return `verisphere_demo_billing_${(email || "guest").toLowerCase()}_${accountType || "individual"}`;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [providers, setProviders] = useState<OAuthProviderStatus>({
    google: false,
    github: false,
  });
  const [loading, setLoading] = useState(true);
  const [billing, setBilling] = useState<UserBillingState>(() => buildDefaultBilling("individual"));

  const persistBilling = useCallback(
    (next: UserBillingState, email?: string, accountType?: AccountType) => {
      setBilling(next);
      if (typeof window === "undefined") return;
      try {
        localStorage.setItem(
          getBillingStorageKey(email, accountType),
          JSON.stringify(next)
        );
      } catch {
        // ignore storage errors
      }
    },
    []
  );

  const loadBillingForUser = useCallback(
    (email?: string, accountType?: AccountType) => {
      if (typeof window === "undefined") return;
      try {
        const key = getBillingStorageKey(email, accountType);
        const raw = localStorage.getItem(key);
        if (raw) {
          const parsed = JSON.parse(raw) as UserBillingState;
          if (parsed && parsed.planId) {
            const { state: checked, changed } = applyMonthlyResetIfDue(parsed, accountType);
            setBilling(checked);
            if (changed) {
              localStorage.setItem(key, JSON.stringify(checked));
            }
            return;
          }
        }
      } catch {
        // ignore storage errors
      }
      const fresh = buildDefaultBilling(accountType);
      persistBilling(fresh, email, accountType);
    },
    [persistBilling]
  );

  const refreshSession = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/session", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        const loadedUser: SessionUser | null = data.user
          ? {
              ...data.user,
              accountType: data.user.accountType === "org" ? "org" : "individual",
            }
          : null;
        setUser(loadedUser);
        if (data.providers) {
          setProviders(data.providers);
        }
        if (loadedUser) {
          localStorage.setItem("verisphere_api_key", "demo-api-key-1234");
        }
        loadBillingForUser(loadedUser?.email, loadedUser?.accountType);
      }
    } catch {
      // ignore network error
    } finally {
      setLoading(false);
    }
  }, [loadBillingForUser]);

  useEffect(() => {
    refreshSession();
  }, [refreshSession]);

  const logout = useCallback(async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    localStorage.removeItem("verisphere_api_key");
    setUser(null);
    loadBillingForUser(undefined, "individual");
  }, [loadBillingForUser]);

  const updateProfile = useCallback(
    async (fields: {
      name?: string;
      role?: string;
      organization?: string;
      accountType?: AccountType;
    }) => {
      try {
        const res = await fetch("/api/auth/session", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(fields),
        });
        if (!res.ok) return false;
        const data = await res.json();
        if (data.user) {
          const updated: SessionUser = {
            ...data.user,
            accountType: data.user.accountType === "org" ? "org" : "individual",
          };
          setUser(updated);
          if (fields.accountType) {
            loadBillingForUser(updated.email, updated.accountType);
          }
          return true;
        }
        return false;
      } catch {
        return false;
      }
    },
    [loadBillingForUser]
  );

  const consumeCredits = useCallback(
    (count: number = 1): { allowed: boolean; remaining: number | "Unlimited" } => {
      const { state: checked } = applyMonthlyResetIfDue(billing, user?.accountType);

      if (checked.credits === "Unlimited") {
        if (checked !== billing) {
          persistBilling(checked, user?.email, user?.accountType);
        }
        return { allowed: true, remaining: "Unlimited" };
      }

      if (checked.credits < count) {
        if (checked !== billing) {
          persistBilling(checked, user?.email, user?.accountType);
        }
        return { allowed: false, remaining: checked.credits };
      }

      const nextCredits = Math.max(0, checked.credits - count);
      const nextState: UserBillingState = {
        ...checked,
        credits: nextCredits,
      };
      persistBilling(nextState, user?.email, user?.accountType);
      return { allowed: true, remaining: nextCredits };
    },
    [billing, persistBilling, user?.email, user?.accountType]
  );

  const recordDemoPurchase = useCallback(
    (params: {
      transaction: DemoTransaction;
      itemType: "subscription" | "credits";
      planId?: PlanId;
      planName?: string;
      billingCycle?: "monthly" | "annual";
      creditsIncluded: number | "Unlimited";
    }) => {
      const nextReset = new Date();
      nextReset.setDate(
        nextReset.getDate() + (params.billingCycle === "annual" ? 365 : 30)
      );
      const formattedRenewal = formatDateShort(nextReset);

      let nextCredits = billing.credits;
      let nextLimit = billing.creditsLimit;

      if (params.creditsIncluded === "Unlimited") {
        nextCredits = "Unlimited";
        nextLimit = "Unlimited";
      } else if (typeof nextCredits === "number") {
        nextCredits = nextCredits + params.creditsIncluded;
        if (typeof nextLimit === "number") {
          nextLimit = Math.max(nextLimit, nextCredits);
        }
      }

      const nextState: UserBillingState = {
        planId:
          params.itemType === "subscription" && params.planId
            ? params.planId
            : billing.planId,
        planName:
          params.itemType === "subscription" && params.planName
            ? params.planName
            : billing.planName,
        billingCycle:
          params.itemType === "subscription" && params.billingCycle
            ? params.billingCycle
            : billing.billingCycle,
        credits: nextCredits,
        creditsLimit: nextLimit,
        creditsResetAt:
          params.itemType === "subscription"
            ? nextReset.toISOString()
            : billing.creditsResetAt,
        renewalDate:
          params.itemType === "subscription" ? formattedRenewal : billing.renewalDate,
        transactions: [params.transaction, ...billing.transactions],
      };

      persistBilling(nextState, user?.email, user?.accountType);
    },
    [billing, persistBilling, user?.email, user?.accountType]
  );

  const downgradeToStarter = useCallback(() => {
    const starterCredits = getStarterAllowance(user?.accountType);
    const resetDate = addOneMonth(new Date());
    const nextState: UserBillingState = {
      ...billing,
      planId: "starter",
      planName: "Starter",
      billingCycle: "monthly",
      credits: starterCredits,
      creditsLimit: starterCredits,
      creditsResetAt: resetDate.toISOString(),
      renewalDate: formatDateShort(resetDate),
    };
    persistBilling(nextState, user?.email, user?.accountType);
  }, [billing, persistBilling, user?.email, user?.accountType]);

  return (
    <AuthContext.Provider
      value={{
        user,
        providers,
        loading,
        billing,
        refreshSession,
        logout,
        updateProfile,
        consumeCredits,
        recordDemoPurchase,
        downgradeToStarter,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return ctx;
}
