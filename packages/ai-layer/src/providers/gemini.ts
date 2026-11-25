/**
 * @file gemini.ts
 * @package @verisphere/ai-layer
 * @purpose High-throughput Google Generative AI (Gemini 3.x Flash) provider for Dual-Provider AI Pool.
 *          Activated automatically whenever GEMINI_API_KEY is configured in .env.
 *          Includes an automatic model fallback chain so deprecated (404) or busy (503/429) models
 *          transparently fail over to the fastest healthy Gemini Flash model.
 */

import { GoogleGenerativeAI } from "@google/generative-ai";
import { AuditReport } from "@verisphere/shared-types";

const DEFAULT_GEMINI_MODELS = [
  "gemini-3.1-flash-lite",
  "gemini-3.5-flash",
  "gemini-3.5-flash-lite",
  "gemini-3.8-flash",
];

function compactResumeText(raw: string, maxChars: number): string {
  const normalized = (raw || "")
    .replace(/\r/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (normalized.length <= maxChars) return normalized;
  return normalized.slice(0, maxChars) + "\n...[truncated]";
}

function compactGithubForGemini(metrics: any): any {
  if (!metrics || typeof metrics !== "object") return metrics;
  const repos = Array.isArray(metrics.analyzedRepos) ? metrics.analyzedRepos : [];
  return {
    user: metrics.githubUsername,
    reposCount: metrics.publicReposCount ?? repos.length,
    ageMonths: metrics.accountAgeMonths,
    totalCommits: metrics.totalCommitsCollected ?? 0,
    verifiedSkills: Array.isArray(metrics.verifiedSkills) ? metrics.verifiedSkills : [],
    verifiedLanguages: Array.isArray(metrics.verifiedLanguages) ? metrics.verifiedLanguages : [],
    langDist: metrics.languageDistribution || {},
    hasTimelineGaps: Boolean(metrics.hasTimelineGaps),
    alerts: Array.isArray(metrics.timelineAnomalyAlerts)
      ? Array.from(new Set(metrics.timelineAnomalyAlerts)).slice(0, 10)
      : [],
    repos: repos.map((r: any) => ({
      name: r.name,
      lang: r.language || "Unknown",
      commits: r.commits || 0,
      tech: Array.isArray(r.technologies) ? r.technologies : [],
      msgs: Array.isArray(r.recentCommits)
        ? r.recentCommits.slice(0, 2).map((m: string) => String(m).slice(0, 60))
        : [],
    })),
  };
}

function parseJsonResponse(text: string): any {
  const cleaned = text
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();

  try {
    return JSON.parse(cleaned);
  } catch {
    // Extract first JSON object if the model wrapped it in prose
    const firstBrace = cleaned.indexOf("{");
    const lastBrace = cleaned.lastIndexOf("}");
    if (firstBrace !== -1 && lastBrace > firstBrace) {
      return JSON.parse(cleaned.slice(firstBrace, lastBrace + 1));
    }
    throw new Error("Gemini returned non-JSON output.");
  }
}

export class GeminiProvider {
  private genAI: GoogleGenerativeAI | null = null;
  private modelChain: string[];

  constructor() {
    const apiKey = process.env.GEMINI_API_KEY;
    const configured = process.env.GEMINI_MODEL?.trim();
    this.modelChain = configured
      ? [configured, ...DEFAULT_GEMINI_MODELS.filter((m) => m !== configured)]
      : [...DEFAULT_GEMINI_MODELS];

    if (apiKey && apiKey.trim().length > 10) {
      this.genAI = new GoogleGenerativeAI(apiKey.trim());
    }
  }

  public isAvailable(): boolean {
    return this.genAI !== null;
  }

  private async generateJsonWithFallback(systemPrompt: string, userPrompt: string): Promise<any> {
    if (!this.genAI) {
      throw new Error("GEMINI_API_KEY is not configured.");
    }

    let lastError: any = null;

    for (const modelName of this.modelChain) {
      try {
        const started = Date.now();
        console.log(`[Gemini AI] Sending request to ${modelName}...`);

        const model = this.genAI.getGenerativeModel({
          model: modelName,
          systemInstruction: systemPrompt,
          generationConfig: {
            temperature: 0.1,
            responseMimeType: "application/json",
          },
        });

        const result = await model.generateContent(userPrompt);
        const text = result.response.text();
        if (!text) {
          throw new Error(`Gemini (${modelName}) returned an empty response.`);
        }

        const parsed = parseJsonResponse(text);
        console.log(`[Gemini AI] ✅ ${modelName} completed in ${Date.now() - started}ms`);
        return parsed;
      } catch (err: any) {
        lastError = err;
        const status = err?.status;
        const msg = String(err?.message || err);
        const isRetryableModelErr =
          status === 404 ||
          status === 429 ||
          status === 503 ||
          status === 500 ||
          /404|429|503|UNAVAILABLE|not found|high demand|overloaded/i.test(msg);

        console.warn(
          `[Gemini AI] Model ${modelName} failed (${status || msg.slice(0, 90)})${
            isRetryableModelErr ? " — trying next Gemini model..." : ""
          }`
        );

        if (!isRetryableModelErr) {
          throw err;
        }
      }
    }

    throw lastError || new Error("All Gemini models failed.");
  }

  public async analyzeCandidate(
    resumeText: string,
    githubMetrics: any,
    systemPrompt: string
  ): Promise<Partial<AuditReport>> {
    const userPrompt = `RESUME:\n${compactResumeText(resumeText, 8000)}\n\nGITHUB:\n${JSON.stringify(
      compactGithubForGemini(githubMetrics)
    )}`;

    return (await this.generateJsonWithFallback(systemPrompt, userPrompt)) as Partial<AuditReport>;
  }

  public async generateProfessionalReport(data: any): Promise<any> {
    const systemPrompt = `You are an expert technical recruiter and auditor. Generate a concise structured JSON report for a Handlebars PDF template with keys: executiveSummary, resumeVerificationDashboard { claimedSkillsCount, verifiedSkillsCount, unverifiedSkillsCount, falselyClaimedSkills, verificationCoverage }, githubVerificationDashboard { repositoryCount, verifiedTechnologies, ownershipScore, activityScore, certificateStatus, languagesUsed }, githubAnalysisSummary, riskIndicators, certificateVerificationDashboard, finalHiringRecommendation.`;

    return await this.generateJsonWithFallback(
      systemPrompt,
      `CANDIDATE DATA:\n${JSON.stringify(data)}`
    );
  }
}
