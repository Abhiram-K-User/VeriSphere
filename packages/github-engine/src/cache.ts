/**
 * @file cache.ts
 * @package @verisphere/github-engine
 * @purpose Conditional ETag (If-None-Match) + TTL in-memory cache for GitHub evidence reports.
 *          When a candidate's GitHub profile is re-verified, sends a lightweight conditional
 *          request (GET /users/:username/events/public with If-None-Match).
 *          If GitHub returns 304 Not Modified (~30ms, ZERO rate-limit cost!), returns the
 *          full cached GithubEvidenceReport immediately without re-scraping.
 */

import { Octokit } from "@octokit/rest";
import { GithubEvidenceReport } from "./types";

interface CacheEntry {
  report: GithubEvidenceReport;
  etag?: string;
  cachedAt: number;
}

const DEFAULT_TTL_MS = 1000 * 60 * 30; // 30 minutes fresh window with ETag revalidation
const MAX_CACHE_ENTRIES = 200;

const reportCache = new Map<string, CacheEntry>();

export async function fetchUserEventsEtag(
  username: string,
  octokit: Octokit,
  previousEtag?: string
): Promise<{ notModified: boolean; etag?: string }> {
  try {
    const res = await octokit.request("GET /users/{username}/events/public", {
      username,
      per_page: 1,
      headers: previousEtag ? { "If-None-Match": previousEtag } : undefined,
    });
    const nextEtag = res.headers?.etag;
    return { notModified: false, etag: nextEtag };
  } catch (err: any) {
    if (err?.status === 304) {
      return { notModified: true, etag: previousEtag };
    }
    return { notModified: false, etag: undefined };
  }
}

export async function getCachedGithubReport(
  username: string,
  octokit: Octokit
): Promise<{ report: GithubEvidenceReport | null; etag?: string }> {
  const key = username.toLowerCase();
  const entry = reportCache.get(key);
  if (!entry) {
    const { etag } = await fetchUserEventsEtag(username, octokit);
    return { report: null, etag };
  }

  const ageMs = Date.now() - entry.cachedAt;

  // Ultra-fast hit within 2 minutes (skip even ETag check during same batch)
  if (ageMs < 120_000) {
    console.log(`[github-cache] ⚡ Instant memory cache hit for @${username} (${Math.round(ageMs / 1000)}s old)`);
    return { report: entry.report, etag: entry.etag };
  }

  // Conditional ETag validation (zero GitHub rate-limit cost on 304!)
  if (ageMs < DEFAULT_TTL_MS && entry.etag) {
    const check = await fetchUserEventsEtag(username, octokit, entry.etag);
    if (check.notModified) {
      entry.cachedAt = Date.now();
      console.log(`[github-cache] ⚡ 304 Not Modified ETag cache hit for @${username} (0 quota used)`);
      return { report: entry.report, etag: entry.etag };
    }
    return { report: null, etag: check.etag };
  }

  return { report: null, etag: entry.etag };
}

export function setCachedGithubReport(
  username: string,
  report: GithubEvidenceReport,
  etag?: string
): void {
  const key = username.toLowerCase();
  if (reportCache.size >= MAX_CACHE_ENTRIES && !reportCache.has(key)) {
    const oldestKey = reportCache.keys().next().value;
    if (oldestKey) reportCache.delete(oldestKey);
  }
  reportCache.set(key, {
    report,
    etag,
    cachedAt: Date.now(),
  });
}
