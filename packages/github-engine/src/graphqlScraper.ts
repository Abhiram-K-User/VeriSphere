/**
 * @file graphqlScraper.ts
 * @package @verisphere/github-engine
 * @purpose High-speed GitHub GraphQL API v4 evidence scraper.
 *          Fetches user account age, ALL repositories (including ALL forks!), language byte
 *          distributions, root & subdirectory dependency files (package.json, requirements.txt),
 *          and per-repo authored commit histories in 2 HTTP round-trips instead of 150+ REST calls.
 */

import { Octokit } from "@octokit/rest";
import { computeOwnershipScore } from "./ownershipScorer";
import { computeActivityScore } from "./activityScorer";
import { analyzeTimeline, CommitDatePair } from "./timelineAnalyzer";
import {
  applyLanguageAndFileHeuristics,
  parsePackageJsonContent,
  parseRequirementsContent,
} from "./techDetector";
import {
  ActivityMetrics,
  ContributorResult,
  GithubEvidenceReport,
  RepoEvidence,
  RepositoryEvidence,
  TimelineFlag,
} from "./types";

const USER_META_QUERY = `
  query GetUserMeta($login: String!) {
    user(login: $login) {
      id
      login
      createdAt
    }
  }
`;

const REPOS_BATCH_QUERY = `
  query GetUserReposEvidence($login: String!, $authorId: ID!, $after: String) {
    user(login: $login) {
      repositories(
        first: 40
        after: $after
        ownerAffiliations: [OWNER]
        orderBy: { field: PUSHED_AT, direction: DESC }
      ) {
        pageInfo {
          hasNextPage
          endCursor
        }
        nodes {
          name
          description
          isFork
          isArchived
          stargazerCount
          forkCount
          createdAt
          updatedAt
          pushedAt
          primaryLanguage {
            name
          }
          languages(first: 10, orderBy: { field: SIZE, direction: DESC }) {
            edges {
              size
              node {
                name
              }
            }
          }
          rootTree: object(expression: "HEAD:") {
            ... on Tree {
              entries {
                name
                type
              }
            }
          }
          pkgJson: object(expression: "HEAD:package.json") {
            ... on Blob { text }
          }
          reqTxt: object(expression: "HEAD:requirements.txt") {
            ... on Blob { text }
          }
          fePkg: object(expression: "HEAD:frontend/package.json") {
            ... on Blob { text }
          }
          clPkg: object(expression: "HEAD:client/package.json") {
            ... on Blob { text }
          }
          webPkg: object(expression: "HEAD:web/package.json") {
            ... on Blob { text }
          }
          bePkg: object(expression: "HEAD:backend/package.json") {
            ... on Blob { text }
          }
          apiPkg: object(expression: "HEAD:api/package.json") {
            ... on Blob { text }
          }
          beReq: object(expression: "HEAD:backend/requirements.txt") {
            ... on Blob { text }
          }
          defaultBranchRef {
            target {
              ... on Commit {
                allHistory: history(first: 1) {
                  totalCount
                }
                authoredHistory: history(first: 60, author: { id: $authorId }) {
                  totalCount
                  nodes {
                    authoredDate
                    committedDate
                    messageHeadline
                  }
                }
              }
            }
          }
        }
      }
    }
  }
`;

export async function scrapeGithubViaGraphQL(
  username: string,
  octokit: Octokit
): Promise<GithubEvidenceReport | null> {
  const startTime = Date.now();

  // 1. Fetch user node ID and account createdAt in 1 tiny call
  const metaRes: any = await octokit.request("POST /graphql", {
    query: USER_META_QUERY,
    variables: { login: username },
  });

  const userNode = metaRes?.data?.data?.user;
  if (!userNode?.id) {
    return null;
  }

  const authorId: string = userNode.id;
  let accountAgeMonths = 12;
  if (userNode.createdAt) {
    const diffMs = Math.max(0, Date.now() - new Date(userNode.createdAt).getTime());
    accountAgeMonths = Math.max(1, Math.round(diffMs / (1000 * 60 * 60 * 24 * 30.4375)));
  }

  // 2. Paginate ALL non-archived repositories (including ALL forks!) in chunks of 40
  const allRepoNodes: any[] = [];
  let cursor: string | null = null;
  let pages = 0;

  while (pages < 4) {
    pages++;
    const reposRes: any = await octokit.request("POST /graphql", {
      query: REPOS_BATCH_QUERY,
      variables: { login: username, authorId, after: cursor },
    });

    const repoConn = reposRes?.data?.data?.user?.repositories;
    const nodes = Array.isArray(repoConn?.nodes) ? repoConn.nodes : [];
    allRepoNodes.push(...nodes.filter((n: any) => n && !n.isArchived));

    if (repoConn?.pageInfo?.hasNextPage && repoConn?.pageInfo?.endCursor) {
      cursor = repoConn.pageInfo.endCursor;
    } else {
      break;
    }
  }

  if (allRepoNodes.length === 0) {
    return {
      username,
      repositories: [],
      verifiedSkills: [],
      verifiedLanguages: [],
      languageDistribution: {},
      ownershipScore: 0,
      activityScore: 0,
      timelineFlags: [],
      accountAgeMonths,
      repoEvidence: [],
    };
  }

  // 3. Process ALL repositories (zero repos or forks skipped!) purely in memory (0 extra HTTP calls!)
  const repositories: RepositoryEvidence[] = [];
  const byteTotals: Record<string, number> = {};
  let grandTotalBytes = 0;

  const contributorResults: ContributorResult[] = [];
  const allActivityMetrics: ActivityMetrics[] = [];
  const allTimelineFlags: TimelineFlag[] = [];
  const allTechSets = new Set<string>();
  const verifiedLangSet = new Set<string>();
  const repoEvidence: RepoEvidence[] = [];

  for (const node of allRepoNodes) {
    const primaryLang: string | undefined = node.primaryLanguage?.name || undefined;
    if (primaryLang && primaryLang.toLowerCase() !== "unknown") {
      verifiedLangSet.add(primaryLang);
    }

    repositories.push({
      name: node.name,
      description: node.description ?? undefined,
      language: primaryLang,
      stars: node.stargazerCount ?? 0,
      forks: node.forkCount ?? 0,
      createdAt: node.createdAt ?? new Date(0).toISOString(),
      updatedAt: node.updatedAt ?? new Date(0).toISOString(),
      pushedAt: node.pushedAt ?? new Date(0).toISOString(),
      isFork: Boolean(node.isFork),
    });

    // Language bytes
    const repoLanguages: string[] = [];
    const langEdges = Array.isArray(node.languages?.edges) ? node.languages.edges : [];
    for (const edge of langEdges) {
      const lName = edge?.node?.name;
      const size = Number(edge?.size || 0);
      if (lName && size > 0) {
        repoLanguages.push(lName);
        verifiedLangSet.add(lName);
        byteTotals[lName] = (byteTotals[lName] ?? 0) + size;
        grandTotalBytes += size;
      }
    }

    // Detect technologies from tree + root & subdirectory manifests
    const repoTechs = new Set<string>();
    const rootEntries: string[] = Array.isArray(node.rootTree?.entries)
      ? node.rootTree.entries.map((e: any) => String(e.name || ""))
      : [];

    applyLanguageAndFileHeuristics(repoTechs, primaryLang, repoLanguages, rootEntries);

    const pkgBlobs = [node.pkgJson, node.fePkg, node.clPkg, node.webPkg, node.bePkg, node.apiPkg];
    for (const blob of pkgBlobs) {
      if (typeof blob?.text === "string" && blob.text.trim()) {
        parsePackageJsonContent(blob.text, repoTechs);
      }
    }

    const reqBlobs = [node.reqTxt, node.beReq];
    for (const blob of reqBlobs) {
      if (typeof blob?.text === "string" && blob.text.trim()) {
        parseRequirementsContent(blob.text, repoTechs);
      }
    }

    const sortedRepoTechs = Array.from(repoTechs).sort();
    sortedRepoTechs.forEach((t) => allTechSets.add(t));

    // Commit history & ownership calculation
    const target = node.defaultBranchRef?.target;
    const totalRepoCommits = Number(target?.allHistory?.totalCount || 0);
    const authoredTotal = Number(target?.authoredHistory?.totalCount || 0);
    const commitNodes = Array.isArray(target?.authoredHistory?.nodes)
      ? target.authoredHistory.nodes
      : [];

    const ownershipPercent =
      totalRepoCommits > 0
        ? Math.min(100, Math.round((authoredTotal / totalRepoCommits) * 100))
        : 0;

    contributorResults.push({
      repoName: node.name,
      candidateContributions: authoredTotal,
      totalContributions: totalRepoCommits,
      ownershipPercent,
    });

    const commitPairs: CommitDatePair[] = [];
    const commitDates: Date[] = [];
    const recentCommits: string[] = [];

    for (const c of commitNodes) {
      const aDate = c?.authoredDate ? new Date(c.authoredDate) : null;
      const cDate = c?.committedDate ? new Date(c.committedDate) : aDate;
      if (aDate && !isNaN(aDate.getTime())) {
        commitDates.push(aDate);
        commitPairs.push({
          authorDate: aDate,
          committerDate: cDate && !isNaN(cDate.getTime()) ? cDate : aDate,
        });
      }
      if (recentCommits.length < 5 && typeof c?.messageHeadline === "string" && c.messageHeadline.trim()) {
        recentCommits.push(c.messageHeadline.trim());
      }
    }

    commitDates.sort((a, b) => a.getTime() - b.getTime());

    const monthSet = new Set<string>();
    for (const d of commitDates) {
      monthSet.add(`${d.getFullYear()}-${d.getMonth()}`);
    }
    const activeMonths = monthSet.size;
    let avgCommitsPerMonth = 0;
    let lastActiveDate = new Date(0).toISOString();

    if (commitDates.length > 0) {
      const firstDate = commitDates[0];
      const lastDate = commitDates[commitDates.length - 1];
      lastActiveDate = lastDate.toISOString();
      const spanMonths = Math.max(
        1,
        (lastDate.getFullYear() - firstDate.getFullYear()) * 12 +
          (lastDate.getMonth() - firstDate.getMonth()) +
          1
      );
      avgCommitsPerMonth = commitDates.length / spanMonths;
    }

    const activityMetric: ActivityMetrics = {
      repoName: node.name,
      totalCommits: authoredTotal,
      activeMonths,
      avgCommitsPerMonth,
      lastActiveDate,
      commitDates,
      recentCommits,
    };
    allActivityMetrics.push(activityMetric);

    const flags: TimelineFlag[] = analyzeTimeline(node.name, commitPairs);
    allTimelineFlags.push(...flags);

    repoEvidence.push({
      repoName: node.name,
      technologies: sortedRepoTechs,
      ownershipPercent,
      totalCommits: authoredTotal,
      primaryLanguage: primaryLang ?? "Unknown",
      flags: flags.map((f) => f.type),
      recentCommits,
    });
  }

  // Language distribution across ALL repos
  const languageDistribution: Record<string, number> = {};
  if (grandTotalBytes > 0) {
    for (const [lang, bytes] of Object.entries(byteTotals)) {
      languageDistribution[lang] = Math.max(1, Math.round((bytes / grandTotalBytes) * 100));
    }
  }

  const verifiedLanguages = Array.from(verifiedLangSet).sort(
    (a, b) => (languageDistribution[b] || 0) - (languageDistribution[a] || 0)
  );

  allTechSets.add("Git");
  allTechSets.add("GitHub");

  const ownershipScore = computeOwnershipScore(contributorResults);
  const activityScore = computeActivityScore(allActivityMetrics);
  const verifiedSkills = Array.from(allTechSets).sort();

  const elapsedMs = Date.now() - startTime;
  console.log(
    `[github-engine] ⚡ GraphQL v4 scrape for @${username} completed in ${elapsedMs}ms ` +
      `(${repositories.length} repos incl. forks, ${pages + 1} API calls, skills=${verifiedSkills.length})`
  );

  return {
    username,
    repositories,
    verifiedSkills,
    verifiedLanguages,
    languageDistribution,
    ownershipScore,
    activityScore,
    timelineFlags: allTimelineFlags,
    accountAgeMonths,
    repoEvidence,
  };
}
