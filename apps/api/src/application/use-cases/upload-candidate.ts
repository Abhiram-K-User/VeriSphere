/**
 * @file upload-candidate.ts
 * @package apps/api
 * @purpose Implements candidate ingestion and job dispatching. Clean Architecture Application Layer.
 * @dependencies @verisphere/shared-types, ICandidateRepository, IVerificationJobRepository, VerificationOrchestrator
 * @security Validates input strings (rejecting bad formatting) before invoking downstream API calls.
 * @future_implementation Include anti-virus malware scanning checks on resumeFileUrl before starting analysis.
 */

import { CreateCandidateRequest, CreateCandidateResponse, VerificationStatus } from "@verisphere/shared-types";
import { ICandidateRepository, IVerificationJobRepository } from "../../domain/interfaces";
import { VerificationOrchestrator } from "../verification-orchestrator";
import { ValidationError, validateEmail, validateGithubUrl } from "../../domain/entities";

export class UploadCandidateUseCase {
  private candidateRepo: ICandidateRepository;
  private jobRepo: IVerificationJobRepository;
  private orchestrator: VerificationOrchestrator;

  constructor(
    candidateRepo: ICandidateRepository,
    jobRepo: IVerificationJobRepository,
    orchestrator: VerificationOrchestrator
  ) {
    this.candidateRepo = candidateRepo;
    this.jobRepo = jobRepo;
    this.orchestrator = orchestrator;
  }

  /**
   * Validates intake requests, saves candidate records to PostgreSQL, and kicks off verification job worker.
   */
  public async execute(
    request: CreateCandidateRequest
  ): Promise<CreateCandidateResponse> {
    // 1. Validation checks
    if (!validateEmail(request.email)) {
      throw new ValidationError("Invalid candidate email address format.");
    }
    
    if (request.githubUrl && !validateGithubUrl(request.githubUrl)) {
      throw new ValidationError("Invalid candidate GitHub profile URL.");
    }

    if (!request.resumeFileUrl && !(request as any).resumeBuffer) {
      throw new ValidationError("Candidate resume PDF is required.");
    }

    // 2. Save candidate
    const candidate = await this.candidateRepo.create({
      firstName: request.firstName,
      lastName: request.lastName,
      email: request.email,
      institutionalEmail: request.institutionalEmail,
      githubUrl: request.githubUrl
    });

    // 3. Create job queue entry in DB (optionally linked to a normalized VerificationBatch)
    const batchId = (request as any).batchId as string | undefined;
    const job = await (this.jobRepo as any).create(candidate.id, batchId);

    // 4. Trigger asynchronous engine pipeline (non-blocking)
    await this.orchestrator.triggerVerification(job.id, candidate.id, request.resumeFileUrl, (request as any).certificateAnalyses, (request as any).resumeBuffer);

    return {
      success: true,
      candidateId: candidate.id,
      jobId: job.id
    };
  }
}
