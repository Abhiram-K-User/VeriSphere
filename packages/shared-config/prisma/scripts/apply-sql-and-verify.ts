import { PrismaClient } from '@prisma/client';
import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });

const prisma = new PrismaClient();

async function applySqlAndVerify() {
  console.log("=== Applying Phase 2 Raw SQL (Constraints, Triggers, Functions, Views) ===");

  // 1. CHECK constraints
  await prisma.$executeRawUnsafe(`
    DO $$ BEGIN
      ALTER TABLE "AuditReport" ADD CONSTRAINT "chk_audit_report_trust_score" CHECK ("trustScore" BETWEEN 0 AND 100);
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
  `);

  await prisma.$executeRawUnsafe(`
    DO $$ BEGIN
      ALTER TABLE "Education" ADD CONSTRAINT "chk_education_cgpa" CHECK ("cgpa" IS NULL OR ("cgpa" >= 0 AND "cgpa" <= 10.00));
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
  `);

  await prisma.$executeRawUnsafe(`
    DO $$ BEGIN
      ALTER TABLE "Education" ADD CONSTRAINT "chk_education_years" CHECK ("startYear" IS NULL OR "endYear" IS NULL OR "endYear" >= "startYear");
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
  `);

  await prisma.$executeRawUnsafe(`
    DO $$ BEGIN
      ALTER TABLE "CandidateSkill" ADD CONSTRAINT "chk_candidate_skill_proficiency" CHECK ("proficiency" BETWEEN 1 AND 5);
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
  `);

  // 2. Audit Log Trigger Function & Triggers
  await prisma.$executeRawUnsafe(`
    CREATE OR REPLACE FUNCTION fn_audit_log_trigger()
    RETURNS TRIGGER AS $$
    DECLARE
      v_entity_id TEXT;
      v_details TEXT;
    BEGIN
      IF (TG_OP = 'DELETE') THEN
        v_entity_id := OLD.id;
        v_details := row_to_json(OLD)::text;
      ELSE
        v_entity_id := NEW.id;
        v_details := row_to_json(NEW)::text;
      END IF;

      INSERT INTO "AuditLog" ("id", "actorId", "action", "entity", "entityId", "at", "detailsJson")
      VALUES (
        gen_random_uuid()::text,
        current_setting('app.current_actor_id', true),
        TG_OP,
        TG_TABLE_NAME,
        v_entity_id,
        NOW(),
        v_details
      );

      IF (TG_OP = 'DELETE') THEN
        RETURN OLD;
      END IF;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `);

  await prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS trg_audit_verification_job ON "VerificationJob";`);
  await prisma.$executeRawUnsafe(`
    CREATE TRIGGER trg_audit_verification_job
    AFTER INSERT OR UPDATE OR DELETE ON "VerificationJob"
    FOR EACH ROW EXECUTE FUNCTION fn_audit_log_trigger();
  `);

  await prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS trg_audit_report ON "AuditReport";`);
  await prisma.$executeRawUnsafe(`
    CREATE TRIGGER trg_audit_report
    AFTER INSERT OR UPDATE OR DELETE ON "AuditReport"
    FOR EACH ROW EXECUTE FUNCTION fn_audit_log_trigger();
  `);

  // 3. Auto-timestamp Trigger on VerificationJob
  await prisma.$executeRawUnsafe(`
    CREATE OR REPLACE FUNCTION fn_set_completed_at()
    RETURNS TRIGGER AS $$
    BEGIN
      IF NEW."status" = 'COMPLETED'::"JobStatus" AND OLD."status" IS DISTINCT FROM 'COMPLETED'::"JobStatus" AND NEW."completedAt" IS NULL THEN
        NEW."completedAt" := NOW();
      END IF;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `);

  await prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS trg_set_completed_at ON "VerificationJob";`);
  await prisma.$executeRawUnsafe(`
    CREATE TRIGGER trg_set_completed_at
    BEFORE UPDATE ON "VerificationJob"
    FOR EACH ROW EXECUTE FUNCTION fn_set_completed_at();
  `);

  // 4. compute_trust_score function
  await prisma.$executeRawUnsafe(`
    CREATE OR REPLACE FUNCTION compute_trust_score(p_job_id TEXT)
    RETURNS INT AS $$
    DECLARE
      v_report_id TEXT;
      v_penalty INT := 0;
    BEGIN
      SELECT "id" INTO v_report_id FROM "AuditReport" WHERE "jobId" = p_job_id LIMIT 1;
      IF v_report_id IS NULL THEN
        RETURN 100;
      END IF;

      SELECT COALESCE(SUM(
        CASE "severity"
          WHEN 'CRITICAL'::"Severity" THEN 30
          WHEN 'HIGH'::"Severity" THEN 25
          WHEN 'MEDIUM'::"Severity" THEN 10
          WHEN 'LOW'::"Severity" THEN 3
          ELSE 5
        END
      ), 0)
      INTO v_penalty
      FROM "RiskIndicator"
      WHERE "reportId" = v_report_id;

      RETURN GREATEST(0, 100 - v_penalty);
    END;
    $$ LANGUAGE plpgsql;
  `);

  // 5. Stored Procedure sp_finalize_job
  await prisma.$executeRawUnsafe(`
    CREATE OR REPLACE PROCEDURE sp_finalize_job(
      p_job_id TEXT,
      p_summary TEXT,
      p_trust_score INT
    )
    LANGUAGE plpgsql
    AS $$
    BEGIN
      UPDATE "VerificationJob"
      SET "status" = 'COMPLETED'::"JobStatus",
          "completedAt" = NOW()
      WHERE "id" = p_job_id;

      UPDATE "AuditReport"
      SET "findingsSummary" = p_summary,
          "trustScore" = p_trust_score
      WHERE "jobId" = p_job_id;
    END;
    $$;
  `);

  // 6. GIN Trigram Index & Views
  await prisma.$executeRawUnsafe(`CREATE EXTENSION IF NOT EXISTS pg_trgm;`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS idx_skill_name_trgm ON "Skill" USING GIN ("name" gin_trgm_ops);`);

  await prisma.$executeRawUnsafe(`
    CREATE OR REPLACE VIEW v_candidate_risk_summary AS
    SELECT
      c."id" AS "candidateId",
      c."firstName",
      c."lastName",
      c."email",
      c."institutionalEmail",
      i."name" AS "institutionName",
      COUNT(DISTINCT vj."id") AS "totalJobs",
      MAX(vj."startedAt") AS "latestJobAt",
      (
        SELECT ar."trustScore"
        FROM "VerificationJob" vj2
        JOIN "AuditReport" ar ON ar."jobId" = vj2."id"
        WHERE vj2."candidateId" = c."id"
        ORDER BY vj2."startedAt" DESC
        LIMIT 1
      ) AS "latestTrustScore",
      COUNT(ri."id") FILTER (WHERE ri."severity" IN ('HIGH'::"Severity", 'CRITICAL'::"Severity")) AS "highRiskCount"
    FROM "Candidate" c
    LEFT JOIN "Institution" i ON i."id" = c."institutionId"
    LEFT JOIN "VerificationJob" vj ON vj."candidateId" = c."id"
    LEFT JOIN "AuditReport" ar2 ON ar2."jobId" = vj."id"
    LEFT JOIN "RiskIndicator" ri ON ri."reportId" = ar2."id"
    GROUP BY c."id", c."firstName", c."lastName", c."email", c."institutionalEmail", i."name";
  `);

  await prisma.$executeRawUnsafe(`DROP MATERIALIZED VIEW IF EXISTS mv_recruiter_dashboard;`);
  await prisma.$executeRawUnsafe(`
    CREATE MATERIALIZED VIEW mv_recruiter_dashboard AS
    SELECT
      DATE_TRUNC('day', vj."startedAt")::date AS "jobDate",
      COUNT(vj."id") AS "totalJobs",
      COUNT(vj."id") FILTER (WHERE vj."status" = 'COMPLETED'::"JobStatus") AS "completedJobs",
      COUNT(vj."id") FILTER (WHERE vj."status" = 'FAILED'::"JobStatus") AS "failedJobs",
      ROUND(AVG(ar."trustScore"), 2) AS "avgTrustScore"
    FROM "VerificationJob" vj
    LEFT JOIN "AuditReport" ar ON ar."jobId" = vj."id"
    GROUP BY DATE_TRUNC('day', vj."startedAt")::date
    ORDER BY "jobDate" DESC;
  `);

  // Seed initial AuditLog entries for existing reports if empty
  const existingLogs = await prisma.auditLog.count();
  if (existingLogs === 0) {
    const reports = await prisma.auditReport.findMany({ take: 5, orderBy: { createdAt: 'desc' } });
    for (const r of reports) {
      await prisma.auditLog.create({
        data: {
          actorId: "system-backfill",
          action: "INSERT",
          entity: "AuditReport",
          entityId: r.id,
          detailsJson: JSON.stringify({ jobId: r.jobId, trustScore: r.trustScore, hash: r.hash })
        }
      });
    }
  }

  // 7. Count all tables
  const counts = {
    Institution: await prisma.institution.count(),
    Candidate: await prisma.candidate.count(),
    Education: await prisma.education.count(),
    Certificate: await prisma.certificate.count(),
    GithubProfile: await prisma.githubProfile.count(),
    Repository: await prisma.repository.count(),
    Skill: await prisma.skill.count(),
    CandidateSkill: await prisma.candidateSkill.count(),
    VerificationJob: await prisma.verificationJob.count(),
    AuditReport: await prisma.auditReport.count(),
    RiskIndicator: await prisma.riskIndicator.count(),
    Contradiction: await prisma.contradiction.count(),
    AppUser: await prisma.appUser.count(),
    AuditLog: await prisma.auditLog.count()
  };

  console.log("=== SUPABASE TABLE COUNTS ===");
  console.log(JSON.stringify(counts, null, 2));
}

applySqlAndVerify()
  .catch(err => {
    console.error("Error applying SQL:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

