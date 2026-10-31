# VeriSphere — DBMS + NoSQL Upgrade Plan (Agent Playbook)

Purpose: this file tells an AI agent exactly how to upgrade VeriSphere for the RVCE
**Database Management Systems (CD252IA)** course project. The work has two goals:

1. Turn the thin relational layer into a properly normalized, constraint-rich PostgreSQL design
   that demonstrates core DBMS concepts.
2. Add a **MongoDB** NoSQL component (and optionally Redis) and integrate it with PostgreSQL.

Read the whole file before changing anything. Do the phases in order. After each phase the app
must still build (`pnpm build`) and the verification flow must still work end to end.

---

## 0. Current state (verified from the code)

- Monorepo (pnpm workspaces): `apps/api` (Express/TS), `apps/web`, and `packages/*`
  (`ai-layer`, `forensics-engine`, `github-engine`, `shared-config`, `shared-types`).
- DB: PostgreSQL (Supabase-style: `DATABASE_URL` pooled, `DIRECT_URL` direct) via **Prisma 5**.
  Schema: `packages/shared-config/prisma/schema.prisma`. There is **no `migrations/` folder**
  yet, so the DB has been managed with `prisma db push` or by hand. Decide with the user before
  introducing migrations (Phase 1, step 1).
- Prisma client singleton: `apps/api/src/infrastructure/db/prisma-client.ts`.
- Current models: `Candidate` 1─N `VerificationJob` 1─1 `AuditReport`.
- Weaknesses to fix:
  - Engine outputs are stored as serialized JSON in `String` columns:
    `VerificationJob.certificateDataJson`, `githubMetricsJson`, `resumeDataJson`;
    `AuditReport.riskIndicatorsJson`, `semanticMatchJson`, `academicVerificationJson`.
  - `VerificationJob.status` is a free string (`QUEUED`, `ANALYZING`, `COMPLETED`, ...).
  - No indexes beyond PK and `AuditReport.jobId @unique`; no CHECK constraints; no unique
    email; no roles, audit log, triggers, views or procedures.
- Prisma call sites (must be kept working or updated together):
  - `apps/api/src/application/verification-orchestrator.ts` (report creation around the
    "STEP 7: Persist to Database" block, and status updates in `triggerVerification`)
  - `apps/api/src/index.ts` (candidate and job creation)
  - `apps/api/src/infrastructure/routes/verification-routes.ts` (job listing)
  - `apps/api/src/infrastructure/middleware/auth-middleware.ts`
- Domain types: `apps/api/src/domain/entities.ts`, `interfaces.ts`. Shared types:
  `packages/shared-types`.

Rules for the agent:
- The working tree has uncommitted changes (`schema.prisma`, engines, `start-demo.bat`). Do not
  revert or overwrite them; build on top. Run `git status` first.
- Never put real secrets in files. `.env` is untracked; add new variables to the example env
  file only, with empty values.
- Keep the public API response shapes stable unless the user agrees otherwise. The web app
  reads report fields such as `riskIndicatorsJson`. When normalizing, keep a compatibility layer
  in the API that rebuilds the old JSON shape from the new tables.
- Do not create commits or push unless asked.

---

## Phase 1 — Normalize and harden PostgreSQL

Target ER design (Prisma model names; use `@@map` to snake_case tables if the user wants):

| Model | Key columns | Notes |
|---|---|---|
| `Institution` | id, name, emailDomain (unique), accredited (bool), country | Lookup for academic verification |
| `Candidate` | keep existing + `phone?` | `email` becomes `@unique`; `institutionId?` FK |
| `Education` | id, candidateId FK, institutionId FK, degree, cgpa (Decimal), startYear, endYear | Was inside `resumeDataJson` |
| `Certificate` | id, candidateId FK, jobId FK?, issuer, credentialId, issuedOn, verified (bool) | Was `certificateDataJson` |
| `GithubProfile` | id, candidateId FK (unique), username, publicRepos, followers, fetchedAt | Was `githubMetricsJson` |
| `Repository` | id, profileId FK, name, primaryLanguage, commitCount, lastPushedAt | |
| `Skill` | id, name (unique), category | Lookup |
| `CandidateSkill` | candidateId FK, skillId FK, proficiency (1-5), source enum, `@@id([candidateId, skillId, source])` | M:N resolved table |
| `VerificationJob` | keep existing; `status` becomes enum `JobStatus`; `mongoRef String?` | See Phase 3 |
| `RiskIndicator` | id, reportId FK, type, severity enum, description, evidenceRef? | Replaces `riskIndicatorsJson` |
| `Contradiction` | id, reportId FK, description | Replaces `contradictions String[]` |
| `AuditReport` | id, jobId (unique FK), findingsSummary, trustScore Int, prevHash?, hash? | Keeps the summary and score |
| `AppUser` | id, email (unique), passwordHash, role enum (`ADMIN`,`RECRUITER`,`VIEWER`) | Recruiter accounts and RBAC |
| `AuditLog` | id, actorId?, action, entity, entityId, at, detailsJson | Filled by triggers (Phase 2) |

Enums: `JobStatus { QUEUED ANALYZING COMPLETED FAILED }`, `Severity { LOW MEDIUM HIGH }`,
`SkillSource { RESUME GITHUB CERTIFICATE }`, `Role { ADMIN RECRUITER VIEWER }`.
Confirm the existing status strings in the orchestrator before fixing the enum values.

Steps:
1. **Ask the user**: adopt `prisma migrate` (recommended, create a baseline migration from the
   live DB with `prisma migrate diff` / `migrate resolve`) or keep `db push`. Use `DIRECT_URL`
   for migrations. Do not run destructive commands against the shared Supabase DB without the
   user's approval. Prefer a local Postgres for development.
2. Edit `schema.prisma` to add the models above. Add indexes:
   `@@index([candidateId])`, `@@index([status])`, `@@index([status, createdAt])` on
   `VerificationJob`; `@@index([reportId])` on `RiskIndicator`; `@@index([candidateId])` on
   `Education`, `Certificate`.
3. Add CHECK constraints in raw SQL (Prisma cannot express them): put them in a migration file
   or `packages/shared-config/prisma/sql/01_constraints.sql`. Examples:
   `CHECK ("trustScore" BETWEEN 0 AND 100)`, `CHECK (cgpa BETWEEN 0 AND 10)`,
   `CHECK ("endYear" >= "startYear")`.
4. Data migration script (`packages/shared-config/prisma/scripts/backfill-normalize.ts`) that
   reads the old `*Json` columns and fills the new tables, idempotently. Only after it is
   verified, stop writing to the JSON columns. Drop them in a later, separate migration.
5. Update the orchestrator's "STEP 7: Persist to Database" block to write
   `AuditReport` + `RiskIndicator[]` + `Contradiction[]` (+ `Education`, `Certificate`,
   `GithubProfile`, `Repository`, `CandidateSkill` where data is available) **inside one
   `prisma.$transaction`**. If any write fails, everything rolls back and the job goes to
   `FAILED` with `errorMsg` set.
6. Add a mapper (for example `apps/api/src/application/services/report-mapper.ts`) that
   rebuilds the legacy report shape (`riskIndicatorsJson`, `semanticMatchJson`, ...) from
   relational rows so the existing routes and web app keep working.

## Phase 2 — Advanced DBMS features (raw SQL, kept in version control)

Put all SQL in `packages/shared-config/prisma/sql/` with numbered files and apply them via a
migration or a small runner script. Document how to re-apply them in the README section below.

1. **Trigger, audit**: `AFTER INSERT OR UPDATE OR DELETE` on `VerificationJob` and
   `AuditReport` writes a row to `AuditLog`.
2. **Trigger, timestamps**: `BEFORE UPDATE` on `VerificationJob` sets `completedAt` when
   `status` becomes `COMPLETED`.
3. **Trigger or function, trust score**: `compute_trust_score(job_id uuid) RETURNS int`
   derives the score from `RiskIndicator` severities (weights: HIGH 25, MEDIUM 10, LOW 3,
   floor 0). A trigger on `RiskIndicator` insert recalculates `AuditReport.trustScore`.
   Keep the AI-derived score as the default in code; this function is the DB-side check the
   report can cite.
4. **Stored procedure**: `sp_finalize_job(job_id, ...)` that inserts the report and flips the
   status atomically (demonstrates procedures; the app may still use `$transaction`).
5. **Views**:
   - `v_candidate_risk_summary` (candidate, latest job, trust score, count of HIGH risks)
   - `MATERIALIZED VIEW mv_recruiter_dashboard` (per-day job counts, average score) plus a
     `REFRESH MATERIALIZED VIEW` call after job completion or on a schedule.
6. **Indexes for the demo**: create at least one composite index and one GIN index (for
   example on `Skill.name` with `pg_trgm`, or on a `tsvector` column for report search).
   Save `EXPLAIN ANALYZE` output before and after in `docs/db/index-benchmark.md`.
7. **Roles and privileges**: SQL creating `verisphere_admin`, `verisphere_recruiter`,
   `verisphere_readonly` with `GRANT`/`REVOKE` (recruiter cannot `DELETE`; readonly can only
   `SELECT` from views). Mirror this with `AppUser.role` checks in
   `auth-middleware.ts`.
8. **Transaction/concurrency demo**: `docs/db/transactions-demo.md` with two-session SQL
   showing isolation levels (READ COMMITTED vs SERIALIZABLE) and a deadlock example with the
   fix (consistent lock ordering).
9. **Tamper-evident hash chain (optional, "innovative")**: on `AuditReport` insert, compute
   `hash = sha256(prevHash || canonical(report fields))`, where `prevHash` is the previous
   report's `hash` for the same candidate. Add `GET /verify/:reportId/integrity` that
   recomputes and compares.

## Phase 3 — MongoDB (NoSQL) component

**Division of data.** PostgreSQL keeps structured, integrity-critical data. MongoDB keeps
flexible, large or append-only data:

| Collection | Content | Key fields |
|---|---|---|
| `raw_resumes` | Full parsed resume document, variable structure | `jobId`, `candidateId`, `parsedAt`, `doc` |
| `forensics_reports` | PDF/metadata analysis, EXIF, rule-by-rule results (from `packages/forensics-engine`) | `jobId`, `certificateId?`, `rules[]`, `score` |
| `github_snapshots` | Raw GitHub API responses, commit timeline, language stats (from `packages/github-engine`) | `jobId`, `username`, `fetchedAt`, `payload` |
| `llm_traces` | Prompt, response, model, token counts, latency (from `packages/ai-layer`, Groq provider) | `jobId`, `provider`, `model`, `prompt`, `response`, `tokens`, `latencyMs` |
| `job_events` | Timeline of pipeline steps | `jobId`, `step`, `status`, `at`, `meta` |

Steps:
1. Add dependency `mongodb` (or `mongoose`; pick one, `mongodb` driver preferred for less
   magic) to `apps/api`. Add env vars `MONGODB_URI` and `MONGODB_DB` to the example env file
   with empty values. Ask the user whether they use MongoDB Atlas or local Docker; provide a
   `docker-compose.yml` with `mongo:7` for local development if they choose local.
2. Create `apps/api/src/infrastructure/db/mongo-client.ts` mirroring the style of
   `prisma-client.ts` (cached singleton, lazy connect, log only errors in production).
3. Define repository interfaces in `apps/api/src/domain/interfaces.ts` (for example
   `EvidenceStore`) and implement `MongoEvidenceStore` in
   `apps/api/src/infrastructure/db/`. The orchestrator depends on the interface, not the
   driver, so tests can use an in-memory fake.
4. Create indexes at startup (idempotent `createIndex`): `{ jobId: 1 }` on every collection,
   `{ candidateId: 1, parsedAt: -1 }` on `raw_resumes`, a TTL index on `job_events`
   (for example 90 days), optional text index on `llm_traces.prompt`.
5. Add JSON-schema validators (`$jsonSchema`) on collections so "schemaless" still has
   guardrails; document this in the report.
6. Hook writes into the orchestrator at each pipeline step (`verification-orchestrator.ts`):
   after resume parse → `raw_resumes`; after GitHub fetch → `github_snapshots`; after
   forensics → `forensics_reports`; each LLM call → `llm_traces`; each step → `job_events`.
   `packages/ai-layer` should expose a hook or callback for traces so the package does not
   import the API app.
7. **Failure semantics**: Mongo writes for evidence are best-effort *before* the Postgres
   transaction. Order: (a) write evidence to Mongo, (b) run the Postgres `$transaction`,
   (c) on Postgres failure, delete or mark that job's Mongo documents `orphaned: true`.
   Never let a Mongo outage block verification: log and continue, and set
   `VerificationJob.mongoRef = null`.
8. Store `mongoRef` (ObjectId string of a small "evidence manifest" document listing the
   other documents) on `VerificationJob`.

### Integration API
- `GET /jobs/:id/report` returns the relational summary from PostgreSQL (score, risks,
  contradictions) and, when `?include=evidence`, attaches the Mongo evidence using `jobId`.
- `GET /analytics/risk-patterns` uses a Mongo **aggregation pipeline** (for example most
  frequent failing forensics rules, GitHub language distribution across candidates).
- Keep the join logic in one service (`apps/api/src/application/services/`), not in routes.

### Optional: Redis
Your codebase already references Redis/Bull. If used: cache GitHub API responses (TTL 1 h),
rate-limit per API key, and use it as the job queue. Document it as the key-value NoSQL
type next to MongoDB's document type. Only add it if the user asks; do not expand scope
silently.

## Phase 4 — Tests and verification

- Unit tests: mapper (relational → legacy shape), score function parity (TS vs SQL),
  `MongoEvidenceStore` with a fake.
- Integration tests against a disposable Postgres and Mongo (Docker): full pipeline,
  transaction rollback on injected failure, Mongo-down fallback.
- SQL tests: trigger fires (audit row appears), CHECK rejects `trustScore = 101`, cascade
  deletes work, roles cannot exceed privileges.
- Manual smoke run with `start-demo.bat` / `pnpm dev`: submit a candidate, confirm the report
  renders and both stores contain data. Report the exact commands and outputs; if anything
  cannot be run (no DB access), say so instead of claiming success.

## Phase 5 — Deliverables for the course

1. Updated ER diagram (Mermaid in `docs/db/er.md`) covering all Postgres tables plus a
   second diagram showing Mongo collections and the `jobId` links.
2. `docs/db/normalization.md`: functional dependencies and 1NF → 3NF steps for the old JSON
   columns.
3. `docs/db/sql-showcase.md`: every trigger, view, procedure, index benchmark, role script,
   with sample output.
4. Synopsis text (max 2 pages) for `ISE_DBMS_Synopsis_2026.docx`, with these sections:
   Introduction, Existing System, Proposed System, Relational Database Structure,
   RDBMS/NoSQL Integration, Societal Concern, Innovative Experiment. Use the table in
   Phase 3 for the NoSQL section, and mention LLM semantic matching, PDF forensics, OCR and
   the hash chain under Innovative Experiment. Team: 1RV24IS006 Abhijay M S,
   1RV24IS007 Abhiram K.

## Suggested implementation order (smallest useful increments)

1. Phase 1 steps 2-6 (schema, transaction, mapper).
2. Phase 2 items 1, 3, 5, 6 (audit trigger, score function, views, index demo).
3. Phase 3 with `raw_resumes`, `forensics_reports`, `llm_traces` first.
4. Remaining Phase 2 items, Redis and the hash chain if time allows.
5. Phase 4 and 5.

## Open questions to confirm with the user before starting
- Local Postgres or the shared Supabase DB for development? (Recommend local.)
- `prisma migrate` or `db push`?
- MongoDB Atlas or local Docker? Redis in scope or not?
- Is it acceptable to drop the old `*Json` columns after the backfill is verified?
