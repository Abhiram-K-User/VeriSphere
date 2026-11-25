/**
 * @file resume-identity-extractor.ts
 * @package apps/api
 * @purpose Automatically extracts candidate name (firstName, lastName), email, institutionalEmail,
 *          and GitHub profile URL from an uploaded resume PDF buffer using decompressed PDF
 *          hyperlink annotations (via pdf-parse/pdfjs) plus raw URI fallback & text parsing.
 */

import crypto from "crypto";
import { parsePdfBuffer } from "@verisphere/forensics-engine";

export interface ExtractedCandidateIdentity {
  firstName: string;
  lastName: string;
  email: string;
  institutionalEmail?: string;
  githubUrl?: string;
  rawText: string;
}

const RESERVED_GITHUB_PATHS = new Set([
  "features",
  "pricing",
  "enterprise",
  "login",
  "signup",
  "join",
  "topics",
  "explore",
  "marketplace",
  "settings",
  "notifications",
  "pulls",
  "issues",
  "sponsors",
  "about",
  "security",
  "contact",
  "orgs",
  "apps",
  "docs",
  "blog",
  "collections",
  "events",
  "trending",
  "site",
  "customer-stories",
  "readme",
  "solutions",
  "team",
  // Common resume header labels that must NEVER be mistaken for GitHub handles
  "linkedin",
  "leetcode",
  "codeforces",
  "hackerrank",
  "geeksforgeeks",
  "gfg",
  "codechef",
  "kaggle",
  "portfolio",
  "website",
  "email",
  "phone",
  "link",
  "links",
  "github",
  "resume",
  "cv",
  "profile",
  "twitter",
  "medium",
  "gitlab",
  "bitbucket",
  "http",
  "https",
  "www",
]);

const SKIP_NAME_PATTERNS = [
  /resume/i,
  /curriculum\s+vitae/i,
  /\bcv\b/i,
  /summary/i,
  /objective/i,
  /education/i,
  /experience/i,
  /skills/i,
  /projects/i,
  /certifications/i,
  /contact/i,
  /portfolio/i,
  /linkedin/i,
  /github/i,
  /http/i,
  /www\./i,
  /@/,
  /\d{3,}/,
  /\+?\d[\d\s\-()]{7,}/,
];

function toTitleCase(str: string): string {
  return str
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => {
      if (word.length <= 2 && /^[A-Z.]+$/.test(word)) {
        return word;
      }
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(" ");
}

function isInstitutionalEmail(email: string): boolean {
  const domain = email.split("@")[1]?.toLowerCase() || "";
  return (
    domain.endsWith(".edu") ||
    domain.includes(".edu.") ||
    domain.includes(".ac.") ||
    domain.includes("university") ||
    domain.includes("college") ||
    domain.includes("institute")
  );
}

function extractRawUrisFromPdfBuffer(buffer: Buffer): string[] {
  const latin1 = buffer.toString("latin1");
  const uris: string[] = [];
  const uriRegex = /\/URI\s*\(([^)]+)\)/gi;
  let match: RegExpExecArray | null;
  while ((match = uriRegex.exec(latin1)) !== null) {
    if (match[1]) {
      uris.push(match[1].replace(/\\([()\\])/g, "$1").trim());
    }
  }
  return uris;
}

function isValidGithubUsername(username: string): boolean {
  const clean = username.trim();
  if (!clean || clean.length > 39) return false;
  if (!/^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,37}[a-zA-Z0-9])?$/.test(clean)) return false;
  if (RESERVED_GITHUB_PATHS.has(clean.toLowerCase())) return false;
  return true;
}

function extractGithubUrl(rawText: string, pdfLinks: string[]): string | undefined {
  // Score every github.com/<username> occurrence:
  // - Direct profile URLs (https://github.com/user or /user/) get +3 weight
  // - Project repo URLs (https://github.com/user/repo) get +2 weight
  // - Text matches get +1 weight
  const scores = new Map<string, { canonical: string; weight: number }>();

  const addCandidate = (rawUser: string, weight: number) => {
    if (!isValidGithubUsername(rawUser)) return;
    const key = rawUser.toLowerCase();
    const existing = scores.get(key);
    if (existing) {
      existing.weight += weight;
    } else {
      scores.set(key, { canonical: rawUser, weight });
    }
  };

  // 1. Inspect decompressed PDF hyperlink annotations + raw /URI strings first (most accurate)
  const linkGhRegex =
    /^(?:https?:\/\/)?(?:www\.)?github\.com\/([a-zA-Z0-9-]+)(\/[^?#\s]*)?/i;

  for (const link of pdfLinks) {
    const trimmed = link.trim();
    const match = trimmed.match(linkGhRegex);
    if (match && match[1]) {
      const hasSubpath = Boolean(match[2] && match[2] !== "/");
      addCandidate(match[1], hasSubpath ? 2 : 4);
    }
  }

  // 2. Inspect visible resume text for explicit github.com/<username> URLs
  const textGhRegex =
    /(?:https?:\/\/)?(?:www\.)?github\.com\/([a-zA-Z0-9](?:[a-zA-Z0-9-]{0,37}[a-zA-Z0-9])?)(?:\/|$|\s|[,;)|\]])/gi;

  let textMatch: RegExpExecArray | null;
  while ((textMatch = textGhRegex.exec(rawText)) !== null) {
    if (textMatch[1]) {
      addCandidate(textMatch[1], 2);
    }
  }

  if (scores.size > 0) {
    let best: { canonical: string; weight: number } | null = null;
    for (const entry of scores.values()) {
      if (!best || entry.weight > best.weight) {
        best = entry;
      }
    }
    if (best) {
      return `https://github.com/${best.canonical}`;
    }
  }

  // 3. Safe fallback ONLY for explicit "GitHub: username" or "GitHub - @username"
  //    (intentionally excludes "|" pipe so "GitHub | LinkedIn" or "GitHub | LeetCode" NEVER matches!)
  const labelRegex = /\bgithub\s*(?::|—|–|-)\s*@?([a-zA-Z0-9](?:[a-zA-Z0-9-]{0,37}[a-zA-Z0-9])?)\b/i;
  const labelMatch = rawText.match(labelRegex);
  if (labelMatch?.[1] && isValidGithubUsername(labelMatch[1])) {
    return `https://github.com/${labelMatch[1]}`;
  }

  return undefined;
}

function extractEmails(rawText: string, pdfLinks: string[]): {
  email?: string;
  institutionalEmail?: string;
} {
  const found = new Set<string>();
  const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

  for (const uri of pdfLinks) {
    if (uri.toLowerCase().startsWith("mailto:")) {
      const cleaned = uri.replace(/^mailto:/i, "").split("?")[0].trim().toLowerCase();
      if (emailRegex.test(cleaned)) {
        found.add(cleaned);
      }
      emailRegex.lastIndex = 0;
    }
  }

  const textMatches = rawText.match(emailRegex) || [];
  for (const m of textMatches) {
    found.add(m.trim().toLowerCase());
  }

  const allEmails = Array.from(found);
  if (allEmails.length === 0) return {};

  const inst = allEmails.find(isInstitutionalEmail);
  const personal = allEmails.find((e) => !isInstitutionalEmail(e));

  return {
    email: personal || inst,
    institutionalEmail: inst && inst !== personal ? inst : inst,
  };
}

function extractName(rawText: string, fileName: string, fallbackEmail?: string): {
  firstName: string;
  lastName: string;
} {
  const lines = rawText
    .split(/\r?\n/)
    .map((l) => l.replace(/[•|▪●►◆★§ïÐ#]/g, " ").replace(/\s+/g, " ").trim())
    .filter((l) => l.length >= 3 && l.length <= 50);

  for (const line of lines.slice(0, 12)) {
    if (SKIP_NAME_PATTERNS.some((re) => re.test(line))) continue;

    const cleaned = line.replace(/[^a-zA-Z.\-\s]/g, "").trim();
    const words = cleaned.split(/\s+/).filter(Boolean);

    if (words.length >= 2 && words.length <= 4) {
      const allValidWords = words.every((w) => /^[A-Za-z][A-Za-z.\-']{0,20}$/.test(w));
      if (allValidWords) {
        const titled = toTitleCase(cleaned).split(/\s+/);
        return {
          firstName: titled[0],
          lastName: titled.slice(1).join(" "),
        };
      }
    }
  }

  const baseName = fileName
    .replace(/\.pdf$/i, "")
    .replace(/(resume|cv|final|updated|profile|fidelity|\d+)/gi, " ")
    .replace(/[_\-.]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (baseName.length >= 2) {
    const parts = toTitleCase(baseName).split(/\s+/);
    return {
      firstName: parts[0],
      lastName: parts.slice(1).join(" ") || "Candidate",
    };
  }

  if (fallbackEmail) {
    const local = fallbackEmail.split("@")[0].replace(/[._\-0-9]+/g, " ").trim();
    if (local) {
      const parts = toTitleCase(local).split(/\s+/);
      return {
        firstName: parts[0],
        lastName: parts.slice(1).join(" ") || "Candidate",
      };
    }
  }

  return { firstName: "Unknown", lastName: "Candidate" };
}

export async function extractIdentityFromResume(
  pdfBuffer: Buffer,
  fileName: string = "resume.pdf"
): Promise<ExtractedCandidateIdentity> {
  let rawText = "";
  let decompressedLinks: string[] = [];

  try {
    const parsed = await parsePdfBuffer(pdfBuffer);
    rawText = parsed.rawText || "";
    decompressedLinks = Array.isArray(parsed.links) ? parsed.links : [];
  } catch (err) {
    console.warn(`[ResumeExtractor] PDF parse failed for ${fileName}:`, (err as Error).message);
  }

  const rawBufferLinks = extractRawUrisFromPdfBuffer(pdfBuffer);
  const allLinks = Array.from(new Set([...decompressedLinks, ...rawBufferLinks]));

  const { email: extractedEmail, institutionalEmail } = extractEmails(rawText, allLinks);
  const githubUrl = extractGithubUrl(rawText, allLinks);
  const { firstName, lastName } = extractName(rawText, fileName, extractedEmail);

  let finalEmail = extractedEmail;
  if (!finalEmail) {
    const hash = crypto.createHash("sha256").update(pdfBuffer).digest("hex").slice(0, 8);
    const slug =
      `${firstName}.${lastName}`
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ".")
        .replace(/^\.+|\.+$/g, "") || "candidate";
    finalEmail = `${slug}.${hash}@parsed.verisphere.local`;
  }

  console.log(
    `[ResumeExtractor] ${fileName} -> ${firstName} ${lastName} | ${finalEmail} | ${githubUrl || "no-github"} (links found: ${allLinks.length})`
  );

  return {
    firstName,
    lastName,
    email: finalEmail,
    institutionalEmail,
    githubUrl,
    rawText,
  };
}
