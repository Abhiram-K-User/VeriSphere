// PROPOSED MongoDB schema (mongosh). Every document links to PostgreSQL via jobId (VerificationJob.id, a uuid string).
// Run with mongosh against $MONGODB_URI / $MONGODB_DB.
const linked = (extra, required = []) => ({
  $jsonSchema: {
    bsonType: "object",
    required: ["jobId", ...required],
    properties: { jobId: { bsonType: "string" }, candidateId: { bsonType: "string" }, ...extra },
  },
});

db.createCollection("raw_resumes", {
  validator: linked({ parsedAt: { bsonType: "date" }, doc: { bsonType: "object" } }, ["candidateId", "parsedAt", "doc"]),
});
db.createCollection("forensics_reports", {
  validator: linked({ certificateId: { bsonType: "string" }, rules: { bsonType: "array" }, score: { bsonType: "number" } }, ["rules"]),
});
db.createCollection("github_snapshots", {
  validator: linked({ username: { bsonType: "string" }, fetchedAt: { bsonType: "date" }, payload: { bsonType: "object" } }, ["username", "fetchedAt", "payload"]),
});
db.createCollection("llm_traces", {
  validator: linked(
    {
      provider: { bsonType: "string" },
      model: { bsonType: "string" },
      prompt: { bsonType: "string" },
      response: { bsonType: "string" },
      tokens: { bsonType: "int" },
      latencyMs: { bsonType: "int" },
    },
    ["provider", "model", "prompt"]
  ),
});
db.createCollection("job_events", {
  validator: linked({ step: { bsonType: "string" }, status: { bsonType: "string" }, at: { bsonType: "date" }, meta: { bsonType: "object" } }, ["step", "status", "at"]),
});

["raw_resumes", "forensics_reports", "github_snapshots", "llm_traces", "job_events"].forEach((c) => db[c].createIndex({ jobId: 1 }));
db.raw_resumes.createIndex({ candidateId: 1, parsedAt: -1 });
db.job_events.createIndex({ at: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 90 }); // TTL: 90 days
db.llm_traces.createIndex({ prompt: "text" });
