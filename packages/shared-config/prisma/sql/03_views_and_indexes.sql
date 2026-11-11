-- ============================================================================
-- 03_views_and_indexes.sql
-- Views, Materialized Views, and GIN Trigram Indexes for VeriSphere DBMS
-- ============================================================================

-- 1. Enable pg_trgm extension for GIN trigram indexing on Skill.name
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS idx_skill_name_trgm
ON "Skill" USING GIN ("name" gin_trgm_ops);

-- 2. View: v_candidate_risk_summary
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

-- 3. Materialized View: mv_recruiter_dashboard
DROP MATERIALIZED VIEW IF EXISTS mv_recruiter_dashboard;
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

