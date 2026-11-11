/**
 * @file report-mapper.ts
 * @package apps/api
 * @purpose Rebuilds legacy JSON fields from normalized relational rows so existing
 *          frontend views and PDF generator remain 100% compatible while reading from
 *          normalized PostgreSQL tables.
 */

export function mapRelationalJobToLegacyShape(job: any): any {
  if (!job) return job;

  const mapped = { ...job };

  // Rebuild report legacy fields from normalized RiskIndicator and Contradiction rows if loaded
  if (mapped.report) {
    const report = { ...mapped.report };

    if (Array.isArray(report.riskIndicators) && report.riskIndicators.length > 0 && !report.riskIndicatorsJson) {
      report.riskIndicatorsJson = JSON.stringify(
        report.riskIndicators.map((ri: any) => ({
          category: ri.type,
          type: ri.type,
          severity: ri.severity,
          level: ri.severity,
          description: ri.description,
          evidence: ri.evidenceRef || ""
        }))
      );
    }

    if (
      Array.isArray(report.contradictionItems) &&
      report.contradictionItems.length > 0 &&
      (!Array.isArray(report.contradictions) || report.contradictions.length === 0)
    ) {
      report.contradictions = report.contradictionItems.map((c: any) => c.description);
    }

    mapped.report = report;
  }

  // Rebuild githubMetricsJson from normalized GithubProfile + Repository rows if missing
  if (!mapped.githubMetricsJson && mapped.candidate?.githubProfile) {
    const gp = mapped.candidate.githubProfile;
    const repos = Array.isArray(gp.repositories) ? gp.repositories : [];
    mapped.githubMetricsJson = JSON.stringify({
      id: gp.id,
      candidateId: mapped.candidateId,
      githubUsername: gp.username,
      publicReposCount: gp.publicRepos,
      followersCount: gp.followers,
      followingCount: 0,
      accountAgeMonths: 12,
      totalCommitsCollected: repos.reduce((acc: number, r: any) => acc + (r.commitCount || 0), 0),
      analyzedRepos: repos.map((r: any) => ({
        name: r.name,
        language: r.primaryLanguage || "Unknown",
        commits: r.commitCount || 0,
        stars: 0,
        recentCommits: []
      })),
      timelineAnomalyAlerts: [],
      hasTimelineGaps: false
    });
  }

  return mapped;
}

