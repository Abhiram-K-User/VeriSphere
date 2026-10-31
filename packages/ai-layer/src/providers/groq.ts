import Groq from 'groq-sdk';
import { AuditReport } from '@verisphere/shared-types';

export class GroqAIProvider {
  private groq: Groq;
  private model: string;

  constructor() {
    // Requires GROQ_API_KEY environment variable to be set
    this.groq = new Groq({
      apiKey: process.env.GROQ_API_KEY,
    });
    this.model = process.env.GROQ_MODEL || 'openai/gpt-oss-120b';
  }

  public async analyzeCandidate(resumeText: string, githubMetrics: any, systemPrompt: string): Promise<Partial<AuditReport>> {
    console.log("[Groq AI] Sending analysis request to Groq...");

    const userPrompt = `
      RESUME TEXT:
      ${resumeText}

      GITHUB METRICS:
      ${JSON.stringify(githubMetrics, null, 2)}
    `;

    try {
      const completion = await this.groq.chat.completions.create({
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        model: this.model,
        temperature: 0.1,
        response_format: { type: 'json_object' }
      });

      const resultString = completion.choices[0]?.message?.content;
      if (!resultString) {
        throw new Error("Groq returned empty response");
      }

      const parsed = JSON.parse(resultString);
      return parsed as Partial<AuditReport>;
    } catch (error) {
      console.error("[Groq AI] Error during Groq API call:", error);
      throw error;
    }
  }

  public async generateProfessionalReport(data: any): Promise<any> {
    console.log("[Groq AI] Generating professional verification report...");

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

    const userPrompt = `
      CANDIDATE DATA:
      ${JSON.stringify(data, null, 2)}
    `;

    try {
      const completion = await this.groq.chat.completions.create({
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        model: this.model,
        temperature: 0.1,
        response_format: { type: 'json_object' }
      });

      const resultString = completion.choices[0]?.message?.content;
      if (!resultString) {
        throw new Error("Groq returned empty response");
      }

      return JSON.parse(resultString);
    } catch (error) {
      console.error("[Groq AI] Error generating professional report:", error);
      throw error;
    }
  }
}
