import { AILayer, SYSTEM_PROMPT_VERIFICATION, TrustCalculator } from '@verisphere/ai-layer';
import { 
  AuditReport, 
  VerificationJob, 
  ResumeData,
  GithubProfileMetrics
} from '@verisphere/shared-types';
import { Severity, SkillSource } from '@prisma/client';
import { parsePdfBuffer, verifyAcademicProfile } from '@verisphere/forensics-engine';
import { prisma } from '../infrastructure/db/prisma-client';
import fs from 'fs';
import crypto from 'crypto';

function mapToPrismaSeverity(raw?: string): Severity {
  const upper = String(raw || 'MEDIUM').toUpperCase();
  if (upper === 'LOW') return Severity.LOW;
  if (upper === 'HIGH') return Severity.HIGH;
  if (upper === 'CRITICAL') return Severity.CRITICAL;
  return Severity.MEDIUM;
}

function inferSkillCategory(skillName: string): string {
  const s = skillName.toLowerCase();
  if (["python", "javascript", "typescript", "java", "c++", "c", "go", "rust", "solidity", "sql", "html", "css"].some(k => s === k || s.includes(k))) {
    return "Programming Language";
  }
  if (["react", "next.js", "nextjs", "express", "fastapi", "node.js", "nodejs", "tailwind", "vue", "angular", "django", "flask"].some(k => s.includes(k))) {
    return "Web Framework";
  }
  if (["postgres", "postgresql", "mongodb", "mysql", "redis", "prisma", "supabase", "sqlite", "ipfs"].some(k => s.includes(k))) {
    return "Database & Storage";
  }
  if (["machine learning", "data science", "ai", "llm", "langgraph", "langchain", "rag", "facenet", "scipy", "numpy", "pandas", "pytorch", "tensorflow"].some(k => s.includes(k))) {
    return "AI & Data Science";
  }
  if (["docker", "kubernetes", "aws", "git", "github", "linux", "ci/cd"].some(k => s.includes(k))) {
    return "DevOps & Cloud";
  }
  return "Technical Skill";
}

/**
 * Verification Pipeline Steps (sequential):
 * ──────────────────────────────────────────
 * Step 1: PARSE — Extract text from uploaded resume PDF
 * Step 2: GITHUB — Scrape live GitHub repositories for evidence
 * Step 3: AI_ANALYZE — Send resume text + GitHub metrics to AI for semantic matching
 * Step 4: ACADEMIC — Verify institution name, domain email, graduation timeline
 * Step 5: CERTIFICATES — Score certificate forensics results (from intake)
 * Step 6: TRUST_SCORE — Calculate weighted trust score from all sub-scores
 * Step 7: PERSIST — Save normalized entities + AuditReport in an atomic transaction
 */

export class VerificationOrchestrator {
  private aiLayer: AILayer;
  private trustCalculator: TrustCalculator;

  constructor() {
    this.aiLayer = new AILayer();
    this.trustCalculator = new TrustCalculator();
  }

  /**
   * STEP 6+7: Assemble the final report and persist it atomically across normalized tables.
   */
  public async executeVerification(
    job: VerificationJob, 
    resume: ResumeData, 
    githubMetrics: GithubProfileMetrics,
    certificateValidityScore: number = 100,
    institutionalEmail?: string,
    certificateAnalyses?: any[],
    riskIndicatorsFromCerts: any[] = []
  ): Promise<AuditReport> {
    
    console.log(`[Orchestrator] Starting verification for Job ID: ${job.id}`);
    
    // --- STEP 3: AI Layer Analysis ---
    console.log(`[Orchestrator] STEP 3: Calling AI Layer for semantic analysis...`);
    const aiResponse: any = await this.aiLayer.analyzeCandidate(
      resume.rawText, 
      githubMetrics, 
      SYSTEM_PROMPT_VERIFICATION
    );

    if (!aiResponse) {
      throw new Error("AI Layer returned an empty response.");
    }

    // --- STEP 4: Academic Verification ---
    console.log(`[Orchestrator] STEP 4: Running Academic Verification...`);
    const academicProfile = aiResponse.academicProfile || resume.academicProfile;
    const academicVerificationResults = verifyAcademicProfile(
      academicProfile,
      institutionalEmail
    );
    
    const academicScore = academicVerificationResults.length > 0 
      ? academicVerificationResults[0].confidenceScore * 100 
      : 50; // Default 50 if no academic data found

    // --- STEP 5: Certificate Scoring ---
    console.log(`[Orchestrator] STEP 5: Scoring certificates (${certificateAnalyses?.length || 0} provided)...`);

    // --- STEP 6: Trust Score Calculation ---
    const aiTrustScore = aiResponse.trustScore || {};
    const rawScores = {
      resumeConsistency: typeof aiTrustScore === 'object' ? (aiTrustScore.resumeConsistency ?? 70) : 70,
      githubEvidence: typeof aiTrustScore === 'object' ? (aiTrustScore.githubEvidence ?? 70) : 70,
      contributionConfidence: typeof aiTrustScore === 'object' ? (aiTrustScore.contributionConfidence ?? 70) : 70,
      activityConfidence: typeof aiTrustScore === 'object' ? (aiTrustScore.activityConfidence ?? 70) : 70,
      academicScore: academicScore,
      certificateValidity: certificateValidityScore
    };

    console.log(`[Orchestrator] STEP 6: Calculating final trust score...`);
    const finalTrustScore = this.trustCalculator.calculateOverallScore(rawScores);
    
    const trustScoreValue = finalTrustScore.overallScore > 0 
      ? finalTrustScore.overallScore 
      : (typeof aiTrustScore === 'object' ? (aiTrustScore.overallScore ?? 70) : 70);

    // Merge and normalize certificate, AI, and academic risk indicators
    const rawRiskIndicators = [
      ...(Array.isArray(aiResponse.riskIndicators) ? aiResponse.riskIndicators : []),
      ...(Array.isArray(riskIndicatorsFromCerts) ? riskIndicatorsFromCerts : [])
    ];

    if (academicVerificationResults.length > 0) {
      const acadResult = academicVerificationResults[0];
      acadResult.riskFlags.forEach((flag: string) => {
        rawRiskIndicators.push({
          type: 'ACADEMIC_RISK',
          description: flag,
          level: 'MEDIUM'
        });
      });
    }

    const allRiskIndicators = rawRiskIndicators.map((r: any) => {
      const sev = mapToPrismaSeverity(r?.severity || r?.level);
      return {
        type: String(r?.category || r?.type || 'GENERAL_ANOMALY'),
        level: sev,
        severity: sev,
        description: String(r?.description || 'Risk flag detected'),
        evidence: r?.evidence ? String(r.evidence) : ''
      };
    });

    const roundedTrustScore = Math.max(0, Math.min(100, Math.round(trustScoreValue)));
    const normalizedContradictions: string[] = (Array.isArray(aiResponse.contradictions) ? aiResponse.contradictions : [])
      .map((c: any) => (typeof c === 'string' ? c.trim() : JSON.stringify(c)))
      .filter((c: string) => c.length > 0);

    // Assemble final report
    const finalReport: AuditReport = {
      id: `rep_${Date.now()}`,
      jobId: job.id,
      createdAt: new Date(),
      findingsSummary: String(aiResponse.findingsSummary || "No summary provided."),
      semanticMatchJson: JSON.stringify(aiResponse.semanticMatches || []),
      academicVerificationJson: JSON.stringify(academicVerificationResults),
      contradictions: normalizedContradictions,
      riskIndicatorsJson: JSON.stringify(allRiskIndicators),
      trustScore: roundedTrustScore
    };

    // --- STEP 7: Persist to Normalized Database in a Single Transaction ---
    try {
      console.log(`[Orchestrator] STEP 7: Saving normalized entities and AuditReport in transaction...`);

      await prisma.$transaction(async (tx) => {
        // 7a. Find previous report hash for tamper-evident hash chain
        const previousReport = await tx.auditReport.findFirst({
          where: { job: { candidateId: job.candidateId } },
          orderBy: { createdAt: 'desc' },
          select: { hash: true }
        });
        const prevHash = previousReport?.hash || null;
        const canonicalPayload = JSON.stringify({
          prevHash,
          jobId: finalReport.jobId,
          trustScore: roundedTrustScore,
          findingsSummary: finalReport.findingsSummary
        });
        const reportHash = crypto.createHash('sha256').update(canonicalPayload).digest('hex');

        // 7b. Create AuditReport + RiskIndicator[] + Contradiction[]
        const createdReport = await tx.auditReport.create({
          data: {
            jobId: finalReport.jobId,
            findingsSummary: finalReport.findingsSummary,
            semanticMatchJson: finalReport.semanticMatchJson,
            academicVerificationJson: finalReport.academicVerificationJson,
            contradictions: finalReport.contradictions,
            trustScore: roundedTrustScore,
            riskIndicatorsJson: finalReport.riskIndicatorsJson,
            prevHash,
            hash: reportHash,
            riskIndicators: {
              create: allRiskIndicators.map((r: any) => ({
                type: String(r.category || r.type || 'GENERAL_ANOMALY'),
                severity: mapToPrismaSeverity(r.severity || r.level),
                description: String(r.description || 'Risk flag detected'),
                evidenceRef: r.evidence ? String(r.evidence) : null
              }))
            },
            contradictionItems: {
              create: normalizedContradictions.map((desc: string) => ({ description: desc }))
            }
          }
        });

        // 7c. Link Institution & Upsert Education if academic profile extracted
        let institutionId: string | null = null;
        if (institutionalEmail && institutionalEmail.includes('@')) {
          const domain = institutionalEmail.split('@')[1].toLowerCase().trim();
          const inst = await tx.institution.findUnique({ where: { emailDomain: domain } });
          if (inst) institutionId = inst.id;
        }
        if (!institutionId && academicVerificationResults.length > 0 && academicVerificationResults[0].normalizedInstitution) {
          const instByName = await tx.institution.findFirst({
            where: { name: { equals: academicVerificationResults[0].normalizedInstitution, mode: 'insensitive' } }
          });
          if (instByName) institutionId = instByName.id;
        }
        if (institutionId) {
          await tx.candidate.update({
            where: { id: job.candidateId },
            data: { institutionId }
          });
        }

        if (academicProfile && (academicProfile.degreeName || academicProfile.institutionName)) {
          const degreeName = (academicProfile.degreeName || 'Bachelor of Engineering').trim();
          const startYear = academicProfile.enrollmentYear ? parseInt(String(academicProfile.enrollmentYear), 10) : null;
          const endYear = academicProfile.graduationYear ? parseInt(String(academicProfile.graduationYear), 10) : null;
          const validStart = startYear && !isNaN(startYear) ? startYear : null;
          const validEnd = endYear && !isNaN(endYear) && (!validStart || endYear >= validStart) ? endYear : null;
          let cgpaVal: number | null = null;
          if (academicProfile.cgpaOrPercentage) {
            const parsedCgpa = parseFloat(String(academicProfile.cgpaOrPercentage));
            if (!isNaN(parsedCgpa) && parsedCgpa >= 0 && parsedCgpa <= 10) {
              cgpaVal = parsedCgpa;
            }
          }

          const existingEdu = await tx.education.findFirst({
            where: { candidateId: job.candidateId, degree: degreeName }
          });

          if (existingEdu) {
            const mergedStart = validStart ?? existingEdu.startYear;
            let mergedEnd = validEnd ?? existingEdu.endYear;
            if (mergedStart !== null && mergedEnd !== null && mergedEnd < mergedStart) {
              mergedEnd = validEnd;
            }
            await tx.education.update({
              where: { id: existingEdu.id },
              data: {
                institutionId: institutionId || existingEdu.institutionId,
                cgpa: cgpaVal !== null ? cgpaVal : existingEdu.cgpa,
                startYear: mergedStart,
                endYear: mergedEnd
              }
            });
          } else {
            await tx.education.create({
              data: {
                candidateId: job.candidateId,
                institutionId,
                degree: degreeName,
                cgpa: cgpaVal,
                startYear: validStart,
                endYear: validEnd
              }
            });
          }
        }

        // 7d. Persist Certificates (batched)
        if (Array.isArray(certificateAnalyses) && certificateAnalyses.length > 0) {
          const certRows = certificateAnalyses.map((cert: any) => {
            const issuer = cert.metadata?.author || cert.metadata?.creator || cert.metadata?.producer || cert.issuer || 'Technical Certification';
            const issuedDate = cert.metadata?.creationDate ? new Date(cert.metadata.creationDate) : new Date();
            return {
              candidateId: job.candidateId,
              jobId: job.id,
              issuer: String(issuer).slice(0, 120),
              credentialId: cert.sha256 ? String(cert.sha256).slice(0, 32) : null,
              issuedOn: isNaN(issuedDate.getTime()) ? new Date() : issuedDate,
              verified: typeof cert.trustScore === 'number' ? cert.trustScore >= 70 : true
            };
          });
          await tx.certificate.createMany({ data: certRows });
        }

        // 7e. Persist GithubProfile & Repositories (batched)
        if (githubMetrics && githubMetrics.githubUsername && githubMetrics.githubUsername !== 'unknown') {
          const ghProfile = await tx.githubProfile.upsert({
            where: { candidateId: job.candidateId },
            update: {
              username: githubMetrics.githubUsername,
              publicRepos: githubMetrics.publicReposCount || 0,
              followers: githubMetrics.followersCount || 0,
              fetchedAt: new Date()
            },
            create: {
              candidateId: job.candidateId,
              username: githubMetrics.githubUsername,
              publicRepos: githubMetrics.publicReposCount || 0,
              followers: githubMetrics.followersCount || 0,
              fetchedAt: new Date()
            }
          });

          await tx.repository.deleteMany({ where: { profileId: ghProfile.id } });
          if (Array.isArray(githubMetrics.analyzedRepos) && githubMetrics.analyzedRepos.length > 0) {
            await tx.repository.createMany({
              data: githubMetrics.analyzedRepos.map((r: any) => ({
                profileId: ghProfile.id,
                name: String(r.name || 'repo'),
                primaryLanguage: r.language ? String(r.language) : 'Unknown',
                commitCount: typeof r.commits === 'number' ? r.commits : 0,
                lastPushedAt: new Date()
              }))
            });
          }
        }

        // 7f. Batch-persist Skills & CandidateSkills (both RESUME and GITHUB sources)
        const skillMap = new Map<string, { name: string; source: SkillSource; proficiency: number }>();

        const matches = Array.isArray(aiResponse.semanticMatches) ? aiResponse.semanticMatches : [];
        for (const m of matches) {
          const skillName = String(m.claimedSkill || '').trim();
          if (!skillName) continue;
          const conf = typeof m.confidenceScore === 'number' ? m.confidenceScore : 0.7;
          const prof = Math.max(1, Math.min(5, Math.round(conf * 5)));
          const key = `${skillName}::RESUME`;
          const existing = skillMap.get(key);
          if (!existing || existing.proficiency < prof) {
            skillMap.set(key, { name: skillName, source: SkillSource.RESUME, proficiency: prof });
          }
        }

        if (Array.isArray(resume.skills)) {
          for (const rawSkill of resume.skills) {
            const skillName = String(rawSkill || '').trim();
            if (!skillName) continue;
            const key = `${skillName}::GITHUB`;
            if (!skillMap.has(key)) {
              skillMap.set(key, { name: skillName, source: SkillSource.GITHUB, proficiency: 4 });
            }
          }
        }

        if (skillMap.size > 0) {
          const uniqueSkillNames = Array.from(new Set(Array.from(skillMap.values()).map(s => s.name)));
          await tx.skill.createMany({
            data: uniqueSkillNames.map(name => ({ name, category: inferSkillCategory(name) })),
            skipDuplicates: true
          });

          const dbSkills = await tx.skill.findMany({
            where: { name: { in: uniqueSkillNames } },
            select: { id: true, name: true }
          });
          const nameToSkillId = new Map<string, string>(dbSkills.map(s => [s.name, s.id]));

          const candidateSkillEntries = Array.from(skillMap.values())
            .map(entry => {
              const skillId = nameToSkillId.get(entry.name);
              if (!skillId) return null;
              return {
                candidateId: job.candidateId,
                skillId,
                source: entry.source,
                proficiency: entry.proficiency
              };
            })
            .filter((x): x is { candidateId: string; skillId: string; source: SkillSource; proficiency: number } => x !== null);

          if (candidateSkillEntries.length > 0) {
            await tx.candidateSkill.deleteMany({
              where: {
                candidateId: job.candidateId,
                skillId: { in: Array.from(nameToSkillId.values()) }
              }
            });
            await tx.candidateSkill.createMany({
              data: candidateSkillEntries,
              skipDuplicates: true
            });
          }
        }

        // 7g. Update VerificationJob status to COMPLETED
        await tx.verificationJob.update({
          where: { id: job.id },
          data: {
            status: 'COMPLETED',
            completedAt: new Date(),
            githubMetricsJson: JSON.stringify(githubMetrics),
            resumeDataJson: JSON.stringify(resume),
            certificateDataJson: certificateAnalyses ? JSON.stringify(certificateAnalyses) : undefined
          }
        });

        finalReport.id = createdReport.id;
      }, { maxWait: 15000, timeout: 45000 });

      // Refresh materialized view non-blockingly
      prisma.$executeRawUnsafe(`REFRESH MATERIALIZED VIEW mv_recruiter_dashboard;`).catch(err => {
        console.warn('[Orchestrator] Failed to refresh mv_recruiter_dashboard:', err?.message || err);
      });
      
      console.log(`[Orchestrator] ✅ Verification complete. Final Score: ${roundedTrustScore}`);
    } catch (dbError: any) {
      console.warn(`[Orchestrator] Failed to save to database:`, dbError.message);
      throw dbError;
    }
    
    return finalReport;
  }

  /**
   * Triggers the full verification pipeline asynchronously.
   */
  public async triggerVerification(
    jobId: string, 
    candidateId: string, 
    resumeFileUrl?: string,
    certificateAnalyses?: any[],
    resumeBuffer?: Buffer
  ): Promise<void> {
    (async () => {
      try {
        console.log(`[Orchestrator] ═══════════════════════════════════════`);
        console.log(`[Orchestrator] Starting pipeline for Job ${jobId}`);
        console.log(`[Orchestrator] ═══════════════════════════════════════`);
        
        await prisma.verificationJob.update({
          where: { id: jobId },
          data: { status: "ANALYZING" }
        });

        const candidateRecord = await prisma.candidate.findUnique({
          where: { id: candidateId }
        });
        
        if (!candidateRecord) {
          throw new Error(`Candidate ${candidateId} not found`);
        }

        const job: VerificationJob = {
          id: jobId,
          candidateId,
          status: "ANALYZING" as any,
          startedAt: new Date(),
          createdAt: new Date()
        };

        // --- STEP 1: Parse Resume PDF ---
        let rawText = `${candidateRecord.firstName} ${candidateRecord.lastName} - Candidate Profile.`;
        
        if (resumeBuffer) {
          console.log(`[Orchestrator] STEP 1: Parsing uploaded PDF resume from memory buffer.`);
          const parsedPdf = await parsePdfBuffer(resumeBuffer);
          rawText = parsedPdf.rawText;
        } else if (resumeFileUrl && fs.existsSync(resumeFileUrl)) {
          console.log(`[Orchestrator] STEP 1: Parsing uploaded PDF resume: ${resumeFileUrl}`);
          const pdfBuffer = fs.readFileSync(resumeFileUrl);
          const parsedPdf = await parsePdfBuffer(pdfBuffer);
          rawText = parsedPdf.rawText;
        } else {
          console.log(`[Orchestrator] STEP 1: No PDF file found, using candidate name as context.`);
        }

        const resume: ResumeData = {
          id: `res_${Date.now()}`,
          candidateId,
          fileUrl: resumeFileUrl || "",
          rawText,
          skills: [],
          education: [],
          experience: [],
          projects: []
        };

        // --- STEP 2: Fetch GitHub Evidence ---
        let githubMetrics: GithubProfileMetrics = {
          id: `git_${Date.now()}`,
          candidateId,
          githubUsername: "unknown",
          publicReposCount: 0,
          followersCount: 0,
          followingCount: 0,
          accountAgeMonths: 0,
          totalCommitsCollected: 0,
          analyzedRepos: [],
          timelineAnomalyAlerts: [],
          hasTimelineGaps: false
        };

        if (candidateRecord.githubUrl) {
          try {
            console.log(`[Orchestrator] STEP 2: Fetching live GitHub evidence for ${candidateRecord.githubUrl}`);
            const { scrapeGithubEvidence } = await import('@verisphere/github-engine');
            const githubEvidenceReport = await scrapeGithubEvidence(candidateRecord.githubUrl);
            
            githubMetrics = {
              id: `git_${Date.now()}`,
              candidateId,
              githubUsername: githubEvidenceReport.username,
              publicReposCount: githubEvidenceReport.repositories.length,
              followersCount: 0,
              followingCount: 0,
              accountAgeMonths: 12,
              totalCommitsCollected: githubEvidenceReport.repoEvidence.reduce((acc, r) => acc + r.totalCommits, 0),
              analyzedRepos: githubEvidenceReport.repoEvidence.map(r => ({
                name: r.repoName,
                language: r.primaryLanguage,
                commits: r.totalCommits,
                stars: 0,
                recentCommits: r.recentCommits
              })),
              timelineAnomalyAlerts: githubEvidenceReport.timelineFlags.map(f => f.type),
              hasTimelineGaps: githubEvidenceReport.timelineFlags.length > 0
            };
            
            resume.skills = githubEvidenceReport.verifiedSkills;
          } catch (githubErr) {
            console.error(`[Orchestrator] STEP 2: GitHub scraping failed:`, githubErr);
          }
        } else {
          console.log(`[Orchestrator] STEP 2: No GitHub URL provided, skipping.`);
        }

        // --- STEP 5: Certificate scoring ---
        let certificateValidityScore = 100;
        let riskIndicatorsFromCerts: any[] = [];
        
        if (certificateAnalyses && certificateAnalyses.length > 0) {
          console.log(`[Orchestrator] STEP 5: Processing ${certificateAnalyses.length} certificate analyses...`);
          const totalScore = certificateAnalyses.reduce((acc, analysis) => acc + (analysis.trustScore || 0), 0);
          certificateValidityScore = Math.round(totalScore / certificateAnalyses.length);
          
          certificateAnalyses.forEach(analysis => {
            if (analysis.findings) {
              analysis.findings.forEach((f: any) => {
                if (f.isAnomaly || f.severity === 'HIGH' || f.severity === 'CRITICAL') {
                  riskIndicatorsFromCerts.push({
                    type: 'CERTIFICATE_ANOMALY',
                    description: f.description,
                    level: f.severity
                  });
                }
              });
            }
          });
        }

        // Execute steps 3-7
        await this.executeVerification(
          job, 
          resume, 
          githubMetrics, 
          certificateValidityScore,
          candidateRecord.institutionalEmail || undefined,
          certificateAnalyses,
          riskIndicatorsFromCerts
        );
      } catch (error: any) {
        console.error(`[Orchestrator] ❌ Pipeline failed for Job ${jobId}:`, error);
        try {
          await prisma.verificationJob.update({
            where: { id: jobId },
            data: { 
              status: "FAILED",
              errorMsg: error instanceof Error ? error.message : String(error),
              completedAt: new Date()
            }
          });
        } catch(e) {
          console.error(`[Orchestrator] Could not update job to FAILED status:`, e);
        }
      }
    })();
  }
}
