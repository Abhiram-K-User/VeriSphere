/**
 * @file gemini.ts
 * @package @verisphere/ai-layer
 * @purpose Real Google Generative AI (Gemini 2.0 Flash) provider for Dual-Provider AI Pool.
 *          Activated automatically whenever GEMINI_API_KEY is configured in .env.
 */

import { GoogleGenerativeAI } from "@google/generative-ai";
import { AuditReport } from "@verisphere/shared-types";

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

export class GeminiProvider {
  private genAI: GoogleGenerativeAI | null = null;
  private modelName: string;

  constructor() {
    const apiKey = process.env.GEMINI_API_KEY;
    this.modelName = process.env.GEMINI_MODEL || "gemini-2.0-flash";
    if (apiKey && apiKey.trim().length > 10) {
      this.genAI = new GoogleGenerativeAI(apiKey.trim());
    }
  }

  public isAvailable(): boolean {
    return this.genAI !== null;
  }

  public async analyzeCandidate(
    resumeText: string,
    githubMetrics: any,
    systemPrompt: string
  ): Promise<Partial<AuditReport>> {
    if (!this.genAI) {
      throw new Error("GEMINI_API_KEY is not configured.");
    }

    console.log(`[Gemini AI] Sending analysis request to ${this.modelName}...`);

    const model = this.genAI.getGenerativeModel({
      model: this.modelName,
      systemInstruction: systemPrompt,
      generationConfig: {
        temperature: 0.1,
        responseMimeType: "application/json",
      },
    });

    const userPrompt = `RESUME:\n${compactResumeText(resumeText, 8000)}\n\nGITHUB:\n${JSON.stringify(
      compactGithubForGemini(githubMetrics)
    )}`;

    const result = await model.generateContent(userPrompt);
    const text = result.response.text();
    if (!text) {
      throw new Error("Gemini returned an empty response.");
    }

    const cleaned = text.replace(/^```json\s*/i, "").replace(/```$/i, "").trim();
    return JSON.parse(cleaned) as Partial<AuditReport>;
  }

  public async generateProfessionalReport(data: any): Promise<any> {
    if (!this.genAI) {
      throw new Error("GEMINI_API_KEY is not configured.");
    }

    console.log(`[Gemini AI] Generating professional verification report via ${this.modelName}...`);

    const systemPrompt = `You are an expert technical recruiter and auditor. Generate a concise structured JSON report for a Handlebars PDF template with keys: executiveSummary, resumeVerificationDashboard { claimedSkillsCount, verifiedSkillsCount, unverifiedSkillsCount, falselyClaimedSkills, verificationCoverage }, githubVerificationDashboard { repositoryCount, verifiedTechnologies, ownershipScore, activityScore, certificateStatus, languagesUsed }, githubAnalysisSummary, riskIndicators, certificateVerificationDashboard, finalHiringRecommendation.`;

    const model = this.genAI.getGenerativeModel({
      model: this.modelName,
      systemInstruction: systemPrompt,
      generationConfig: {
        temperature: 0.1,
        responseMimeType: "application/json",
      },
    });

    const result = await model.generateContent(`CANDIDATE DATA:\n${JSON.stringify(data)}`);
    const text = result.response.text();
    const cleaned = text.replace(/^```json\s*/i, "").replace(/```$/i, "").trim();
    return JSON.parse(cleaned);
  }
}
