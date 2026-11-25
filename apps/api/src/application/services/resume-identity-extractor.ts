/**
 * @file resume-identity-extractor.ts
 * @package apps/api
 * @purpose Automatically extracts candidate name (firstName, lastName), email, institutionalEmail,
 *          and GitHub profile URL from an uploaded resume PDF buffer (scanning both visible text
 *          and embedded PDF hyperlink /URI annotations).
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
        return word; // preserve initials like "M", "S", "K."
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

function extractUrisFromPdfBuffer(buffer: Buffer): string[] {
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

function extractGithubUrl(rawText: string, pdfUris: string[]): string | undefined {
  const combinedSources = [...pdfUris, rawText];

  // 1. Look for full or partial github.com/<username> links
  const ghRegex =
    /(?:https?:\/\/)?(?:www\.)?github\.com\/([a-zA-Z0-9](?:[a-zA-Z0-9-]{0,37}[a-zA-Z0-9])?)(?:\/|$|\s|[,;)|\]])/gi;

  for (const source of combinedSources) {
    ghRegex.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = ghRegex.exec(source)) !== null) {
      const candidateUser = match[1]?.trim();
      if (candidateUser && !RESERVED_GITHUB_PATHS.has(candidateUser.toLowerCase())) {
        return `https://github.com/${candidateUser}`;
      }
    }
  }

  // 2. Look for "GitHub: username" or "GitHub - @username" in text
  const labelRegex = /github\s*[:|\-–—]\s*@?([a-zA-Z0-9](?:[a-zA-Z0-9-]{0,37}[a-zA-Z0-9])?)/i;
  const labelMatch = rawText.match(labelRegex);
  if (labelMatch?.[1] && !RESERVED_GITHUB_PATHS.has(labelMatch[1].toLowerCase())) {
    return `https://github.com/${labelMatch[1]}`;
  }

  return undefined;
}

function extractEmails(rawText: string, pdfUris: string[]): {
  email?: string;
  institutionalEmail?: string;
} {
  const found = new Set<string>();
  const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

  for (const uri of pdfUris) {
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
    .map((l) => l.replace(/[•|▪●►◆★]/g, " ").replace(/\s+/g, " ").trim())
    .filter((l) => l.length >= 3 && l.length <= 50);

  for (const line of lines.slice(0, 12)) {
    if (SKIP_NAME_PATTERNS.some((re) => re.test(line))) continue;

    // Strip trailing separators or single-letter noise
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

  // Fallback 1: clean filename (e.g. "Abhijay_MS_Resume.pdf")
  const baseName = fileName
    .replace(/\.pdf$/i, "")
    .replace(/(resume|cv|final|updated|profile|\d+)/gi, " ")
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

  // Fallback 2: email local-part
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
  try {
    const parsed = await parsePdfBuffer(pdfBuffer);
    rawText = parsed.rawText || "";
  } catch (err) {
    console.warn(`[ResumeExtractor] PDF text parse failed for ${fileName}:`, (err as Error).message);
  }

  const pdfUris = extractUrisFromPdfBuffer(pdfBuffer);
  const { email: extractedEmail, institutionalEmail } = extractEmails(rawText, pdfUris);
  const githubUrl = extractGithubUrl(rawText, pdfUris);
  const { firstName, lastName } = extractName(rawText, fileName, extractedEmail);

  // Ensure a valid unique email exists even if the PDF was a scanned image without selectable email text
  let finalEmail = extractedEmail;
  if (!finalEmail) {
    const hash = crypto.createHash("sha256").update(pdfBuffer).digest("hex").slice(0, 8);
    const slug = `${firstName}.${lastName}`.toLowerCase().replace(/[^a-z0-9]+/g, ".").replace(/^\.+|\.+$/g, "") || "candidate";
    finalEmail = `${slug}.${hash}@parsed.verisphere.local`;
  }

  return {
    firstName,
    lastName,
    email: finalEmail,
    institutionalEmail,
    githubUrl,
    rawText,
  };
}
