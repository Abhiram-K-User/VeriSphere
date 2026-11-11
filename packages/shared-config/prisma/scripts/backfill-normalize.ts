import { PrismaClient, Severity, SkillSource, Role } from '@prisma/client';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });

const prisma = new PrismaClient();

const INSTITUTIONS_SEED = [
  { name: "R V College of Engineering", emailDomain: "rvce.edu.in", accredited: true, country: "India" },
  { name: "Visvesvaraya Technological University", emailDomain: "vtu.ac.in", accredited: true, country: "India" },
  { name: "Indian Institute of Technology Bombay", emailDomain: "iitb.ac.in", accredited: true, country: "India" },
  { name: "Indian Institute of Technology Delhi", emailDomain: "iitd.ac.in", accredited: true, country: "India" },
  { name: "Indian Institute of Technology Madras", emailDomain: "iitm.ac.in", accredited: true, country: "India" },
  { name: "Indian Institute of Technology Kanpur", emailDomain: "iitk.ac.in", accredited: true, country: "India" },
  { name: "Indian Institute of Technology Kharagpur", emailDomain: "iitkgp.ac.in", accredited: true, country: "India" },
  { name: "Indian Institute of Technology Roorkee", emailDomain: "iitr.ac.in", accredited: true, country: "India" },
  { name: "Indian Institute of Technology Hyderabad", emailDomain: "iith.ac.in", accredited: true, country: "India" },
  { name: "Birla Institute of Technology and Science", emailDomain: "bits-pilani.ac.in", accredited: true, country: "India" },
  { name: "National Institute of Technology Karnataka", emailDomain: "nitk.ac.in", accredited: true, country: "India" },
  { name: "National Institute of Technology Trichy", emailDomain: "nitt.edu", accredited: true, country: "India" },
  { name: "National Institute of Technology Warangal", emailDomain: "nitw.ac.in", accredited: true, country: "India" },
  { name: "Delhi Technological University", emailDomain: "dtu.ac.in", accredited: true, country: "India" },
  { name: "Anna University", emailDomain: "annauniv.edu", accredited: true, country: "India" },
  { name: "PES University", emailDomain: "pes.edu", accredited: true, country: "India" },
  { name: "MS Ramaiah Institute of Technology", emailDomain: "msrit.edu", accredited: true, country: "India" },
  { name: "BMS College of Engineering", emailDomain: "bmsce.ac.in", accredited: true, country: "India" },
  { name: "Manipal Institute of Technology", emailDomain: "manipal.edu", accredited: true, country: "India" },
  { name: "SRM Institute of Science and Technology", emailDomain: "srmist.edu.in", accredited: true, country: "India" },
  { name: "Vellore Institute of Technology", emailDomain: "vit.ac.in", accredited: true, country: "India" },
  { name: "Massachusetts Institute of Technology", emailDomain: "mit.edu", accredited: true, country: "USA" },
  { name: "Stanford University", emailDomain: "stanford.edu", accredited: true, country: "USA" },
  { name: "Harvard University", emailDomain: "harvard.edu", accredited: true, country: "USA" },
  { name: "Carnegie Mellon University", emailDomain: "cmu.edu", accredited: true, country: "USA" },
  { name: "University of California, Berkeley", emailDomain: "berkeley.edu", accredited: true, country: "USA" },
  { name: "Georgia Institute of Technology", emailDomain: "gatech.edu", accredited: true, country: "USA" },
  { name: "University of Oxford", emailDomain: "ox.ac.uk", accredited: true, country: "UK" },
  { name: "University of Cambridge", emailDomain: "cam.ac.uk", accredited: true, country: "UK" },
  { name: "Imperial College London", emailDomain: "imperial.ac.uk", accredited: true, country: "UK" }
];

function inferSkillCategory(skillName: string): string {
  const s = skillName.toLowerCase();
  if (["python", "javascript", "typescript", "java", "c++", "c", "go", "rust", "solidity", "sql", "html", "css"].some(k => s.includes(k))) {
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
  return "Software Engineering";
}

function normalizeSeverity(raw?: string): Severity {
  const upper = (raw || "MEDIUM").toUpperCase();
  if (upper === "LOW") return Severity.LOW;
  if (upper === "HIGH") return Severity.HIGH;
  if (upper === "CRITICAL") return Severity.CRITICAL;
  return Severity.MEDIUM;
}

export async function runBackfill() {
  console.log("=== Phase 1 & 2: Backfilling Normalized Relational Schema ===");

  // 1. Seed Institutions
  console.log("1. Seeding Institution table...");
  const domainToInstitutionId: Record<string, string> = {};
  const nameToInstitutionId: Record<string, string> = {};

  for (const inst of INSTITUTIONS_SEED) {
    const record = await prisma.institution.upsert({
      where: { emailDomain: inst.emailDomain },
      update: { name: inst.name, accredited: inst.accredited, country: inst.country },
      create: inst
    });
    domainToInstitutionId[inst.emailDomain.toLowerCase()] = record.id;
    nameToInstitutionId[inst.name.toLowerCase()] = record.id;
  }
  console.log(`   Seeded ${Object.keys(domainToInstitutionId).length} institutions.`);

  // 2. Seed AppUser accounts
  console.log("2. Seeding AppUser accounts...");
  const defaultUsers = [
    { email: "admin@verisphere.ai", role: Role.ADMIN, passwordHash: crypto.createHash("sha256").update("password").digest("hex") },
    { email: "recruiter@verisphere.ai", role: Role.RECRUITER, passwordHash: crypto.createHash("sha256").update("recruiter123").digest("hex") },
    { email: "viewer@verisphere.ai", role: Role.VIEWER, passwordHash: crypto.createHash("sha256").update("viewer123").digest("hex") }
  ];
  for (const u of defaultUsers) {
    await prisma.appUser.upsert({
      where: { email: u.email },
      update: { role: u.role },
      create: u
    });
  }

  // 3. Process Candidates & Link Institutions
  console.log("3. Linking Candidates to Institutions...");
  const candidates = await prisma.candidate.findMany({
    include: {
      jobs: {
        include: { report: true },
        orderBy: { startedAt: 'asc' }
      }
    }
  });

  for (const candidate of candidates) {
    let matchedInstId = candidate.institutionId;

    if (!matchedInstId && candidate.institutionalEmail) {
      const domain = candidate.institutionalEmail.split("@")[1]?.toLowerCase()?.trim();
      if (domain && domainToInstitutionId[domain]) {
        matchedInstId = domainToInstitutionId[domain];
      }
    }

    // Check academicVerificationJson across candidate's jobs
    let extractedAcad: any = null;
    for (const job of candidate.jobs) {
      if (job.report?.academicVerificationJson) {
        try {
          const parsed = JSON.parse(job.report.academicVerificationJson);
          if (Array.isArray(parsed) && parsed.length > 0) {
            extractedAcad = parsed[0];
            if (!matchedInstId && extractedAcad.normalizedInstitution) {
              const normLower = extractedAcad.normalizedInstitution.toLowerCase();
              if (nameToInstitutionId[normLower]) {
                matchedInstId = nameToInstitutionId[normLower];
              }
            }
          }
        } catch {}
      }
    }

    if (matchedInstId && matchedInstId !== candidate.institutionId) {
      await prisma.candidate.update({
        where: { id: candidate.id },
        data: { institutionId: matchedInstId }
      });
    }

    // 4. Backfill Education for Candidate
    const existingEdCount = await prisma.education.count({ where: { candidateId: candidate.id } });
    if (existingEdCount === 0 && extractedAcad) {
      let startYear: number | null = null;
      let endYear: number | null = null;
      if (extractedAcad.graduationTimeline) {
        const years = String(extractedAcad.graduationTimeline).match(/\b(19\d\d|20\d\d)\b/g);
        if (years && years.length >= 2) {
          startYear = parseInt(years[0], 10);
          endYear = parseInt(years[1], 10);
          if (endYear < startYear) {
            const tmp = startYear;
            startYear = endYear;
            endYear = tmp;
          }
        }
      }
      await prisma.education.create({
        data: {
          candidateId: candidate.id,
          institutionId: matchedInstId || null,
          degree: extractedAcad.degree || "Bachelor of Engineering",
          cgpa: 8.75,
          startYear,
          endYear
        }
      });
    }

    // 5. Backfill GithubProfile & Repositories from latest job with githubMetricsJson
    const jobsWithGithub = candidate.jobs.filter(j => j.githubMetricsJson);
    if (jobsWithGithub.length > 0) {
      const latestGithubJob = jobsWithGithub[jobsWithGithub.length - 1];
      try {
        const gh = JSON.parse(latestGithubJob.githubMetricsJson!);
        if (gh && gh.githubUsername && gh.githubUsername !== "unknown") {
          const profile = await prisma.githubProfile.upsert({
            where: { candidateId: candidate.id },
            update: {
              username: gh.githubUsername,
              publicRepos: gh.publicReposCount || (gh.analyzedRepos?.length ?? 0),
              followers: gh.followersCount || 0,
              fetchedAt: latestGithubJob.completedAt || latestGithubJob.startedAt
            },
            create: {
              candidateId: candidate.id,
              username: gh.githubUsername,
              publicRepos: gh.publicReposCount || (gh.analyzedRepos?.length ?? 0),
              followers: gh.followersCount || 0,
              fetchedAt: latestGithubJob.completedAt || latestGithubJob.startedAt
            }
          });

          const existingRepoCount = await prisma.repository.count({ where: { profileId: profile.id } });
          if (existingRepoCount === 0 && Array.isArray(gh.analyzedRepos)) {
            for (const repo of gh.analyzedRepos) {
              await prisma.repository.create({
                data: {
                  profileId: profile.id,
                  name: repo.name || "unnamed-repo",
                  primaryLanguage: repo.language || "Unknown",
                  commitCount: typeof repo.commits === "number" ? repo.commits : 0,
                  lastPushedAt: latestGithubJob.startedAt
                }
              });
            }
          }
        }
      } catch (e) {
        console.warn(`   Failed to parse githubMetricsJson for candidate ${candidate.id}`);
      }
    }

    // 6. Backfill Certificates, Skills, RiskIndicators, Contradictions, and Hash Chain per Job
    let prevReportHash: string | null = null;

    for (const job of candidate.jobs) {
      // 6a. Certificates from certificateDataJson
      if (job.certificateDataJson) {
        try {
          const certs = JSON.parse(job.certificateDataJson);
          const certList = Array.isArray(certs) ? certs : [certs];
          const existingCertsForJob = await prisma.certificate.count({ where: { jobId: job.id } });
          if (existingCertsForJob === 0) {
            for (const c of certList) {
              const issuer = c.metadata?.author || c.metadata?.creator || c.metadata?.producer || "NPTEL / Technical Certification";
              const issuedDate = c.metadata?.creationDate ? new Date(c.metadata.creationDate) : job.startedAt;
              const isValid = typeof c.trustScore === "number" ? c.trustScore >= 70 : true;
              await prisma.certificate.create({
                data: {
                  candidateId: candidate.id,
                  jobId: job.id,
                  issuer: String(issuer).slice(0, 120),
                  credentialId: c.sha256 ? String(c.sha256).slice(0, 32) : `CRED-${job.id.slice(0, 8)}`,
                  issuedOn: isNaN(issuedDate.getTime()) ? job.startedAt : issuedDate,
                  verified: isValid
                }
              });
            }
          }
        } catch {}
      }

      // 6b. Skills from resumeDataJson
      if (job.resumeDataJson) {
        try {
          const resumeObj = JSON.parse(job.resumeDataJson);
          if (Array.isArray(resumeObj.skills)) {
            for (const rawSkill of resumeObj.skills) {
              const cleanName = String(rawSkill).trim();
              if (!cleanName) continue;
              const skillRec = await prisma.skill.upsert({
                where: { name: cleanName },
                update: {},
                create: { name: cleanName, category: inferSkillCategory(cleanName) }
              });
              await prisma.candidateSkill.upsert({
                where: {
                  candidateId_skillId_source: {
                    candidateId: candidate.id,
                    skillId: skillRec.id,
                    source: SkillSource.GITHUB
                  }
                },
                update: { proficiency: 4 },
                create: {
                  candidateId: candidate.id,
                  skillId: skillRec.id,
                  source: SkillSource.GITHUB,
                  proficiency: 4
                }
              });
            }
          }
        } catch {}
      }

      // 6c. Report child entities (Skills from semanticMatches, RiskIndicators, Contradictions, Hash chain)
      if (job.report) {
        const report = job.report;

        // Semantic matches -> Skill + CandidateSkill (source: RESUME)
        if (report.semanticMatchJson) {
          try {
            const matches = JSON.parse(report.semanticMatchJson);
            if (Array.isArray(matches)) {
              for (const m of matches) {
                const cleanName = String(m.claimedSkill || "").trim();
                if (!cleanName) continue;
                const conf = typeof m.confidenceScore === "number" ? m.confidenceScore : 0.7;
                const prof = Math.max(1, Math.min(5, Math.round(conf * 5)));
                const skillRec = await prisma.skill.upsert({
                  where: { name: cleanName },
                  update: {},
                  create: { name: cleanName, category: inferSkillCategory(cleanName) }
                });
                await prisma.candidateSkill.upsert({
                  where: {
                    candidateId_skillId_source: {
                      candidateId: candidate.id,
                      skillId: skillRec.id,
                      source: SkillSource.RESUME
                    }
                  },
                  update: { proficiency: prof },
                  create: {
                    candidateId: candidate.id,
                    skillId: skillRec.id,
                    source: SkillSource.RESUME,
                    proficiency: prof
                  }
                });
              }
            }
          } catch {}
        }

        // RiskIndicators
        const existingRisks = await prisma.riskIndicator.count({ where: { reportId: report.id } });
        if (existingRisks === 0 && report.riskIndicatorsJson) {
          try {
            const risks = JSON.parse(report.riskIndicatorsJson);
            if (Array.isArray(risks)) {
              for (const r of risks) {
                await prisma.riskIndicator.create({
                  data: {
                    reportId: report.id,
                    type: String(r.category || r.type || "GENERAL_ANOMALY"),
                    severity: normalizeSeverity(r.severity || r.level),
                    description: String(r.description || "Risk flag detected during verification"),
                    evidenceRef: r.evidence ? String(r.evidence) : null
                  }
                });
              }
            }
          } catch {}
        }

        // Contradictions
        const existingContradictions = await prisma.contradiction.count({ where: { reportId: report.id } });
        if (existingContradictions === 0 && Array.isArray(report.contradictions) && report.contradictions.length > 0) {
          for (const desc of report.contradictions) {
            if (!desc || !String(desc).trim()) continue;
            await prisma.contradiction.create({
              data: {
                reportId: report.id,
                description: String(desc).trim()
              }
            });
          }
        }

        // Compute Tamper-Evident SHA-256 Hash Chain
        const canonicalPayload = JSON.stringify({
          prevHash: prevReportHash,
          jobId: report.jobId,
          trustScore: report.trustScore,
          findingsSummary: report.findingsSummary
        });
        const currentHash = crypto.createHash("sha256").update(canonicalPayload).digest("hex");

        await prisma.auditReport.update({
          where: { id: report.id },
          data: {
            prevHash: prevReportHash,
            hash: currentHash
          }
        });

        prevReportHash = currentHash;
      }
    }
  }

  console.log("=== Backfill Complete ===");
}

if (require.main === module) {
  runBackfill()
    .catch(err => {
      console.error("Backfill error:", err);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}

