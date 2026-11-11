/**
 * @file index.ts
 * @package @verisphere/github-engine
 * @purpose Public API for the GitHub Evidence Scraper.
 *          Orchestrates all modules and assembles the final GithubEvidenceReport.
 *
 * Entry points:
 *   - extractUsername(input)          → normalize URL/username → plain username
 *   - scrapeGithubEvidence(githubUrl) → full pipeline → GithubEvidenceReport
 *
 * Mock mode: set MOCK_GITHUB=true to skip all API calls and return mock data.
 */

// Load .env at module boundary (safe to call multiple times)
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require("dotenv").config();
} catch {
  // Silently continue — env vars may already be set externally
}

import { getOctokit } from "./githubClient";
import { fetchRepositories, fetchLanguageDistribution } from "./repoFetcher";
import { detectTechnologies } from "./techDetector";
import { analyzeContributors } from "./contributorAnalyzer";
import { computeOwnershipScore } from "./ownershipScorer";
import { fetchCommitActivity, computeActivityScore } from "./activityScorer";
import { analyzeTimeline, CommitDatePair } from "./timelineAnalyzer";
import { MOCK_GITHUB_EVIDENCE_REPORT } from "./mocks/mockData";
import {
  GithubEvidenceReport,
  RepositoryEvidence,
  ContributorResult,
  ActivityMetrics,
  TimelineFlag,
  RepoEvidence,
} from "./types";

// Re-export all types for consumers of this package
export * from "./types";

// ---------------------------------------------------------------------------
// Username Extraction
// ---------------------------------------------------------------------------

/**
 * Normalizes various GitHub URL/username formats to a plain username string.
 *
 * Supported inputs:
 *   https://github.com/username
 *   https://github.com/username/
 *   github.com/username
 *   username
 *
 * @param input - Raw GitHub URL or username
 * @returns Plain GitHub username
 * @throws Error if input is empty or unparseable
 */
export function extractUsername(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) {
    throw new Error("[github-engine] extractUsername: input cannot be empty.");
  }

  // Strip protocol and trailing slashes
  const cleaned = trimmed
    .replace(/^https?:\/\//i, "")
    .replace(/^github\.com\//i, "")
    .replace(/\/+$/, "")
    .split("/")[0] // take only the first path segment
    .trim();

  if (!cleaned) {
    throw new Error(
      `[github-engine] extractUsername: could not extract username from "${input}".`
    );
  }

  return cleaned;
}

// ---------------------------------------------------------------------------
// Main Pipeline
// ---------------------------------------------------------------------------

/**
 * Full GitHub evidence scraping pipeline.
 *
 * Inputs:
 *   githubUrl — any supported GitHub URL or plain username
 *
 * Process (when MOCK_GITHUB != true):
 *   1. Extract username from input
 *   2. Fetch all non-archived repositories
 *   3. Aggregate language distribution across repos
 *   4. For each repo (parallel, fault-tolerant):
 *      a. Detect technologies from file contents
 *      b. Analyze contributor ownership
 *      c. Fetch commit activity metrics
 *      d. Run timeline anomaly detectors
 *   5. Compute ownership score and activity score
 *   6. Assemble and return GithubEvidenceReport
 *
 * Output: GithubEvidenceReport — deterministic JSON, no nulls, scores 0–100.
 *
 * @param githubUrl - GitHub profile URL or username
 * @returns Full GithubEvidenceReport
 */
export async function scrapeGithubEvidence(
  githubUrl: string
): Promise<GithubEvidenceReport> {
  // --- Mock mode shortcut ---
  if (
    process.env.MOCK_GITHUB === "true" ||
    process.env.MOCK_GITHUB === "1"
  ) {
    console.log("[github-engine] MOCK_GITHUB=true — returning mock data.");
    const username = extractUsername(githubUrl);
    return { ...MOCK_GITHUB_EVIDENCE_REPORT, username };
  }

  // --- Step 1: Normalize username ---
  const username = extractUsername(githubUrl);
  console.log(`[github-engine] Scraping evidence for: ${username}`);

  const octokit = getOctokit();

  // --- Step 2: Fetch repositories ---
  const repositories: RepositoryEvidence[] = await fetchRepositories(
    username,
    octokit
  );
  console.log(`[github-engine] Found ${repositories.length} repositories.`);

  if (repositories.length === 0) {
    return buildEmptyReport(username);
  }

  // In unauthenticated mode (60 req/hr limit), deeply analyze top 6 non-fork recent repos
  // to avoid exhausting the hourly IP quota on the very first candidate, while still recording
  // metadata for all remaining repositories.
  const hasToken = Boolean(process.env.GITHUB_TOKEN && process.env.GITHUB_TOKEN.trim().length > 0);
  const prioritizedRepos = [...repositories].sort((a, b) => Number(a.isFork) - Number(b.isFork));
  const deepRepos = hasToken ? prioritizedRepos : prioritizedRepos.slice(0, 6);
  const deepRepoNames = new Set(deepRepos.map((r) => r.name));
  const shallowRepos = prioritizedRepos.filter((r) => !deepRepoNames.has(r.name));

  // --- Step 3: Language distribution ---
  const languageDistribution = await fetchLanguageDistribution(
    username,
    deepRepos,
    octokit
  );

  const verifiedLanguages = Object.entries(languageDistribution)
    .sort((a, b) => b[1] - a[1]) // sort by percentage descending
    .map(([lang]) => lang);

  // --- Step 4: Per-repo analysis (parallel, fault-tolerant, batch-limited) ---
  const repoAnalysisResults: PromiseSettledResult<{
    repo: RepositoryEvidence;
    technologies: string[];
    contributorResult: ContributorResult;
    activityMetrics: ActivityMetrics;
    flags: TimelineFlag[];
  }>[] = [];

  const limit = 3;
  for (let i = 0; i < deepRepos.length; i += limit) {
    const chunk = deepRepos.slice(i, i + limit);
    const chunkResults = await Promise.allSettled(
      chunk.map(async (repo) => {
        const [technologies, contributorResult, activityMetrics] =
          await Promise.all([
            detectTechnologies(username, repo.name, octokit, repo.language),
            analyzeContributors(username, repo.name, octokit),
            fetchCommitActivity(username, repo.name, octokit),
          ]);

        // Build CommitDatePair array for timeline analysis
        const commitPairs: CommitDatePair[] = activityMetrics.commitDates.map(
          (d) => ({ authorDate: d, committerDate: d })
        );

        const flags = analyzeTimeline(repo.name, commitPairs);

        return { repo, technologies, contributorResult, activityMetrics, flags };
      })
    );
    repoAnalysisResults.push(...chunkResults);
  }

  // Collect results, skipping failed repos
  const contributorResults: ContributorResult[] = [];
  const allActivityMetrics: ActivityMetrics[] = [];
  const allTimelineFlags: TimelineFlag[] = [];
  const allTechSets = new Set<string>();
  const repoEvidence: RepoEvidence[] = [];

  for (const settled of repoAnalysisResults) {
    if (settled.status === "rejected") {
      console.warn("[github-engine] Repo analysis failed:", settled.reason);
      continue;
    }

    const { repo, technologies, contributorResult, activityMetrics, flags } =
      settled.value;

    contributorResults.push(contributorResult);
    allActivityMetrics.push(activityMetrics);
    allTimelineFlags.push(...flags);
    technologies.forEach((t) => allTechSets.add(t));

    repoEvidence.push({
      repoName: repo.name,
      technologies,
      ownershipPercent: contributorResult.ownershipPercent,
      totalCommits: activityMetrics.totalCommits,
      primaryLanguage: repo.language ?? "Unknown",
      flags: flags.map((f) => f.type),
      recentCommits: activityMetrics.recentCommits,
    });
  }

  for (const repo of shallowRepos) {
    const langTechs = repo.language && repo.language.toLowerCase() !== "unknown" ? [repo.language] : [];
    langTechs.forEach((t) => allTechSets.add(t));
    repoEvidence.push({
      repoName: repo.name,
      technologies: langTechs,
      ownershipPercent: 100,
      totalCommits: 0,
      primaryLanguage: repo.language ?? "Unknown",
      flags: [],
      recentCommits: [],
    });
  }

  // --- Step 5: Aggregate scores ---
  const ownershipScore = computeOwnershipScore(contributorResults);
  const activityScore = computeActivityScore(allActivityMetrics);
  const verifiedSkills = Array.from(allTechSets).sort();

  // --- Step 6: Assemble report ---
  const report: GithubEvidenceReport = {
    username,
    repositories,
    verifiedSkills,
    verifiedLanguages,
    languageDistribution,
    ownershipScore,
    activityScore,
    timelineFlags: allTimelineFlags,
    repoEvidence,
  };

  console.log(
    `[github-engine] Evidence scraping complete. ` +
      `ownershipScore=${ownershipScore}, activityScore=${activityScore}, ` +
      `skills=${verifiedSkills.length}, flags=${allTimelineFlags.length}`
  );

  return report;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildEmptyReport(username: string): GithubEvidenceReport {
  return {
    username,
    repositories: [],
    verifiedSkills: [],
    verifiedLanguages: [],
    languageDistribution: {},
    ownershipScore: 0,
    activityScore: 0,
    timelineFlags: [],
    repoEvidence: [],
  };
}
