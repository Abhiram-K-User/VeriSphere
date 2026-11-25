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

        // 2. Parse each PDF, auto-extract identity, and queue job linked to batch.id
        for (const file of files) {
          try {
            const extracted = await extractIdentityFromResume(file.buffer, file.originalname);
            const normalizedGh = normalizeGithubUrl(undefined, extracted.githubUrl);

            const result = await uploadCandidateUseCase.execute({
              firstName: extracted.firstName,
              lastName: extracted.lastName,
              email: extracted.email,
              institutionalEmail: extracted.institutionalEmail,
              githubUrl: normalizedGh,
              resumeFileUrl: "",
              resumeBuffer: file.buffer,
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
            console.error(`[Bulk Intake] Failed for ${file.originalname}:`, fileErr);
            failedFiles.push({
              fileName: file.originalname,
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
   * Returns recent verification jobs (optionally scoped to a single VerificationBatch via ?batchId=).
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
        include: {
          batch: true,
          candidate: {
            include: {
              institution: true,
              educations: true,
              certificates: true,
              githubProfile: { include: { repositories: true } },
              skills: { include: { skill: true } }
            }
          },
          certificates: true,
          report: {
            include: {
              riskIndicators: true,
              contradictionItems: true
            }
          }
        }
      });
      return res.status(200).json(jobs.map(mapRelationalJobToLegacyShape));
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
