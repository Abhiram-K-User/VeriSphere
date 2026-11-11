-- ============================================================================
-- 01_constraints.sql
-- Domain integrity CHECK constraints for normalized PostgreSQL schema
-- ============================================================================

DO $$ BEGIN
  ALTER TABLE "AuditReport"
    ADD CONSTRAINT "chk_audit_report_trust_score"
    CHECK ("trustScore" BETWEEN 0 AND 100);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "Education"
    ADD CONSTRAINT "chk_education_cgpa"
    CHECK ("cgpa" IS NULL OR ("cgpa" >= 0 AND "cgpa" <= 10.00));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "Education"
    ADD CONSTRAINT "chk_education_years"
    CHECK ("startYear" IS NULL OR "endYear" IS NULL OR "endYear" >= "startYear");
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "CandidateSkill"
    ADD CONSTRAINT "chk_candidate_skill_proficiency"
    CHECK ("proficiency" BETWEEN 1 AND 5);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

