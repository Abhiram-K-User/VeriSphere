"use client";

import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import type { User as SupabaseUser } from "@supabase/supabase-js";
import {
  AccountRole,
  AuthProviderType,
  SessionUser,
  resolveAccountRole,
} from "@/lib/roles";
import {
  createSupabaseBrowserClient,
  isSupabaseConfigured,
} from "@/lib/supabase/client";
import type { DemoTransaction } from "@/components/ui/PaymentGatewayModal";

export type PlanId = "starter" | "pro" | "enterprise" | "admin";

export interface UserBillingState {
  planId: PlanId;
  planName: string;
  billingCycle: "monthly" | "annual";
  credits: number | "Unlimited";
  creditsLimit: number | "Unlimited";
  creditsResetAt: string;
  renewalDate: string;
  transactions: DemoTransaction[];
}

interface AuthContextValue {
  user: SessionUser | null;
  effectiveRole: AccountRole;
  adminViewAs: AccountRole;
  setAdminViewAs: (role: AccountRole) => void;
  supabaseConfigured: boolean;
  loading: boolean;
  billing: UserBillingState;
  refreshSession: () => Promise<void>;
  logout: () => Promise<void>;
  updateProfile: (fields: {
    name?: string;
    role?: string;
    organization?: string;
  }) => Promise<boolean>;
  consumeCredits: (count?: number) => { allowed: boolean; remaining: number | "Unlimited" };
  recordDemoPurchase: (params: {
    transaction: DemoTransaction;
    itemType: "subscription" | "credits";
    planId?: "starter" | "pro" | "enterprise";
    planName?: string;
    billingCycle?: "monthly" | "annual";
    creditsIncluded: number | "Unlimited";
  }) => void;
  downgradeToStarter: () => void;
  resetLocalBillingCache: () => void;
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

function getStarterAllowance(role?: AccountRole): number | "Unlimited" {
  if (role === "admin") return "Unlimited";
  if (role === "org") return 25;
  return 3;
}

function buildAdminBilling(): UserBillingState {
  return {
    planId: "admin",
    planName: "Admin Unlimited",
    billingCycle: "monthly",
    credits: "Unlimited",
    creditsLimit: "Unlimited",
    creditsResetAt: addOneMonth(new Date()).toISOString(),
    renewalDate: "No Expiry",
    transactions: [
      {
        id: "txn_vs_ADMIN_GRANT",
        invoiceNumber: "ADM-UNLIMITED",
        itemName: "Platform Admin Unrestricted Testing Access",
        amountFormatted: "$0.00",
        currency: "USD",
        methodLabel: "Admin Privilege",
        status: "PAID",
        date: formatDateShort(new Date()),
        creditsAdded: "Unlimited",
      },
    ],
  };
}

function buildDefaultBilling(role?: AccountRole): UserBillingState {
  if (role === "admin") {
    return buildAdminBilling();
  }
  const starterCredits = getStarterAllowance(role);
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
          role === "org"
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
  role?: AccountRole
): { state: UserBillingState; changed: boolean } {
  if (role === "admin") {
    return { state: buildAdminBilling(), changed: false };
  }

  const now = new Date();
  let changed = false;
  let next = { ...state };

  // Migrate legacy 5-credit individual starter states to the strict 3-credit free cap
  if (
    next.planId === "starter" &&
    role !== "org" &&
    typeof next.creditsLimit === "number" &&
    next.creditsLimit > 3
  ) {
    next.creditsLimit = 3;
    if (typeof next.credits === "number") {
      next.credits = Math.min(next.credits, 3);
    }
    changed = true;
  }

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
        : getStarterAllowance(role);

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

function getBillingStorageKey(email?: string, role?: AccountRole): string {
  return `verisphere_demo_billing_${(email || "guest").toLowerCase()}_${role || "individual"}`;
}

function mapSupabaseUser(sbUser: SupabaseUser): SessionUser {
  const email = (sbUser.email || "").trim().toLowerCase();
  const meta = sbUser.user_metadata || {};
  const accountType = resolveAccountRole(email, meta.account_type as string | undefined);

  const rawProvider = String(sbUser.app_metadata?.provider || "email").toLowerCase();
  const provider: AuthProviderType =
    rawProvider === "google"
      ? "google"
      : rawProvider === "github"
      ? "github"
      : "email";

  const derivedName =
    (typeof meta.full_name === "string" && meta.full_name.trim()) ||
    (typeof meta.name === "string" && meta.name.trim()) ||
    (typeof meta.user_name === "string" && meta.user_name.trim()) ||
    (email
      ? email
          .split("@")[0]
          .replace(/[._-]+/g, " ")
          .replace(/\b\w/g, (c: string) => c.toUpperCase())
      : "VeriSphere User");

  const defaultRoleTitle =
    accountType === "admin"
      ? "Platform Administrator"
      : accountType === "org"
      ? "Organization Hiring Lead"
      : "Individual Candidate";

  const defaultOrg =
    accountType === "admin"
      ? "VeriSphere Core Admin"
      : accountType === "org"
      ? "Organization Workspace"
      : "Personal Account";

  return {
    id: sbUser.id,
    name: derivedName,
    email,
    avatarUrl:
      (typeof meta.avatar_url === "string" && meta.avatar_url) ||
      (typeof meta.picture === "string" && meta.picture) ||
      undefined,
    provider,
    accountType,
    role: (typeof meta.role_title === "string" && meta.role_title.trim()) || defaultRoleTitle,
    organization:
      (typeof meta.organization === "string" && meta.organization.trim()) || defaultOrg,
    signedInAt: sbUser.last_sign_in_at || sbUser.created_at || new Date().toISOString(),
  };
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const supabaseConfigured = isSupabaseConfigured();
  const [user, setUser] = useState<SessionUser | null>(null);
  const [adminViewAs, setAdminViewAs] = useState<AccountRole>("admin");
  const [loading, setLoading] = useState(true);
  const [billing, setBilling] = useState<UserBillingState>(() =>
    buildDefaultBilling("individual")
  );

  const persistBilling = useCallback(
    (next: UserBillingState, email?: string, role?: AccountRole) => {
      setBilling(next);
      if (typeof window === "undefined" || role === "admin") return;
      try {
        localStorage.setItem(getBillingStorageKey(email, role), JSON.stringify(next));
      } catch {
        // ignore storage errors
      }
    },
    []
  );

  const loadBillingForUser = useCallback(
    (email?: string, role?: AccountRole) => {
      if (role === "admin") {
        setBilling(buildAdminBilling());
        return;
      }
      if (typeof window === "undefined") return;
      try {
        const key = getBillingStorageKey(email, role);
        const raw = localStorage.getItem(key);
        if (raw) {
          const parsed = JSON.parse(raw) as UserBillingState;
          if (parsed && parsed.planId) {
            const { state: checked, changed } = applyMonthlyResetIfDue(parsed, role);
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
      const fresh = buildDefaultBilling(role);
      persistBilling(fresh, email, role);
    },
    [persistBilling]
  );

  const syncFromSupabaseUser = useCallback(
    (sbUser: SupabaseUser | null) => {
      if (!sbUser) {
        setUser(null);
        setAdminViewAs("admin");
        loadBillingForUser(undefined, "individual");
        return;
      }
      const mapped = mapSupabaseUser(sbUser);
      setUser(mapped);
      if (mapped.accountType === "admin") {
        setAdminViewAs("admin");
      }
      if (typeof window !== "undefined") {
        localStorage.setItem("verisphere_api_key", "demo-api-key-1234");
      }
      loadBillingForUser(mapped.email, mapped.accountType);
    },
    [loadBillingForUser]
  );

  const refreshSession = useCallback(async () => {
    const supabase = createSupabaseBrowserClient();
    if (!supabase) {
      setLoading(false);
      return;
    }
    try {
      const { data } = await supabase.auth.getUser();
      syncFromSupabaseUser(data.user || null);
    } catch {
      syncFromSupabaseUser(null);
    } finally {
      setLoading(false);
    }
  }, [syncFromSupabaseUser]);

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    if (!supabase) {
      setLoading(false);
      return;
    }

    // Read local session immediately (0ms, zero remote HTTPS round-trip)
    supabase.auth
      .getSession()
      .then(({ data }) => {
        syncFromSupabaseUser(data.session?.user || null);
      })
      .catch(() => {
        syncFromSupabaseUser(null);
      })
      .finally(() => {
        setLoading(false);
      });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      syncFromSupabaseUser(session?.user || null);
      setLoading(false);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [syncFromSupabaseUser]);

  const logout = useCallback(async () => {
    const supabase = createSupabaseBrowserClient();
    if (supabase) {
      await supabase.auth.signOut();
    }
    if (typeof window !== "undefined") {
      localStorage.removeItem("verisphere_api_key");
    }
    setUser(null);
    setAdminViewAs("admin");
    loadBillingForUser(undefined, "individual");
  }, [loadBillingForUser]);

  const updateProfile = useCallback(
    async (fields: { name?: string; role?: string; organization?: string }) => {
      const supabase = createSupabaseBrowserClient();
      if (!supabase || !user) return false;
      try {
        const { data, error } = await supabase.auth.updateUser({
          data: {
            full_name: fields.name?.trim() || user.name,
            role_title: fields.role?.trim() || user.role,
            organization: fields.organization?.trim() || user.organization,
            account_type: user.accountType,
          },
        });
        if (error || !data.user) return false;
        syncFromSupabaseUser(data.user);
        return true;
      } catch {
        return false;
      }
    },
    [user, syncFromSupabaseUser]
  );

  const consumeCredits = useCallback(
    (count: number = 1): { allowed: boolean; remaining: number | "Unlimited" } => {
      // Admin accounts have no fixed monthly credits — always unrestricted
      if (user?.accountType === "admin") {
        return { allowed: true, remaining: "Unlimited" };
      }

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
      planId?: "starter" | "pro" | "enterprise";
      planName?: string;
      billingCycle?: "monthly" | "annual";
      creditsIncluded: number | "Unlimited";
    }) => {
      if (user?.accountType === "admin") {
        // Record transaction in admin history without capping unlimited credits
        setBilling((prev) => ({
          ...prev,
          transactions: [params.transaction, ...prev.transactions],
        }));
        return;
      }

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
    if (user?.accountType === "admin") return;
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

  const resetLocalBillingCache = useCallback(() => {
    if (typeof window === "undefined") return;
    Object.keys(localStorage).forEach((key) => {
      if (key.startsWith("verisphere_demo_billing_")) {
        localStorage.removeItem(key);
      }
    });
    loadBillingForUser(user?.email, user?.accountType);
  }, [loadBillingForUser, user?.email, user?.accountType]);

  const effectiveRole: AccountRole =
    user?.accountType === "admin" ? adminViewAs : user?.accountType || "individual";

  return (
    <AuthContext.Provider
      value={{
        user,
        effectiveRole,
        adminViewAs,
        setAdminViewAs,
        supabaseConfigured,
        loading,
        billing,
        refreshSession,
        logout,
        updateProfile,
        consumeCredits,
        recordDemoPurchase,
        downgradeToStarter,
        resetLocalBillingCache,
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
