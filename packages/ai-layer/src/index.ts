import { GroqAIProvider } from './providers/groq';
import { GeminiProvider } from './providers/gemini';
import { MockAIProvider } from './providers/mock';
import { TokenBucketLimiter } from './providers/token-bucket';
import { AuditReport } from '@verisphere/shared-types';

// Shared process-wide Groq TPM token-bucket pacer & dual-provider round-robin counter
const groqLimiter = new TokenBucketLimiter(7200);
let roundRobinCounter = 0;

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
   * Dual-Provider AI Pool with Token-Bucket Pacing & Automatic Cross-Provider Failover:
   * - When BOTH GROQ_API_KEY and GEMINI_API_KEY are set: load-balances alternating requests
   *   across Groq & Gemini concurrently, with instant failover if either hits rate limits.
   * - When only GROQ_API_KEY is set: paces requests via TokenBucketLimiter (7,200 TPM) to
   *   prevent concurrent batch jobs from colliding on Groq's 8,000 TPM limit.
   * - When only GEMINI_API_KEY is set: routes directly to Gemini.
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

    const runGroq = async () => {
      const est = groqLimiter.estimateTokens(
        `${systemPrompt}\n${resumeText}\n${JSON.stringify(githubMetrics || {})}`
      );
      await groqLimiter.acquire(Math.min(est, 3200));
      return this.groqProvider.analyzeCandidate(resumeText, githubMetrics, systemPrompt);
    };

    const runGemini = async () => {
      return this.geminiProvider.analyzeCandidate(resumeText, githubMetrics, systemPrompt);
    };

    // Dual-provider load balancing + automatic failover
    if (groqReady && geminiReady) {
      const useGeminiFirst = roundRobinCounter++ % 2 === 1;
      const primaryName = useGeminiFirst ? 'Gemini' : 'Groq';
      const fallbackName = useGeminiFirst ? 'Groq' : 'Gemini';

      try {
        return useGeminiFirst ? await runGemini() : await runGroq();
      } catch (primaryErr: any) {
        console.warn(
          `[AILayer] ${primaryName} failed (${primaryErr?.status || primaryErr?.message}), failing over to ${fallbackName}...`
        );
        return useGeminiFirst ? await runGroq() : await runGemini();
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
      const useGeminiFirst = roundRobinCounter++ % 2 === 1;
      try {
        return useGeminiFirst
          ? await this.geminiProvider.generateProfessionalReport(data)
          : await this.groqProvider.generateProfessionalReport(data);
      } catch {
        return useGeminiFirst
          ? await this.groqProvider.generateProfessionalReport(data)
          : await this.geminiProvider.generateProfessionalReport(data);
      }
    }

    if (geminiReady) {
      return this.geminiProvider.generateProfessionalReport(data);
    }

    await groqLimiter.acquire(2200);
    return this.groqProvider.generateProfessionalReport(data);
  }
}

export * from './providers/groq';
export * from './providers/gemini';
export * from './providers/mock';
export * from './providers/token-bucket';
export * from './prompts/verification';
export * from './scoring/trust-calculator';
