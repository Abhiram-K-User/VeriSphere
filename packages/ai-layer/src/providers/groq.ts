import Groq from 'groq-sdk';
import { AuditReport } from '@verisphere/shared-types';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function compactResumeText(raw: string, maxChars: number): string {
  const normalized = (raw || '')
    .replace(/\r/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  if (normalized.length <= maxChars) return normalized;
  return normalized.slice(0, maxChars) + '\n...[truncated]';
}

/**
 * Compacts githubMetrics for LLM input WITHOUT dropping any repositories (including forks).
 * Removes whitespace indentation and verbose commit payloads so requests stay well under
 * Groq's free-tier TPM budget (8,000 TPM) while preserving 100% of repos, languages, and skills.
 */
function compactGithubMetrics(metrics: any, ultraCompact: boolean = false): any {
  if (!metrics || typeof metrics !== 'object') return metrics;

  const repos = Array.isArray(metrics.analyzedRepos) ? metrics.analyzedRepos : [];
  const compactRepos = repos.map((r: any) => {
    const item: Record<string, any> = {
      name: r.name,
      lang: r.language || 'Unknown',
      commits: r.commits || 0,
    };
    if (Array.isArray(r.technologies) && r.technologies.length > 0) {
      item.tech = r.technologies;
    }
    if (!ultraCompact && Array.isArray(r.recentCommits) && r.recentCommits.length > 0) {
      item.msgs = r.recentCommits
        .slice(0, 2)
        .map((m: string) => String(m).slice(0, 55));
    }
    return item;
  });

  const alerts = Array.isArray(metrics.timelineAnomalyAlerts)
    ? Array.from(new Set(metrics.timelineAnomalyAlerts)).slice(0, 10)
    : [];

  return {
    user: metrics.githubUsername,
    reposCount: metrics.publicReposCount ?? repos.length,
    ageMonths: metrics.accountAgeMonths,
    totalCommits: metrics.totalCommitsCollected ?? 0,
    verifiedSkills: Array.isArray(metrics.verifiedSkills) ? metrics.verifiedSkills : [],
    verifiedLanguages: Array.isArray(metrics.verifiedLanguages) ? metrics.verifiedLanguages : [],
    langDist: metrics.languageDistribution || {},
    hasTimelineGaps: Boolean(metrics.hasTimelineGaps),
    alerts,
    repos: compactRepos,
  };
}

export class GroqAIProvider {
  private groq: Groq;
  private model: string;

  constructor() {
    this.groq = new Groq({
      apiKey: process.env.GROQ_API_KEY,
    });
    this.model = process.env.GROQ_MODEL || 'openai/gpt-oss-120b';
  }

  private async callWithRetry(
    messages: Array<{ role: 'system' | 'user'; content: string }>,
    buildUltraCompactUserPrompt?: () => string
  ): Promise<string> {
    const maxAttempts = 4;
    let currentMessages = messages;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const completion = await this.groq.chat.completions.create({
          messages: currentMessages,
          model: this.model,
          temperature: 0.1,
          response_format: { type: 'json_object' },
        });

        const resultString = completion.choices[0]?.message?.content;
        if (!resultString) {
          throw new Error('Groq returned empty response');
        }
        return resultString;
      } catch (error: any) {
        const status = error?.status;
        const retryAfterHeader = error?.headers?.['retry-after'];
        const isPayloadTooLarge = status === 413;
        const isRateLimited = status === 429;

        if ((isPayloadTooLarge || isRateLimited) && attempt < maxAttempts) {
          // On 413 (request exceeds TPM limit), immediately shrink payload further
          if (isPayloadTooLarge && buildUltraCompactUserPrompt) {
            console.warn(
              `[Groq AI] 413 payload too large on attempt ${attempt}; switching to ultra-compact payload...`
            );
            currentMessages = [
              currentMessages[0],
              { role: 'user', content: buildUltraCompactUserPrompt() },
            ];
          }

          const retryAfterSec = retryAfterHeader ? parseFloat(String(retryAfterHeader)) : NaN;
          const waitMs = !isNaN(retryAfterSec)
            ? Math.min(Math.max(retryAfterSec * 1000, 1500), 15000)
            : Math.min(2500 * attempt, 12000);

          console.warn(
            `[Groq AI] Rate limit / TPM (${status}) on attempt ${attempt}/${maxAttempts}. Waiting ${Math.round(waitMs / 1000)}s before retry...`
          );
          await sleep(waitMs);
          continue;
        }

        console.error('[Groq AI] Error during Groq API call:', error);
        throw error;
      }
    }

    throw new Error('Groq AI call failed after maximum retries.');
  }

  public async analyzeCandidate(
    resumeText: string,
    githubMetrics: any,
    systemPrompt: string
  ): Promise<Partial<AuditReport>> {
    console.log('[Groq AI] Sending compact analysis request to Groq...');

    const buildPrompt = (ultraCompact: boolean) => {
      const trimmedResume = compactResumeText(resumeText, ultraCompact ? 3800 : 6200);
      const compactGit = compactGithubMetrics(githubMetrics, ultraCompact);
      return `RESUME:\n${trimmedResume}\n\nGITHUB:\n${JSON.stringify(compactGit)}`;
    };

    const resultString = await this.callWithRetry(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: buildPrompt(false) },
      ],
      () => buildPrompt(true)
    );

    return JSON.parse(resultString) as Partial<AuditReport>;
  }

  public async generateProfessionalReport(data: any): Promise<any> {
    console.log('[Groq AI] Generating professional verification report...');

    const systemPrompt = `
You are an expert technical recruiter and auditor. Your task is to generate a professional PDF verification report for a candidate based on the raw JSON data provided.
The report must be concise, structured, and strictly recruiter-facing. Do not generate markdown tables, just structured JSON that will be injected into a Handlebars PDF template.
You must output ONLY valid JSON matching this schema exactly:
{
  "executiveSummary": "A brief overview of candidate strengths, credibility, evidence coverage, and major concerns.",
  "resumeVerificationDashboard": {
    "claimedSkillsCount": 0,
    "verifiedSkillsCount": 0,
    "unverifiedSkillsCount": 0,
    "falselyClaimedSkills": ["skill1", "skill2"],
    "verificationCoverage": "percentage string, e.g., '80%'"
  },
  "githubVerificationDashboard": {
    "repositoryCount": 0,
    "verifiedTechnologies": 0,
    "ownershipScore": 0,
    "activityScore": 0,
    "certificateStatus": "Status of the certificate e.g. 'VALID', 'UNVERIFIED', 'NOT PROVIDED'",
    "languagesUsed": ["lang1", "lang2"]
  },
  "githubAnalysisSummary": "Narrative explanation of repository quality, ownership patterns, engineering consistency, and technology evidence.",
  "riskIndicators": ["risk1", "risk2"],
  "certificateVerificationDashboard": "Explanation of whether the certificate appears legitimate, metadata appears suspicious, modifications detected, etc. (leave empty if no certificates).",
  "finalHiringRecommendation": "Concise conclusion regarding overall credibility, strength of evidence, and trust score interpretation."
}
Do not include any other text outside the JSON.
`;

    const buildReportPrompt = (ultraCompact: boolean) => {
      const compactPayload = {
        jobId: data.jobId,
        candidate: data.candidate
          ? {
              firstName: data.candidate.firstName,
              lastName: data.candidate.lastName,
              email: data.candidate.email,
              githubUrl: data.candidate.githubUrl,
            }
          : {},
        report: data.report
          ? {
              trustScore: data.report.trustScore,
              findingsSummary: data.report.findingsSummary,
              contradictions: data.report.contradictions,
              riskIndicatorsJson: data.report.riskIndicatorsJson,
              semanticMatchJson: data.report.semanticMatchJson,
            }
          : {},
        githubMetrics: compactGithubMetrics(data.githubMetrics, ultraCompact),
        certificateData: data.certificateData,
      };
      return `CANDIDATE DATA:\n${JSON.stringify(compactPayload)}`;
    };

    const resultString = await this.callWithRetry(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: buildReportPrompt(false) },
      ],
      () => buildReportPrompt(true)
    );

    return JSON.parse(resultString);
  }
}
