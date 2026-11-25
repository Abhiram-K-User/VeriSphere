/**
 * @file verification-routes.ts
 * @package apps/api
 * @purpose Defines the Express routing endpoints for candidate intake, status checks, audit reports, and analytics.
 * @dependencies express, @verisphere/shared-types, UploadCandidateUseCase
 * @security Access strictly constrained via authMiddleware (requires jwt or valid x-api-key header).
 */

import { Router, Request, Response, NextFunction } from "express";
import { UploadCandidateUseCase } from "../../application/use-cases/upload-candidate";
import { ValidationError, ResourceNotFoundError } from "../../domain/entities";
import { authMiddleware } from "../middleware/auth-middleware";
import { mapRelationalJobToLegacyShape } from "../../application/services/report-mapper";
import { extractIdentityFromResume } from "../../application/services/resume-identity-extractor";
import { prisma } from "../db/prisma-client";
import multer from "multer";
import path from "path";
import fs from "fs";
import crypto from "crypto";

// Ensure uploads directory exists
const uploadDir = path.join(__dirname, "../../../../uploads");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Configure multer for PDF uploads (in memory)
const upload = multer({
  storage: multer.memoryStorage()
});

function normalizeGithubUrl(rawUsername?: string, rawUrl?: string): string | undefined {
  const input = (rawUsername || rawUrl || "").trim();
  if (!input) return undefined;

  // Strip protocol, github.com prefix, leading @, query/hash, and trailing slashes
  const username = input
    .replace(/^https?:\/\/(www\.)?github\.com\//i, "")
    .replace(/^(www\.)?github\.com\//i, "")
    .replace(/^@/, "")
    .replace(/[?#].*$/, "")
    .replace(/\/+$/, "")
    .split("/")[0]
    .trim();

  if (!username) return undefined;
  return `https://github.com/${username}`;
}

export function createVerificationRouter(
  uploadCandidateUseCase: UploadCandidateUseCase,
  jobRepository: any
): Router {
  const router = Router();

  // Apply Auth Middleware to all routes in this router context
  router.use(authMiddleware);

  /**
   * POST /api/verification/intake
   * Ingests candidate profile and triggers background scan job.
   */
  router.post("/intake", upload.single("resumeFile"), async (req: Request, res: Response, next: NextFunction) => {
    try {
      const githubUrl = normalizeGithubUrl(req.body.githubUsername, req.body.githubUrl);

      // Parse certificateAnalyses if provided as JSON string in FormData
      let certificateAnalyses: any[] = [];
      if (req.body.certificateAnalyses) {
        try {
          certificateAnalyses = JSON.parse(req.body.certificateAnalyses);
        } catch (e) {
          console.warn("[Intake] Failed to parse certificateAnalyses:", e);
        }
      }

      const candidateData = {
        ...req.body,
        githubUrl,
        resumeFileUrl: "",
        resumeBuffer: req.file ? req.file.buffer : undefined,
        certificateUrls: [],
        certificateAnalyses
      };
      
      const result = await uploadCandidateUseCase.execute(candidateData);
      return res.status(202).json(result);
    } catch (error) {
      next(error);
    }
  });

  /**
   * POST /api/verification/intake/bulk
   * Organization bulk resume upload: creates a single normalized VerificationBatch,
   * auto-extracts candidate name, email, institutional email, and GitHub profile from
   * each resume PDF, and queues verification jobs linked via batchId FK.
   */
  router.post(
    "/intake/bulk",
    upload.array("resumeFiles", 50),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const files = (req.files as Express.Multer.File[] | undefined) || [];
        if (files.length === 0) {
          throw new ValidationError("Please upload at least one PDF resume for batch verification.");
        }

        const orgEmail =
          typeof req.body.orgEmail === "string" && req.body.orgEmail.trim()
            ? req.body.orgEmail.trim().toLowerCase()
            : null;
        const label =
          typeof req.body.label === "string" && req.body.label.trim()
            ? req.body.label.trim().slice(0, 120)
            : null;

        // 1. Create normalized VerificationBatch record
        const batch = await prisma.verificationBatch.create({
          data: {
            orgEmail,
            label,
          },
        });

        const createdJobs: Array<{
          jobId: string;
          candidateId: string;
          fileName: string;
          firstName: string;
          lastName: string;
          email: string;
          githubUrl?: string;
        }> = [];
        const failedFiles: Array<{ fileName: string; error: string }> = [];

        // 2. Parse all PDFs in parallel (eliminating sequential blocking + duplicate PDF parsing)
        const parsedResults = await Promise.all(
          files.map(async (file) => {
            try {
              const extracted = await extractIdentityFromResume(file.buffer, file.originalname);
              return { file, extracted, error: null };
            } catch (err: any) {
              return { file, extracted: null, error: err?.message || "Failed to parse PDF" };
            }
          })
        );

        // 3. Upsert candidates and dispatch verification jobs (reusing preParsedText!)
        for (const item of parsedResults) {
          if (!item.extracted || item.error) {
            failedFiles.push({
              fileName: item.file.originalname,
              error: item.error || "Failed to parse resume PDF",
            });
            continue;
          }

          try {
            const { extracted, file } = item;
            const normalizedGh = normalizeGithubUrl(undefined, extracted.githubUrl);

            const result = await uploadCandidateUseCase.execute({
              firstName: extracted.firstName,
              lastName: extracted.lastName,
              email: extracted.email,
              institutionalEmail: extracted.institutionalEmail,
              githubUrl: normalizedGh,
              resumeFileUrl: "",
              resumeBuffer: file.buffer,
              preParsedText: extracted.rawText,
              certificateUrls: [],
              certificateAnalyses: [],
              batchId: batch.id,
            } as any);

            createdJobs.push({
              jobId: result.jobId,
              candidateId: result.candidateId,
              fileName: file.originalname,
              firstName: extracted.firstName,
              lastName: extracted.lastName,
              email: extracted.email,
              githubUrl: normalizedGh,
            });
          } catch (fileErr: any) {
            console.error(`[Bulk Intake] Failed for ${item.file.originalname}:`, fileErr);
            failedFiles.push({
              fileName: item.file.originalname,
              error: fileErr?.message || "Failed to process resume PDF",
            });
          }
        }

        // Prevent empty orphan batch if all files failed (zero insertion anomaly)
        if (createdJobs.length === 0) {
          await prisma.verificationBatch.delete({ where: { id: batch.id } }).catch(() => {});
          return res.status(400).json({
            success: false,
            error: "None of the uploaded PDF resumes could be queued.",
            failedFiles,
          });
        }

        return res.status(202).json({
          success: true,
          batch: {
            id: batch.id,
            createdAt: batch.createdAt,
            orgEmail: batch.orgEmail,
            label: batch.label,
          },
          jobs: createdJobs,
          failedFiles,
        });
      } catch (error) {
        next(error);
      }
    }
  );

  /**
   * GET /api/verification/batches
   * Returns all normalized VerificationBatch records with dynamically computed counts.
   */
  router.get("/batches", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const batches = await prisma.verificationBatch.findMany({
        orderBy: { createdAt: "desc" },
        include: {
          jobs: {
            select: {
              id: true,
              status: true,
              report: {
                select: {
                  trustScore: true,
                },
              },
            },
          },
        },
      });

      const formatted = batches.map((b) => {
        const totalJobs = b.jobs.length;
        const completedJobs = b.jobs.filter((j) => j.status === "COMPLETED");
        const failedJobs = b.jobs.filter((j) => j.status === "FAILED");
        const analyzingJobs = b.jobs.filter((j) => j.status === "ANALYZING" || j.status === "QUEUED");
        const avgTrustScore =
          completedJobs.length > 0
            ? Math.round(
                completedJobs.reduce((acc, j) => acc + (j.report?.trustScore || 0), 0) /
                  completedJobs.length
              )
            : null;

        return {
          id: b.id,
          orgEmail: b.orgEmail,
          label: b.label,
          createdAt: b.createdAt,
          totalJobs,
          completedCount: completedJobs.length,
          failedCount: failedJobs.length,
          analyzingCount: analyzingJobs.length,
          avgTrustScore,
        };
      });

      return res.status(200).json(formatted);
    } catch (error) {
      next(error);
    }
  });

  /**
   * GET /api/verification/batches/:batchId/summary/pdf
   * Generates a comprehensive Executive Batch Verification Summary PDF for Organizations.
   */
  router.get(
    "/batches/:batchId/summary/pdf",
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { batchId } = req.params;
        const batch = await prisma.verificationBatch.findUnique({
          where: { id: batchId },
          include: {
            jobs: {
              orderBy: { createdAt: "desc" },
              include: {
                candidate: {
                  include: {
                    skills: { include: { skill: true } },
                  },
                },
                report: {
                  include: {
                    riskIndicators: true,
                  },
                },
              },
            },
          },
        });

        if (!batch) {
          throw new ResourceNotFoundError("VerificationBatch", batchId);
        }

        const totalCandidates = batch.jobs.length;
        const completedJobs = batch.jobs.filter((j) => j.status === "COMPLETED");
        const completedCount = completedJobs.length;
        const avgTrustScore =
          completedCount > 0
            ? Math.round(
                completedJobs.reduce((acc, j) => acc + (j.report?.trustScore || 0), 0) /
                  completedCount
              )
            : 0;

        const recommendedCount = completedJobs.filter(
          (j) => (j.report?.trustScore ?? 0) >= 75
        ).length;
        const moderateCount = completedJobs.filter((j) => {
          const s = j.report?.trustScore ?? 0;
          return s >= 55 && s < 75;
        }).length;
        const highRiskCount = completedJobs.filter(
          (j) => (j.report?.trustScore ?? 0) < 55
        ).length;
        const otherCount = totalCandidates - completedCount;

        const denom = Math.max(1, totalCandidates);
        const pctStrong = Math.round((recommendedCount / denom) * 100);
        const pctModerate = Math.round((moderateCount / denom) * 100);
        const pctRisk = Math.round((highRiskCount / denom) * 100);
        const pctOther = Math.max(0, 100 - pctStrong - pctModerate - pctRisk);

        // Aggregate verified skills across batch
        const skillCounts = new Map<string, number>();
        const riskCounts = new Map<string, number>();

        for (const job of batch.jobs) {
          const seenForCandidate = new Set<string>();
          for (const cs of job.candidate?.skills || []) {
            const sName = cs.skill?.name;
            if (sName && !seenForCandidate.has(sName)) {
              seenForCandidate.add(sName);
              skillCounts.set(sName, (skillCounts.get(sName) || 0) + 1);
            }
          }
          const seenRiskTypes = new Set<string>();
          for (const ri of job.report?.riskIndicators || []) {
            if (ri.type && !seenRiskTypes.has(ri.type)) {
              seenRiskTypes.add(ri.type);
              riskCounts.set(ri.type, (riskCounts.get(ri.type) || 0) + 1);
            }
          }
        }

        const topSkills = Array.from(skillCounts.entries())
          .sort((a, b) => b[1] - a[1])
          .slice(0, 12)
          .map(([name, count]) => ({ name, count }));

        const topRisks = Array.from(riskCounts.entries())
          .sort((a, b) => b[1] - a[1])
          .slice(0, 6)
          .map(([type, count]) => ({ type, count }));

        // Rank candidates by trustScore descending
        const rankedJobs = [...batch.jobs].sort((a, b) => {
          const scoreA = a.status === "COMPLETED" ? a.report?.trustScore ?? -1 : -2;
          const scoreB = b.status === "COMPLETED" ? b.report?.trustScore ?? -1 : -2;
          return scoreB - scoreA;
        });

        const candidates = rankedJobs.map((job, idx) => {
          const hasScore = job.status === "COMPLETED" && job.report?.trustScore != null;
          const score = job.report?.trustScore ?? 0;
          let verdictLabel: string = String(job.status);
          let verdictClass = "badge-gray";
          let scoreColor = "#6B7280";

          if (hasScore) {
            if (score >= 75) {
              verdictLabel = "Strong Hire";
              verdictClass = "badge-green";
              scoreColor = "#16A34A";
            } else if (score >= 55) {
              verdictLabel = "Review";
              verdictClass = "badge-amber";
              scoreColor = "#D97706";
            } else {
              verdictLabel = "High Risk";
              verdictClass = "badge-red";
              scoreColor = "#DC2626";
            }
          } else if (job.status === "FAILED") {
            verdictLabel = "Failed";
            verdictClass = "badge-red";
          } else {
            verdictLabel = "Analyzing";
            verdictClass = "badge-blue";
          }

          const ghHandle = job.candidate?.githubUrl
            ? "@" + job.candidate.githubUrl.replace(/^https?:\/\/(www\.)?github\.com\//i, "").replace(/\/.*$/, "")
            : "Not found";

          const summaryText =
            job.report?.findingsSummary ||
            (job.status === "FAILED"
              ? `Verification failed: ${job.errorMsg || "Upstream error"}`
              : "Verification still processing.");

          return {
            rank: idx + 1,
            name: `${job.candidate?.firstName || "Unknown"} ${job.candidate?.lastName || ""}`.trim(),
            email: job.candidate?.email || "N/A",
            githubHandle: ghHandle,
            hasScore,
            trustScore: score,
            scoreColor,
            verdictLabel,
            verdictClass,
            summary:
              summaryText.length > 180 ? summaryText.slice(0, 177) + "..." : summaryText,
            riskCount: job.report?.riskIndicators?.length || 0,
          };
        });

        const batchDate = new Date(batch.createdAt);
        const batchDateDay = `${batchDate.toLocaleDateString("en-IN", {
          day: "numeric",
          month: "short",
          year: "numeric",
        })} (${batchDate.toLocaleDateString("en-IN", { weekday: "short" })})`;
        const batchTime = batchDate.toLocaleTimeString("en-IN", {
          hour: "2-digit",
          minute: "2-digit",
          hour12: true,
        });

        const topCandidate = candidates.find((c) => c.hasScore);
        const executiveOverview =
          completedCount === 0
            ? `This batch contains ${totalCandidates} candidate resume(s) uploaded on ${batchDateDay}. Verification results are currently pending or incomplete.`
            : `Out of ${totalCandidates} candidate resume(s) in this batch, ${completedCount} completed forensic verification with an overall average Trust Score of ${avgTrustScore}/100. ${recommendedCount} candidate(s) achieved Strong Hire credibility (≥75), ${moderateCount} require targeted follow-up review (55–74), and ${highRiskCount} were flagged as High Risk (<55).${
                topCandidate
                  ? ` Top-ranked candidate: ${topCandidate.name} (${topCandidate.trustScore}/100).`
                  : ""
              }`;

        const integrityStamp = crypto
          .createHash("sha256")
          .update(`${batch.id}:${completedCount}:${avgTrustScore}`)
          .digest("hex")
          .slice(0, 16)
          .toUpperCase();

        const { PdfGeneratorService } = require("../../application/services/pdf-generator");
        const pdfService = new PdfGeneratorService();
        const pdfBuffer = await pdfService.generateBatchSummary({
          batchDateDay,
          batchTime,
          batchLabel: batch.label,
          orgEmail: batch.orgEmail,
          shortBatchId: batch.id.slice(0, 8).toUpperCase(),
          generatedAt: new Date().toLocaleString("en-IN"),
          totalCandidates,
          completedCount,
          avgTrustScore,
          recommendedCount,
          moderateCount,
          highRiskCount,
          otherCount,
          pctStrong,
          pctModerate,
          pctRisk,
          pctOther,
          executiveOverview,
          topSkills,
          topRisks,
          candidates,
          integrityStamp,
        });

        const fileDateSlug = batchDate.toISOString().slice(0, 10);
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader(
          "Content-Disposition",
          `attachment; filename="VeriSphere_Batch_Summary_${fileDateSlug}_${batch.id.slice(0, 6)}.pdf"`
        );
        res.setHeader("Content-Length", pdfBuffer.length);
        return res.status(200).send(pdfBuffer);
      } catch (error) {
        console.error("[Batch Summary PDF Error]:", error);
        next(error);
      }
    }
  );

  /**
   * GET /api/verification/jobs/:jobId/status
   * Returns the full VerificationJob with Candidate and AuditReport for polling and report display.
   */
  router.get("/jobs/:jobId/status", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { jobId } = req.params;
      const job = await jobRepository.findById(jobId);
      
      if (!job) {
        throw new ResourceNotFoundError("VerificationJob", jobId);
      }

      return res.status(200).json(job);
    } catch (error) {
      next(error);
    }
  });

  /**
   * GET /api/verification/jobs/:jobId/report/pdf
   * Generates and returns a professionally formatted PDF verification report.
   */
  router.get("/jobs/:jobId/report/pdf", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { jobId } = req.params;
      const job = await jobRepository.findById(jobId);
      
      if (!job || !job.report) {
        throw new ResourceNotFoundError("AuditReport", jobId);
      }

      const { PdfGeneratorService } = require("../../application/services/pdf-generator");
      const pdfService = new PdfGeneratorService();
      
      const pdfBuffer = await pdfService.generateReport(job);

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="VeriSphere_Report_${jobId}.pdf"`);
      res.setHeader("Content-Length", pdfBuffer.length);
      
      return res.status(200).send(pdfBuffer);
    } catch (error) {
      console.error("[PDF Generation Error]:", error);
      next(error);
    }
  });

  /**
   * GET /api/verification/reports/:reportId/integrity
   * Recomputes the tamper-evident SHA-256 hash chain for an AuditReport and verifies integrity.
   */
  router.get("/reports/:reportId/integrity", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { reportId } = req.params;
      const report = await prisma.auditReport.findUnique({ where: { id: reportId } });
      if (!report) {
        throw new ResourceNotFoundError("AuditReport", reportId);
      }

      const canonicalPayload = JSON.stringify({
        prevHash: report.prevHash || null,
        jobId: report.jobId,
        trustScore: report.trustScore,
        findingsSummary: report.findingsSummary
      });
      const recomputedHash = crypto.createHash("sha256").update(canonicalPayload).digest("hex");
      const valid = report.hash === recomputedHash;

      return res.status(200).json({
        reportId: report.id,
        jobId: report.jobId,
        prevHash: report.prevHash,
        storedHash: report.hash,
        recomputedHash,
        integrityVerified: valid
      });
    } catch (error) {
      next(error);
    }
  });

  /**
   * GET /api/verification/dashboard
   * Lean projection (~6 KB instead of 1.3 MB!) returning verification summaries for fast dashboard loads.
   * Full candidate/report payloads remain on GET /api/verification/jobs/:jobId/status.
   */
  router.get("/dashboard", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const batchId =
        typeof req.query.batchId === "string" && req.query.batchId.trim()
          ? req.query.batchId.trim()
          : undefined;

      const jobs = await prisma.verificationJob.findMany({
        where: batchId ? { batchId } : undefined,
        orderBy: { startedAt: "desc" },
        take: batchId ? 200 : 100,
        select: {
          id: true,
          candidateId: true,
          batchId: true,
          status: true,
          startedAt: true,
          completedAt: true,
          createdAt: true,
          errorMsg: true,
          candidate: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              githubUrl: true,
            },
          },
          report: {
            select: {
              id: true,
              trustScore: true,
            },
          },
        },
      });
      return res.status(200).json(jobs);
    } catch (error) {
      next(error);
    }
  });

  // Global Error Handler for the verification router
  router.use((err: Error, req: Request, res: Response, next: NextFunction) => {
    console.error(`[API ERROR] ${err.name}: ${err.message}`);

    if (err instanceof ValidationError) {
      return res.status(400).json({ error: err.message });
    }
    if (err instanceof ResourceNotFoundError) {
      return res.status(404).json({ error: err.message });
    }

    return res.status(500).json({ error: "Internal server error.", details: err.message });
  });

  return router;
}
