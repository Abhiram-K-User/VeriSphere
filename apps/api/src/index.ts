import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import * as dotenv from "dotenv";
import path from "path";

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, "../../../.env") });

import { prisma } from "./infrastructure/db/prisma-client";
import { createVerificationRouter } from "./infrastructure/routes/verification-routes";
import { createForensicsRouter } from "./modules/forensics/forensics.routes";
import { UploadCandidateUseCase } from "./application/use-cases/upload-candidate";
import { VerificationOrchestrator } from "./application/verification-orchestrator";
import { mapRelationalJobToLegacyShape } from "./application/services/report-mapper";

const app = express();
const PORT = process.env.PORT || 4000;

app.use(helmet());
app.use(cors());
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));
app.use(morgan("combined"));

// Normalized Relational Repository Implementations
const mockCandidateRepo = {
  findById: async (id: string) => prisma.candidate.findUnique({ where: { id } }) as any,
  findByEmail: async (email: string) =>
    prisma.candidate.findUnique({ where: { email: email.trim().toLowerCase() } }) as any,
  create: async (c: any) => {
    const cleanEmail = (c.email || "test@example.com").trim().toLowerCase();
    const candidate = await prisma.candidate.upsert({
      where: { email: cleanEmail },
      update: {
        firstName: (c.firstName || "John").trim(),
        lastName: (c.lastName || "Doe").trim(),
        institutionalEmail: c.institutionalEmail ? c.institutionalEmail.trim() : undefined,
        phone: c.phone ? c.phone.trim() : undefined,
        githubUrl: c.githubUrl ? c.githubUrl.trim() : undefined,
      },
      create: {
        firstName: (c.firstName || "John").trim(),
        lastName: (c.lastName || "Doe").trim(),
        email: cleanEmail,
        institutionalEmail: c.institutionalEmail ? c.institutionalEmail.trim() : null,
        phone: c.phone ? c.phone.trim() : null,
        githubUrl: c.githubUrl ? c.githubUrl.trim() : null,
      },
    });
    return candidate as any;
  },
  listAll: async (org: string) => prisma.candidate.findMany() as any,
};

const mockJobRepo = {
  findById: async (id: string) => {
    const job = await prisma.verificationJob.findUnique({
      where: { id },
      include: {
        report: {
          include: {
            riskIndicators: true,
            contradictionItems: true,
          },
        },
        certificates: true,
        candidate: {
          include: {
            institution: true,
            educations: { include: { institution: true } },
            certificates: true,
            githubProfile: { include: { repositories: true } },
            skills: { include: { skill: true } },
          },
        },
      },
    });
    return mapRelationalJobToLegacyShape(job);
  },
  create: async (cId: string) => {
    const job = await prisma.verificationJob.create({
      data: {
        candidateId: cId,
        status: "QUEUED",
      },
    });
    return job as any;
  },
  updateStatus: async (jId: string, status: string, error?: string) => {},
  saveResults: async () => {},
} as any;

const orchestrator = new VerificationOrchestrator();
const uploadUseCase = new UploadCandidateUseCase(mockCandidateRepo, mockJobRepo, orchestrator);

// Health Check
app.get("/health", (req, res) => {
  res.status(200).json({ status: "healthy", timestamp: new Date().toISOString() });
});

// Route mount
app.use("/api/verification", createVerificationRouter(uploadUseCase, mockJobRepo));
app.use("/api/forensics", createForensicsRouter());

// Global Error Handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error("[Global Error]", err);
  res.status(err.status || 500).json({
    success: false,
    error: err.message || "Internal Server Error",
  });
});

app.listen(PORT, () => {
  console.log(`[VeriSphere API] Running on http://localhost:${PORT}`);
});
