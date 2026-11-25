import { GroqAIProvider } from './providers/groq';
import { GeminiProvider } from './providers/gemini';
import { MockAIProvider } from './providers/mock';
import { AuditReport } from '@verisphere/shared-types';

// Process-wide dispatch counter to balance concurrent batch traffic across Gemini & Groq
let dispatchCounter = 0;

export class AILayer {
  private groqProvider: GroqAIProvider;
  private geminiProvider: GeminiProvider;
  private mockProvider: MockAIProvider;
  private useMock: boolean;

  constructor() {
    this.useMock = process.env.MOCK_AI === 'true';
    this.groqProvider = new GroqAIProvider();
    this.geminiProvider = new GeminiProvider();
    this.mockProvider = new MockAIProvider();
  }

  private hasGroq(): boolean {
    return Boolean(process.env.GROQ_API_KEY && process.env.GROQ_API_KEY.trim().length > 5);
  }

  private hasGemini(): boolean {
    return this.geminiProvider.isAvailable();
  }

  /**
   * Zero-Wait Multi-Provider / Multi-Model AI Pool:
   * - Gemini 3.x Flash (gemini-3.1-flash-lite → gemini-3.5-flash → gemini-3.8-flash) has huge free-tier TPM
   *   and handles parallel batch calls simultaneously in ~2–5s.
   * - Groq pools 3 independent free-tier model buckets (gpt-oss-120b + qwen3.8-27b + gpt-oss-20b = 24,000 TPM).
   * - When BOTH are configured: alternates load across Groq (when a Groq bucket has 0ms immediate capacity)
   *   and Gemini, never blocking on a full Groq bucket when Gemini is ready, with automatic cross-provider failover.
   */
  public async analyzeCandidate(
    resumeText: string,
    githubMetrics: any,
    systemPrompt: string
  ): Promise<Partial<AuditReport>> {
    if (this.useMock) {
      return this.mockProvider.analyzeCandidate(resumeText, githubMetrics);
    }

    const groqReady = this.hasGroq();
    const geminiReady = this.hasGemini();

    if (!groqReady && !geminiReady) {
      throw new Error('Neither GROQ_API_KEY nor GEMINI_API_KEY is set (and MOCK_AI is not true).');
    }

    const runGroq = () => this.groqProvider.analyzeCandidate(resumeText, githubMetrics, systemPrompt);
    const runGemini = () => this.geminiProvider.analyzeCandidate(resumeText, githubMetrics, systemPrompt);

    if (groqReady && geminiReady) {
      // Balance across both providers, but never stall on Groq if its immediate buckets are busy
      const wantsGroq = dispatchCounter++ % 2 === 0;
      const useGroqFirst = wantsGroq && this.groqProvider.hasImmediateCapacity(2600);
      const primaryName = useGroqFirst ? 'Groq' : 'Gemini';
      const fallbackName = useGroqFirst ? 'Gemini' : 'Groq';

      try {
        return useGroqFirst ? await runGroq() : await runGemini();
      } catch (primaryErr: any) {
        console.warn(
          `[AILayer] ${primaryName} failed (${primaryErr?.status || primaryErr?.message}), failing over to ${fallbackName}...`
        );
        return useGroqFirst ? await runGemini() : await runGroq();
      }
    }

    if (geminiReady) {
      return runGemini();
    }

    return runGroq();
  }

  public async generateProfessionalReport(data: any): Promise<any> {
    if (this.useMock) {
      return {
        executiveSummary: 'Mock executive summary of candidate strengths.',
        resumeVerificationDashboard: {
          claimedSkillsCount: 10,
          verifiedSkillsCount: 8,
          unverifiedSkillsCount: 2,
          falselyClaimedSkills: ['React Native'],
          verificationCoverage: '80%',
        },
        githubVerificationDashboard: {
          repositoryCount: data.githubMetrics?.publicReposCount || 0,
          verifiedTechnologies: 5,
          ownershipScore: 85,
          activityScore: 90,
          certificateStatus: 'VALID',
          languagesUsed: ['TypeScript', 'JavaScript'],
        },
        githubAnalysisSummary: 'Mock summary of repository quality and ownership patterns.',
        riskIndicators: ['Timeline gap detected in 2023'],
        certificateVerificationDashboard: 'AWS Certificate is verified and valid.',
        finalHiringRecommendation: 'Strong candidate with solid verifiable evidence.',
      };
    }

    const groqReady = this.hasGroq();
    const geminiReady = this.hasGemini();

    if (!groqReady && !geminiReady) {
      throw new Error('Neither GROQ_API_KEY nor GEMINI_API_KEY is set.');
    }

    if (groqReady && geminiReady) {
      const useGroqFirst = dispatchCounter++ % 2 === 0 && this.groqProvider.hasImmediateCapacity(2200);
      try {
        return useGroqFirst
          ? await this.groqProvider.generateProfessionalReport(data)
          : await this.geminiProvider.generateProfessionalReport(data);
      } catch {
        return useGroqFirst
          ? await this.geminiProvider.generateProfessionalReport(data)
          : await this.groqProvider.generateProfessionalReport(data);
      }
    }

    if (geminiReady) {
      return this.geminiProvider.generateProfessionalReport(data);
    }

    return this.groqProvider.generateProfessionalReport(data);
  }
}

export * from './providers/groq';
export * from './providers/gemini';
export * from './providers/mock';
export * from './providers/token-bucket';
export * from './prompts/verification';
export * from './scoring/trust-calculator';
