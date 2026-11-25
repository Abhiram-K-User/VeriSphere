"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ShieldCheck,
  ArrowRight,
  Github,
  CheckCircle2,
  User,
  Mail,
  Upload,
  FileText,
  Trash2,
  Layers,
  Coins,
  Building2,
  Loader2,
  XCircle,
  ExternalLink,
  Sparkles,
  FileDown,
} from "lucide-react";
import { FileDropZone } from "@/components/ui/FileDropZone";
import { ProcessingStage } from "@/components/ui/ProcessingStage";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { useAuth } from "@/components/auth-provider";

const steps = ["Upload", "Processing", "Report"] as const;

interface BulkQueuedJob {
  jobId: string;
  candidateId: string;
  fileName: string;
  firstName: string;
  lastName: string;
  email: string;
  githubUrl?: string;
  status: string;
  trustScore?: number | null;
  errorMsg?: string | null;
}

export default function VerifyPage() {
  const router = useRouter();
  const { user, effectiveRole, billing, loading: authLoading, consumeCredits } = useAuth();
  const [apiKey, setApiKey] = useState<string | null>(null);

  const isAdmin = user?.accountType === "admin";
  const isOrg = effectiveRole === "org" || effectiveRole === "admin";
  const [uploadMode, setUploadMode] = useState<"bulk" | "single">("single");

  // Single candidate form state
  const [resumeFiles, setResumeFiles] = useState<File[]>([]);
  const [certificateFiles, setCertificateFiles] = useState<File[]>([]);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [institutionalEmail, setInstitutionalEmail] = useState("");
  const [githubUsername, setGithubUsername] = useState("");

  // Org bulk upload state
  const [bulkFiles, setBulkFiles] = useState<File[]>([]);
  const [batchLabel, setBatchLabel] = useState("");
  const [isBulkSubmitting, setIsBulkSubmitting] = useState(false);
  const [activeBatchId, setActiveBatchId] = useState<string | null>(null);
  const [bulkJobs, setBulkJobs] = useState<BulkQueuedJob[]>([]);
  const [downloadingSummary, setDownloadingSummary] = useState(false);

  // Processing state (single)
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [isFocused, setIsFocused] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [certWarnings, setCertWarnings] = useState<string[]>([]);
  const [generalError, setGeneralError] = useState<string | null>(null);

  useEffect(() => {
    const key = localStorage.getItem("verisphere_api_key");
    if (!key && !authLoading && !user) {
      router.push("/login");
    } else if (key) {
      setApiKey(key);
    } else if (user) {
      localStorage.setItem("verisphere_api_key", "demo-api-key-1234");
      setApiKey("demo-api-key-1234");
    }
  }, [router, authLoading, user]);

  // Default to bulk upload mode for Organization accounts
  useEffect(() => {
    if (isOrg) {
      setUploadMode("bulk");
    } else {
      setUploadMode("single");
    }
  }, [isOrg]);

  // Enforce credit limit immediately on page visit when non-admin user has 0 credits left
  useEffect(() => {
    if (
      !authLoading &&
      user &&
      !isAdmin &&
      !isProcessing &&
      !activeBatchId &&
      billing.credits !== "Unlimited" &&
      billing.credits <= 0
    ) {
      toast.error(
        "You have used all your free monthly verification credits. Please upgrade your plan to continue."
      );
      router.replace("/pricing?reason=limit_reached");
    }
  }, [authLoading, user, isAdmin, billing.credits, isProcessing, activeBatchId, router]);

  // Poll bulk batch jobs live
  useEffect(() => {
    if (!activeBatchId || !apiKey) return;

    const allDone =
      bulkJobs.length > 0 &&
      bulkJobs.every((j) => j.status === "COMPLETED" || j.status === "FAILED");
    if (allDone) return;

    const interval = setInterval(async () => {
      try {
        const res = await fetch(
          `http://localhost:4000/api/verification/dashboard?batchId=${encodeURIComponent(activeBatchId)}`,
          { headers: { "x-api-key": apiKey } }
        );
        if (!res.ok) return;
        const serverJobs = await res.json();
        if (!Array.isArray(serverJobs)) return;

        setBulkJobs((prev) =>
          prev.map((item) => {
            const match = serverJobs.find((sj: any) => sj.id === item.jobId);
            if (!match) return item;
            return {
              ...item,
              status: match.status,
              trustScore: match.report?.trustScore ?? null,
              errorMsg: match.errorMsg ?? null,
            };
          })
        );
      } catch {
        // ignore transient polling error
      }
    }, 2500);

    return () => clearInterval(interval);
  }, [activeBatchId, apiKey, bulkJobs]);

  const validateSingle = () => {
    const newErrors: Record<string, string> = {};
    if (!firstName.trim()) newErrors.firstName = "First name is required";
    if (!lastName.trim()) newErrors.lastName = "Last name is required";

    if (!email.trim()) {
      newErrors.email = "Email is required";
    } else if (!/\S+@\S+\.\S+/.test(email)) {
      newErrors.email = "Please enter a valid email address";
    }

    if (institutionalEmail.trim() && !/\S+@\S+\.\S+/.test(institutionalEmail)) {
      newErrors.institutionalEmail = "Please enter a valid institutional email address";
    }

    if (resumeFiles.length === 0) {
      newErrors.resume = "Resume PDF is required for verification";
    }

    if (!githubUsername.trim()) {
      newErrors.github = "GitHub username is required for skill validation";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSingleSubmit = async () => {
    setGeneralError(null);
    setCertWarnings([]);

    if (!validateSingle()) {
      return;
    }

    // Check & deduct 1 verification credit before launching pipeline
    const creditCheck = consumeCredits(1);
    if (!creditCheck.allowed) {
      toast.error(
        "No verification credits remaining. Upgrade your plan to run more verifications."
      );
      router.push("/pricing?reason=limit_reached");
      return;
    }

    if (creditCheck.remaining !== "Unlimited") {
      toast.info(
        `1 verification credit used. ${creditCheck.remaining} credit${
          creditCheck.remaining === 1 ? "" : "s"
        } remaining this month.`
      );
    }

    setIsProcessing(true);
    setProgress(10);

    try {
      const certWarningsList: string[] = [];
      const certPromises = certificateFiles.map(async (file) => {
        try {
          const certFormData = new FormData();
          certFormData.append("certificate", file);

          const certRes = await fetch("http://localhost:4000/api/forensics/analyze", {
            method: "POST",
            body: certFormData,
            headers: { "x-api-key": apiKey || "" },
          });

          if (!certRes.ok) {
            certWarningsList.push(`Certificate "${file.name}" ignored (HTTP ${certRes.status})`);
            return null;
          }

          const certData = await certRes.json();
          if (certData.success && certData.data) {
            certData.data.title = file.name;
            certData.data.issuer = certData.data.metadata?.creator || "Unknown Issuer";
            return certData.data;
          }
          return null;
        } catch (e: any) {
          certWarningsList.push(`Could not process "${file.name}": ${e.message || e}`);
          return null;
        }
      });

      const certResults =
        certificateFiles.length > 0 ? await Promise.all(certPromises) : [];
      const certificateAnalyses = certResults.filter(Boolean);
      if (certWarningsList.length > 0) {
        setCertWarnings(certWarningsList);
      }

      const formData = new FormData();
      formData.append("firstName", firstName);
      formData.append("lastName", lastName);
      formData.append("email", email);
      if (institutionalEmail.trim() !== "") {
        formData.append("institutionalEmail", institutionalEmail.trim());
      }
      formData.append("githubUsername", githubUsername);
      if (resumeFiles.length > 0) {
        formData.append("resumeFile", resumeFiles[0]);
      }
      if (certificateAnalyses.length > 0) {
        formData.append("certificateAnalyses", JSON.stringify(certificateAnalyses));
      }

      const res = await fetch("http://localhost:4000/api/verification/intake", {
        method: "POST",
        headers: { "x-api-key": apiKey || "" },
        body: formData,
      });

      if (!res.ok) {
        let intakeError = "Failed to submit candidate for verification.";
        try {
          const errJson = await res.json();
          if (errJson.error) intakeError = errJson.error;
        } catch {}
        throw new Error(intakeError);
      }

      const data = await res.json();
      const jobId = data.jobId;
      setProgress(30);

      const pollInterval = setInterval(async () => {
        try {
          setProgress((p) => Math.min(p + 5, 90));
          const statusRes = await fetch(
            `http://localhost:4000/api/verification/jobs/${jobId}/status`,
            { headers: { "x-api-key": apiKey || "" } }
          );
          const statusData = await statusRes.json();

          if (statusData.status === "COMPLETED") {
            clearInterval(pollInterval);
            setProgress(100);
            setTimeout(() => {
              router.push(`/report/${jobId}`);
            }, 600);
          } else if (statusData.status === "FAILED") {
            clearInterval(pollInterval);
            setGeneralError(
              "Verification job failed: " +
                (statusData.errorMsg || "An unknown error occurred.")
            );
            setIsProcessing(false);
          }
        } catch (e) {
          console.error("Polling error", e);
        }
      }, 2000);
    } catch (err: any) {
      console.error(err);
      setGeneralError(err.message || "An unexpected error occurred during submission.");
      setIsProcessing(false);
    }
  };

  const handleBulkFileSelection = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(e.target.files || []).filter(
      (f) => f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf")
    );
    if (selected.length === 0) {
      toast.error("Please select PDF resume files.");
      return;
    }
    setBulkFiles((prev) => {
      const existingNames = new Set(prev.map((f) => `${f.name}-${f.size}`));
      const uniqueNew = selected.filter((f) => !existingNames.has(`${f.name}-${f.size}`));
      return [...prev, ...uniqueNew].slice(0, 50);
    });
    e.target.value = "";
  };

  const handleBulkDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const dropped = Array.from(e.dataTransfer.files || []).filter(
      (f) => f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf")
    );
    if (dropped.length === 0) {
      toast.error("Only PDF resume files are supported for bulk verification.");
      return;
    }
    setBulkFiles((prev) => {
      const existingNames = new Set(prev.map((f) => `${f.name}-${f.size}`));
      const uniqueNew = dropped.filter((f) => !existingNames.has(`${f.name}-${f.size}`));
      return [...prev, ...uniqueNew].slice(0, 50);
    });
  };

  const handleBulkSubmit = async () => {
    setGeneralError(null);
    if (bulkFiles.length === 0) {
      setGeneralError("Please add at least one PDF resume to start a batch verification.");
      return;
    }

    const creditCheck = consumeCredits(bulkFiles.length);
    if (!creditCheck.allowed) {
      toast.error(
        `This batch requires ${bulkFiles.length} credits, but you only have ${creditCheck.remaining} remaining. Upgrade to continue.`
      );
      router.push("/pricing?reason=limit_reached");
      return;
    }

    setIsBulkSubmitting(true);
    try {
      const formData = new FormData();
      for (const file of bulkFiles) {
        formData.append("resumeFiles", file);
      }
      if (user?.email) {
        formData.append("orgEmail", user.email);
      }
      if (batchLabel.trim()) {
        formData.append("label", batchLabel.trim());
      }

      const res = await fetch("http://localhost:4000/api/verification/intake/bulk", {
        method: "POST",
        headers: { "x-api-key": apiKey || "" },
        body: formData,
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Bulk batch submission failed.");
      }

      setActiveBatchId(data.batch.id);
      setBulkJobs(
        (data.jobs || []).map((j: any) => ({
          ...j,
          status: "ANALYZING",
          trustScore: null,
        }))
      );
      toast.success(
        `Batch created! Auto-extracted ${data.jobs.length} candidate profile${
          data.jobs.length === 1 ? "" : "s"
        } from PDFs.`
      );
    } catch (err: any) {
      setGeneralError(err.message || "Failed to start bulk verification.");
    } finally {
      setIsBulkSubmitting(false);
    }
  };

  const handleDownloadBatchSummary = async () => {
    if (!activeBatchId || !apiKey) return;
    setDownloadingSummary(true);
    const toastId = toast.loading("Generating Batch Summary PDF...");
    try {
      const res = await fetch(
        `http://localhost:4000/api/verification/batches/${encodeURIComponent(activeBatchId)}/summary/pdf`,
        { headers: { "x-api-key": apiKey } }
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `VeriSphere_Batch_Summary_${activeBatchId.slice(0, 6)}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success("Batch Summary PDF downloaded!", { id: toastId });
    } catch {
      toast.error("Failed to generate batch summary PDF.", { id: toastId });
    } finally {
      setDownloadingSummary(false);
    }
  };

  const currentStep = isProcessing || activeBatchId ? 1 : 0;

  if (apiKey === null) return null;

  const completedBulkCount = bulkJobs.filter((j) => j.status === "COMPLETED").length;

  return (
    <div className="min-h-screen bg-[var(--bg-subtle)]">
      <div className="max-w-3xl mx-auto py-10 px-6">
        {/* Credits & Account Banner */}
        <div className="mb-6 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border)] px-5 py-3.5 flex flex-wrap items-center justify-between gap-3 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[var(--brand-blue-light)] text-[var(--brand-blue)] flex items-center justify-center shrink-0">
              {isOrg ? <Building2 size={18} /> : <Coins size={18} />}
            </div>
            <div>
              <div className="text-xs font-bold text-[var(--text-primary)] flex items-center gap-2">
                <span>
                  {isAdmin
                    ? "Platform Admin Workspace"
                    : isOrg
                    ? "Organization Workspace"
                    : "Individual Free Plan"}
                </span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold uppercase bg-[var(--brand-blue-light)] text-[var(--brand-blue)]">
                  {billing.planName}
                </span>
              </div>
              <div className="text-xs text-[var(--text-secondary)]">
                {billing.credits === "Unlimited" ? (
                  <span>
                    {isAdmin
                      ? "Unlimited admin testing credits · No monthly cap"
                      : "Unlimited verifications available"}
                  </span>
                ) : (
                  <span>
                    <strong className="text-[var(--text-primary)]">
                      {billing.credits} / {billing.creditsLimit}
                    </strong>{" "}
                    credits remaining · Resets {billing.renewalDate}
                  </span>
                )}
              </div>
            </div>
          </div>

          <Link
            href="/pricing"
            className="text-xs font-semibold text-[var(--brand-blue)] hover:underline inline-flex items-center gap-1"
          >
            <Sparkles size={13} />
            <span>Upgrade Plan</span>
          </Link>
        </div>

        {/* Mode Switcher for Organizations */}
        {isOrg && !isProcessing && !activeBatchId && (
          <div className="grid grid-cols-2 gap-2 p-1.5 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border)] mb-8 shadow-sm">
            <button
              type="button"
              onClick={() => {
                setUploadMode("bulk");
                setGeneralError(null);
              }}
              className={`py-3 px-4 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 transition-all ${
                uploadMode === "bulk"
                  ? "bg-[var(--brand-blue)] text-white shadow-sm"
                  : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              }`}
            >
              <Layers size={16} />
              <span>Bulk Resume Upload (Org)</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setUploadMode("single");
                setGeneralError(null);
              }}
              className={`py-3 px-4 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 transition-all ${
                uploadMode === "single"
                  ? "bg-[var(--brand-blue)] text-white shadow-sm"
                  : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              }`}
            >
              <User size={16} />
              <span>Single Candidate</span>
            </button>
          </div>
        )}

        {/* Breadcrumb Steps (single mode) */}
        {uploadMode === "single" && !activeBatchId && (
          <div className="flex items-center justify-center gap-3 mb-8">
            {steps.map((step, i) => {
              const isActive = i === currentStep;
              const isDone = i < currentStep;
              return (
                <div key={step} className="flex items-center gap-3">
                  <div className="flex items-center gap-2">
                    <motion.div
                      animate={{
                        backgroundColor: isDone
                          ? "var(--verified)"
                          : isActive
                          ? "var(--brand-blue)"
                          : "var(--bg-muted)",
                        scale: isActive ? 1.1 : 1,
                      }}
                      transition={{ duration: 0.3, ease: "easeOut" }}
                      className="w-6 h-6 rounded-full flex items-center justify-center"
                    >
                      {isDone ? (
                        <CheckCircle2 size={14} className="text-white" />
                      ) : (
                        <span
                          className={`text-[10px] font-bold ${
                            isActive ? "text-white" : "text-[var(--text-tertiary)]"
                          }`}
                        >
                          {i + 1}
                        </span>
                      )}
                    </motion.div>
                    <span
                      className="text-sm"
                      style={{
                        color: isActive
                          ? "var(--brand-blue)"
                          : isDone
                          ? "var(--verified)"
                          : "var(--text-tertiary)",
                        fontWeight: isActive ? 600 : 400,
                      }}
                    >
                      {step}
                    </span>
                  </div>
                  {i < steps.length - 1 && (
                    <div className="w-8 h-px bg-[var(--border-strong)]" />
                  )}
                </div>
              );
            })}
          </div>
        )}

        <AnimatePresence mode="wait">
          {/* BULK LIVE BATCH MONITOR */}
          {activeBatchId ? (
            <motion.div
              key="bulk-monitor"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-[var(--bg-surface)] shadow-[var(--shadow-lg)] rounded-3xl p-8 border border-[var(--border)]"
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-[var(--border)]">
                <div>
                  <div className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-[var(--brand-blue)] mb-1">
                    <Layers size={14} />
                    <span>Batch Verification In Progress</span>
                  </div>
                  <h2 className="text-xl font-bold text-[var(--text-primary)]">
                    {completedBulkCount} of {bulkJobs.length} candidates verified
                  </h2>
                  <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                    Names, emails, and GitHub profiles were automatically extracted from the uploaded PDFs.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  <button
                    type="button"
                    disabled={downloadingSummary}
                    onClick={handleDownloadBatchSummary}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-[var(--bg-subtle)] border border-[var(--border-strong)] text-[var(--text-primary)] hover:bg-[var(--bg-muted)] disabled:opacity-60 text-xs font-semibold transition-colors"
                  >
                    {downloadingSummary ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      <FileDown size={14} />
                    )}
                    <span>Batch Summary PDF</span>
                  </button>
                  <Link
                    href={`/dashboard?batchId=${encodeURIComponent(activeBatchId)}`}
                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[var(--brand-blue)] text-white text-xs font-semibold hover:bg-blue-700 transition-colors shrink-0"
                  >
                    <span>Open Batch in Dashboard</span>
                    <ArrowRight size={14} />
                  </Link>
                </div>
              </div>

              <div className="mt-6 space-y-3">
                {bulkJobs.map((job) => (
                  <div
                    key={job.jobId}
                    className="p-4 rounded-2xl bg-[var(--bg-subtle)] border border-[var(--border)] flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-sm text-[var(--text-primary)] truncate">
                          {job.firstName} {job.lastName}
                        </span>
                        <span className="text-[11px] font-mono text-[var(--text-tertiary)] truncate">
                          ({job.fileName})
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1 text-xs text-[var(--text-secondary)]">
                        <span className="inline-flex items-center gap-1">
                          <Mail size={12} /> {job.email}
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <Github size={12} />{" "}
                          {job.githubUrl ? (
                            <span className="text-[var(--brand-blue)] font-mono">
                              {job.githubUrl.replace("https://github.com/", "@")}
                            </span>
                          ) : (
                            <span className="text-[var(--warning)]">No GitHub URL found in PDF</span>
                          )}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                      {job.status === "COMPLETED" ? (
                        <>
                          <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-[var(--verified-bg)] text-[var(--verified)]">
                            Score: {job.trustScore ?? "—"}
                          </span>
                          <Link
                            href={`/report/${job.jobId}`}
                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[var(--brand-blue)] text-white text-xs font-semibold hover:opacity-95"
                          >
                            Report <ExternalLink size={12} />
                          </Link>
                        </>
                      ) : job.status === "FAILED" ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-[var(--danger-bg)] text-[var(--danger)]">
                          <XCircle size={13} /> Failed
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-[var(--brand-blue-light)] text-[var(--brand-blue)]">
                          <Loader2 size={13} className="animate-spin" /> Analyzing
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-6 pt-5 border-t border-[var(--border)] flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => {
                    setActiveBatchId(null);
                    setBulkJobs([]);
                    setBulkFiles([]);
                    setBatchLabel("");
                  }}
                  className="text-xs font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                >
                  ← Upload Another Batch
                </button>
                <Link
                  href="/dashboard"
                  className="text-xs font-semibold text-[var(--brand-blue)] hover:underline"
                >
                  Go to Organization Dashboard
                </Link>
              </div>
            </motion.div>
          ) : isOrg && uploadMode === "bulk" ? (
            /* ORG BULK UPLOAD FORM */
            <motion.div
              key="bulk-form"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -16 }}
              className="bg-[var(--bg-surface)] shadow-[var(--shadow-lg)] rounded-3xl p-8 sm:p-10 border border-[var(--border)]"
            >
              <div className="mb-7">
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[var(--brand-blue-light)] text-[var(--brand-blue)] text-xs font-semibold mb-3">
                  <Building2 size={13} />
                  <span>Organization Bulk Verification</span>
                </div>
                <h1 className="text-2xl font-bold text-[var(--text-primary)] tracking-tight">
                  Upload Resumes in Bulk
                </h1>
                <p className="text-sm text-[var(--text-secondary)] mt-1">
                  Drop multiple candidate PDF resumes at once. VeriSphere automatically extracts each
                  candidate&apos;s <strong>name, email address, and GitHub profile</strong> directly
                  from the PDF text &amp; hyperlinks — no manual typing needed.
                </p>
              </div>

              {/* Optional Batch Label */}
              <div className="mb-5">
                <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1.5">
                  Batch Label (Optional)
                </label>
                <input
                  type="text"
                  value={batchLabel}
                  onChange={(e) => setBatchLabel(e.target.value)}
                  placeholder="e.g., Campus Hiring — SWE Interns"
                  className="w-full bg-[var(--bg-subtle)] border border-[var(--border)] focus:border-[var(--brand-blue)] rounded-xl py-2.5 px-4 text-sm text-[var(--text-primary)] outline-none"
                />
              </div>

              {/* Multi-PDF Dropzone */}
              <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={handleBulkDrop}
                className="relative border-2 border-dashed border-[var(--border-strong)] hover:border-[var(--brand-blue)] rounded-2xl p-8 text-center bg-[var(--bg-subtle)]/60 transition-colors"
              >
                <input
                  type="file"
                  accept="application/pdf,.pdf"
                  multiple
                  onChange={handleBulkFileSelection}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                />
                <div className="w-12 h-12 rounded-2xl bg-[var(--brand-blue-light)] text-[var(--brand-blue)] flex items-center justify-center mx-auto mb-3">
                  <Upload size={22} />
                </div>
                <p className="text-sm font-semibold text-[var(--text-primary)]">
                  Drag &amp; drop multiple PDF resumes here, or click to browse
                </p>
                <p className="text-xs text-[var(--text-tertiary)] mt-1">
                  Supports up to 50 PDF files per batch · Auto-extracts Name, Email &amp; GitHub
                </p>
              </div>

              {/* Queued Files List */}
              {bulkFiles.length > 0 && (
                <div className="mt-6">
                  <div className="flex items-center justify-between mb-2.5">
                    <span className="text-xs font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
                      Selected Resumes ({bulkFiles.length})
                    </span>
                    <button
                      type="button"
                      onClick={() => setBulkFiles([])}
                      className="text-xs font-medium text-[var(--danger)] hover:underline"
                    >
                      Clear all
                    </button>
                  </div>
                  <div className="max-h-60 overflow-y-auto space-y-2 pr-1">
                    {bulkFiles.map((file, idx) => (
                      <div
                        key={`${file.name}-${idx}`}
                        className="flex items-center justify-between px-3.5 py-2.5 rounded-xl bg-[var(--bg-subtle)] border border-[var(--border)] text-xs"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <FileText size={15} className="text-[var(--brand-blue)] shrink-0" />
                          <span className="font-medium text-[var(--text-primary)] truncate">
                            {file.name}
                          </span>
                          <span className="text-[var(--text-tertiary)] shrink-0">
                            {(file.size / 1024).toFixed(0)} KB
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() =>
                            setBulkFiles((prev) => prev.filter((_, i) => i !== idx))
                          }
                          className="text-[var(--text-tertiary)] hover:text-[var(--danger)] p-1"
                          aria-label="Remove file"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {generalError && (
                <div className="mt-5 bg-[var(--danger-bg)] border border-[var(--danger)]/30 rounded-xl p-4 text-xs text-[var(--danger)]">
                  {generalError}
                </div>
              )}

              <div className="mt-7">
                <button
                  type="button"
                  onClick={handleBulkSubmit}
                  disabled={isBulkSubmitting || bulkFiles.length === 0}
                  className="w-full py-4 rounded-xl bg-[var(--brand-blue)] hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold text-sm flex items-center justify-center gap-2 shadow-sm transition-all"
                >
                  {isBulkSubmitting ? (
                    <>
                      <Loader2 size={18} className="animate-spin" />
                      <span>Parsing PDFs &amp; Creating Batch...</span>
                    </>
                  ) : (
                    <>
                      <Layers size={18} />
                      <span>
                        Verify Batch ({bulkFiles.length}{" "}
                        {bulkFiles.length === 1 ? "Resume" : "Resumes"})
                      </span>
                      <ArrowRight size={18} />
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          ) : !isProcessing ? (
            /* SINGLE CANDIDATE FORM */
            <motion.div
              key="form"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20, scale: 0.98 }}
              transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
              className="bg-[var(--bg-surface)] shadow-[var(--shadow-lg)] rounded-3xl p-8 sm:p-10 border border-[var(--border)]"
            >
              <div className="mb-8">
                <h1 className="text-2xl font-semibold text-[var(--text-primary)] mb-2 tracking-tight">
                  Submit a candidate for verification
                </h1>
                <p className="text-[var(--text-secondary)]">
                  We&apos;ll cross-reference their resume, GitHub, and certificates in under 90 seconds.
                </p>
              </div>

              <div className="space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-[var(--text-primary)] mb-2">
                      First Name
                    </label>
                    <div className="relative flex items-center">
                      <User className="absolute left-4 text-[var(--text-tertiary)]" size={18} />
                      <input
                        type="text"
                        value={firstName}
                        onChange={(e) => {
                          setFirstName(e.target.value);
                          if (errors.firstName) setErrors((prev) => ({ ...prev, firstName: "" }));
                        }}
                        className="w-full bg-[var(--bg-subtle)] border border-[var(--border)] rounded-xl py-3 pl-12 pr-4 text-[var(--text-primary)] outline-none focus:border-[var(--brand-blue)] transition-colors"
                        placeholder="John"
                      />
                    </div>
                    {errors.firstName && (
                      <p className="text-xs text-[var(--danger)] mt-1.5 ml-1">{errors.firstName}</p>
                    )}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-[var(--text-primary)] mb-2">
                      Last Name
                    </label>
                    <input
                      type="text"
                      value={lastName}
                      onChange={(e) => {
                        setLastName(e.target.value);
                        if (errors.lastName) setErrors((prev) => ({ ...prev, lastName: "" }));
                      }}
                      className="w-full bg-[var(--bg-subtle)] border border-[var(--border)] rounded-xl py-3 px-4 text-[var(--text-primary)] outline-none focus:border-[var(--brand-blue)] transition-colors"
                      placeholder="Doe"
                    />
                    {errors.lastName && (
                      <p className="text-xs text-[var(--danger)] mt-1.5 ml-1">{errors.lastName}</p>
                    )}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-[var(--text-primary)] mb-2">
                    Email
                  </label>
                  <div className="relative flex items-center mb-1">
                    <Mail className="absolute left-4 text-[var(--text-tertiary)]" size={18} />
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => {
                        setEmail(e.target.value);
                        if (errors.email) setErrors((prev) => ({ ...prev, email: "" }));
                      }}
                      className="w-full bg-[var(--bg-subtle)] border border-[var(--border)] rounded-xl py-3 pl-12 pr-4 text-[var(--text-primary)] outline-none focus:border-[var(--brand-blue)] transition-colors"
                      placeholder="john@example.com"
                    />
                  </div>
                  {errors.email && (
                    <p className="text-xs text-[var(--danger)] mt-1.5 mb-3 ml-1">{errors.email}</p>
                  )}

                  <label className="block text-sm font-medium text-[var(--text-primary)] mt-4 mb-2">
                    Institutional Email (Optional)
                  </label>
                  <div className="relative flex items-center">
                    <Mail className="absolute left-4 text-[var(--text-tertiary)]" size={18} />
                    <input
                      type="email"
                      value={institutionalEmail}
                      onChange={(e) => {
                        setInstitutionalEmail(e.target.value);
                        if (errors.institutionalEmail)
                          setErrors((prev) => ({ ...prev, institutionalEmail: "" }));
                      }}
                      className="w-full bg-[var(--bg-subtle)] border border-[var(--border)] rounded-xl py-3 pl-12 pr-4 text-[var(--text-primary)] outline-none focus:border-[var(--brand-blue)] transition-colors"
                      placeholder="john@university.edu"
                    />
                  </div>
                  {errors.institutionalEmail ? (
                    <p className="text-xs text-[var(--danger)] mt-1.5 ml-1">
                      {errors.institutionalEmail}
                    </p>
                  ) : (
                    <p className="text-xs text-[var(--text-tertiary)] mt-2">
                      Providing a .edu or institutional email speeds up academic verification.
                    </p>
                  )}
                </div>

                <div className="border-y border-[var(--border)] py-6 space-y-6">
                  <div>
                    <FileDropZone
                      label="Resume PDF"
                      required
                      onFilesChange={(files) => {
                        setResumeFiles(files);
                        if (errors.resume) setErrors((prev) => ({ ...prev, resume: "" }));
                      }}
                    />
                    {errors.resume && (
                      <p className="text-xs text-[var(--danger)] mt-1 ml-1">{errors.resume}</p>
                    )}
                  </div>

                  <div>
                    <FileDropZone
                      label="Certificates (optional)"
                      multiple
                      onFilesChange={setCertificateFiles}
                    />
                    {certWarnings.length > 0 && (
                      <div className="mt-3 bg-amber-500/10 border border-amber-500/20 rounded-xl p-4 space-y-1.5 text-xs text-amber-500">
                        <p className="font-semibold text-amber-400 mb-1">
                          Some certificates had warnings but submission will proceed:
                        </p>
                        {certWarnings.map((w, idx) => (
                          <div key={idx} className="flex items-start gap-1.5">
                            <span>•</span>
                            <span>{w}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <div className="pt-2">
                  <label className="block text-sm font-medium text-[var(--text-primary)] mb-2">
                    GitHub Username
                  </label>
                  <div className="relative flex items-center">
                    <div className="absolute left-4 text-[var(--text-tertiary)] flex items-center gap-2">
                      <Github size={18} />
                      <span className="font-heading text-sm">github.com/</span>
                    </div>
                    <motion.input
                      type="text"
                      value={githubUsername}
                      onChange={(e) => {
                        setGithubUsername(e.target.value);
                        if (errors.github) setErrors((prev) => ({ ...prev, github: "" }));
                      }}
                      onFocus={() => setIsFocused(true)}
                      onBlur={() => setIsFocused(false)}
                      animate={{
                        boxShadow: isFocused
                          ? "0 0 0 3px rgba(37,99,235,0.12), inset 0 0 0 1px var(--brand-blue)"
                          : "none",
                        borderColor: isFocused ? "var(--brand-blue)" : "var(--border)",
                      }}
                      transition={{ duration: 0.18 }}
                      className="w-full bg-[var(--bg-subtle)] border border-[var(--border)] rounded-xl py-3 pl-[125px] pr-4 text-[var(--text-primary)] font-heading outline-none transition-colors"
                      placeholder="username"
                    />
                  </div>
                  {errors.github && (
                    <p className="text-xs text-[var(--danger)] mt-1.5 ml-1">{errors.github}</p>
                  )}
                </div>

                {generalError && (
                  <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 text-sm text-[var(--danger)]">
                    {generalError}
                  </div>
                )}

                <div className="pt-6">
                  <motion.button
                    onClick={handleSingleSubmit}
                    disabled={isProcessing}
                    whileHover={!isProcessing ? { scale: 1.01, y: -1 } : {}}
                    whileTap={!isProcessing ? { scale: 0.98, y: 0 } : {}}
                    className={`w-full py-4 rounded-xl font-bold flex items-center justify-center gap-2 transition-all duration-200 ${
                      isProcessing
                        ? "bg-[var(--bg-muted)] text-[var(--text-tertiary)] cursor-not-allowed"
                        : "bg-[var(--brand-blue)] text-white hover:bg-blue-700 shadow-sm"
                    }`}
                  >
                    {isProcessing ? "Processing..." : "Initialize Verification"}{" "}
                    <ArrowRight size={18} />
                  </motion.button>
                </div>
              </div>
            </motion.div>
          ) : (
            /* SINGLE PROCESSING SCREEN */
            <motion.div
              key="processing"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-[var(--bg-surface)] shadow-[var(--shadow-lg)] rounded-3xl p-10 border border-[var(--border)] relative overflow-hidden"
            >
              <div className="flex items-center gap-3 mb-10">
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                  className="w-10 h-10 rounded-full bg-[var(--brand-blue-light)] flex items-center justify-center"
                >
                  <ShieldCheck className="text-[var(--brand-blue)]" size={20} />
                </motion.div>
                <div>
                  <h2 className="text-xl font-bold text-[var(--text-primary)]">
                    Analyzing candidate...
                  </h2>
                  <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                    Forensic verification in progress
                  </p>
                </div>
              </div>

              <div className="flex flex-col gap-1 mb-12">
                <ProcessingStage label="Parsing resume claims" delay={0} isActive={isProcessing} />
                <ProcessingStage
                  label="Fetching GitHub repositories"
                  delay={1200}
                  isActive={isProcessing}
                />
                <ProcessingStage
                  label="Cross-referencing skill evidence"
                  delay={2400}
                  isActive={isProcessing}
                />
                <ProcessingStage
                  label="Generating trust report"
                  delay={3600}
                  isActive={isProcessing}
                />
              </div>

              <div className="h-1.5 bg-[var(--bg-subtle)] rounded-full overflow-hidden">
                <motion.div
                  className="h-full rounded-full bg-gradient-to-r from-[var(--brand-blue)] to-blue-400"
                  initial={{ width: "0%" }}
                  animate={{ width: `${progress}%` }}
                  transition={{ ease: "linear", duration: 0.2 }}
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
