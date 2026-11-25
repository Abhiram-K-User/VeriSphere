/**
 * @file roles.ts
 * @package apps/web
 * @purpose Central definition of VeriSphere account roles (individual, org, admin),
 *          admin email elevation, and role-based capabilities.
 */

export type AccountRole = "individual" | "org" | "admin";
export type SelectableRole = "individual" | "org";
export type AuthProviderType = "google" | "github" | "email";

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  avatarUrl?: string;
  provider: AuthProviderType;
  accountType: AccountRole;
  role: string;
  organization: string;
  signedInAt: string;
}

/**
 * Emails that are automatically elevated to the "admin" account type upon login
 * (whether via Google OAuth, GitHub OAuth, or Email/Password).
 * Admins have unlimited credits (no monthly cap), full access to both Individual & Org
 * workflows, and dedicated Admin Testing Controls.
 */
export const ADMIN_EMAILS = new Set<string>([
  "admin@verisphere.ai",
  "msabhijay999@gmail.com",
  "abhiramk1008@gmail.com",
]);

export function isAdminEmail(email?: string | null): boolean {
  if (!email) return false;
  return ADMIN_EMAILS.has(email.trim().toLowerCase());
}

export function resolveAccountRole(
  email?: string | null,
  chosenOrStored?: string | null
): AccountRole {
  if (isAdminEmail(email)) {
    return "admin";
  }
  if (chosenOrStored === "org") {
    return "org";
  }
  return "individual";
}

export interface RoleDefinition {
  id: AccountRole;
  label: string;
  shortBadge: string;
  tagline: string;
  creditSummary: string;
  capabilities: string[];
  canBulkUpload: boolean;
  canViewBatches: boolean;
  hasAdminControls: boolean;
  hasUnlimitedCredits: boolean;
}

export const ROLE_DEFINITIONS: Record<AccountRole, RoleDefinition> = {
  individual: {
    id: "individual",
    label: "Individual Candidate",
    shortBadge: "INDIVIDUAL",
    tagline: "Personal resume & GitHub verification for job seekers and students.",
    creditSummary: "3 free verifications / month (auto-resets monthly)",
    capabilities: [
      "Single-candidate resume, GitHub & certificate verification",
      "3 free monthly verification credits on Starter plan",
      "Downloadable forensic Trust Score PDF audit reports",
      "Upgrade anytime for higher monthly quotas",
    ],
    canBulkUpload: false,
    canViewBatches: false,
    hasAdminControls: false,
    hasUnlimitedCredits: false,
  },
  org: {
    id: "org",
    label: "Organization",
    shortBadge: "ORGANIZATION",
    tagline: "Hiring teams & universities verifying candidates in bulk batches.",
    creditSummary: "25 trial credits · Bulk upload & batch analytics",
    capabilities: [
      "Bulk multi-PDF resume upload (up to 50 resumes per batch)",
      "Automatic extraction of candidate name, email & GitHub URLs",
      "Batch Analytics Dashboard with per-batch filtering cards",
      "Normalized batch tracking & team hiring reports",
    ],
    canBulkUpload: true,
    canViewBatches: true,
    hasAdminControls: false,
    hasUnlimitedCredits: false,
  },
  admin: {
    id: "admin",
    label: "Platform Admin",
    shortBadge: "ADMIN",
    tagline: "Unrestricted testing & administrative access across all VeriSphere features.",
    creditSummary: "Unlimited credits · No monthly cap",
    capabilities: [
      "Unlimited verifications with no monthly credit limit",
      "Full access to Bulk Org Upload & Batch Dashboard",
      "Role simulation switcher (test Individual vs Org views)",
      "Live Supabase Auth session inspector & system controls",
    ],
    canBulkUpload: true,
    canViewBatches: true,
    hasAdminControls: true,
    hasUnlimitedCredits: true,
  },
};

export function getRoleDefinition(role: AccountRole): RoleDefinition {
  return ROLE_DEFINITIONS[role] || ROLE_DEFINITIONS.individual;
}
