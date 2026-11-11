-- ============================================================================
-- 02_triggers_and_functions.sql
-- Triggers, DB functions, and stored procedures for VeriSphere DBMS
-- ============================================================================

-- 1. Audit Log Trigger Function
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

DROP TRIGGER IF EXISTS trg_audit_verification_job ON "VerificationJob";
CREATE TRIGGER trg_audit_verification_job
AFTER INSERT OR UPDATE OR DELETE ON "VerificationJob"
FOR EACH ROW EXECUTE FUNCTION fn_audit_log_trigger();

DROP TRIGGER IF EXISTS trg_audit_report ON "AuditReport";
CREATE TRIGGER trg_audit_report
AFTER INSERT OR UPDATE OR DELETE ON "AuditReport"
FOR EACH ROW EXECUTE FUNCTION fn_audit_log_trigger();

-- 2. Auto-Timestamp Trigger on VerificationJob
CREATE OR REPLACE FUNCTION fn_set_completed_at()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW."status" = 'COMPLETED'::"JobStatus" AND OLD."status" IS DISTINCT FROM 'COMPLETED'::"JobStatus" AND NEW."completedAt" IS NULL THEN
    NEW."completedAt" := NOW();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_set_completed_at ON "VerificationJob";
CREATE TRIGGER trg_set_completed_at
BEFORE UPDATE ON "VerificationJob"
FOR EACH ROW EXECUTE FUNCTION fn_set_completed_at();

-- 3. DB-side Trust Score Function based on RiskIndicator severities
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

-- 4. Stored Procedure to atomically finalize a job
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

