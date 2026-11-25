"use client";

import { useState, useEffect, Suspense, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  Search,
  CheckCircle2,
  Clock,
  AlertTriangle,
  XCircle,
  ChevronRight,
  BarChart2,
  Users,
  TrendingUp,
  Zap,
  Layers,
  Calendar,
  FolderOpen,
  Loader2,
  FileDown,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/components/auth-provider";
import { useVerisphereStore, CachedBatchSummary } from "@/hooks/use-store";

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { color: string; icon: React.ReactNode; label: string }> = {
    COMPLETED: {
      color: "bg-emerald-100 text-emerald-700",
      icon: <CheckCircle2 size={12} />,
      label: "Completed",
    },
    FAILED: {
      color: "bg-red-100 text-red-700",
      icon: <XCircle size={12} />,
      label: "Failed",
    },
    ANALYZING: {
      color: "bg-blue-100 text-blue-700",
      icon: <Zap size={12} />,
      label: "Analyzing",
    },
    QUEUED: {
      color: "bg-slate-100 text-slate-600",
      icon: <Clock size={12} />,
      label: "Queued",
    },
    DOWNLOADING: {
      color: "bg-amber-100 text-amber-700",
      icon: <Clock size={12} />,
      label: "Downloading",
    },
  };
  const s = map[status] || map["QUEUED"];
  return (
    <span
      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold ${s.color}`}
    >
      {s.icon} {s.label}
    </span>
  );
}

function ScoreRing({ score }: { score: number }) {
  const color = score >= 75 ? "#10B981" : score >= 50 ? "#F59E0B" : "#EF4444";
  const circ = 2 * Math.PI * 18;
  return (
    <div className="relative w-12 h-12">
      <svg viewBox="0 0 44 44" className="w-full h-full -rotate-90">
        <circle cx="22" cy="22" r="18" fill="none" stroke="var(--border)" strokeWidth="4" />
        <circle
          cx="22"
          cy="22"
          r="18"
          fill="none"
          stroke={color}
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray={`${circ}`}
          strokeDashoffset={`${circ * (1 - score / 100)}`}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-xs font-bold" style={{ color }}>
          {score}
        </span>
      </div>
    </div>
  );
}

function formatBatchTitle(isoDate: string): { dateDay: string; time: string } {
  const d = new Date(isoDate);
  const shortDate = d.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
  });
  const shortDay = d.toLocaleDateString("en-IN", {
    weekday: "short",
  });
  const timeStr = d.toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
  return {
    dateDay: `${shortDate}, ${shortDay}`,
    time: timeStr,
  };
}

function DashboardContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialBatchParam = searchParams.get("batchId");
  const { user, effectiveRole, loading: authLoading } = useAuth();
  const isOrg = effectiveRole === "org" || effectiveRole === "admin";

  // Instant cache from Zustand (0ms render on tab switches)
  const {
    dashboardJobs,
    dashboardBatches,
    dashboardLoaded,
    dashboardLastFetchedAt,
    setDashboardData,
  } = useVerisphereStore();

  const [apiKey, setApiKey] = useState<string | null>(() =>
    typeof window !== "undefined" ? localStorage.getItem("verisphere_api_key") : null
  );
  const [selectedBatchId, setSelectedBatchId] = useState<string | null>(initialBatchParam);
  const [batchScopedJobs, setBatchScopedJobs] = useState<any[] | null>(null);
  const [loading, setLoading] = useState(!dashboardLoaded);
  const [loadingBatchJobs, setLoadingBatchJobs] = useState(false);
  const [downloadingBatchId, setDownloadingBatchId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");

  const didFetchRef = useRef(false);

  useEffect(() => {
    if (initialBatchParam) {
      setSelectedBatchId(initialBatchParam);
    }
  }, [initialBatchParam]);

  // Single deduplicated fetch on mount (instant render from Zustand cache + skip redundant refetch within 15s unless jobs are active)
  useEffect(() => {
    const key = localStorage.getItem("verisphere_api_key");
    if (!key && !authLoading && !user) {
      router.push("/login");
      return;
    }
    const effectiveKey = key || (user ? "demo-api-key-1234" : null);
    if (!effectiveKey) return;
    if (!key) localStorage.setItem("verisphere_api_key", effectiveKey);
    if (apiKey !== effectiveKey) setApiKey(effectiveKey);

    if (didFetchRef.current) return;
    didFetchRef.current = true;

    const hasInFlightJobs = dashboardJobs.some(
      (j) => j.status === "ANALYZING" || j.status === "QUEUED" || j.status === "DOWNLOADING"
    );
    const cacheFresh =
      dashboardLoaded && !hasInFlightJobs && Date.now() - dashboardLastFetchedAt < 15_000;
    if (cacheFresh) {
      setLoading(false);
      return;
    }

    Promise.all([
      fetch("http://localhost:4000/api/verification/dashboard", {
        headers: { "x-api-key": effectiveKey },
      }).then((r) => r.json()),
      fetch("http://localhost:4000/api/verification/batches", {
        headers: { "x-api-key": effectiveKey },
      })
        .then((r) => (r.ok ? r.json() : []))
        .catch(() => []),
    ])
      .then(([jobsData, batchesData]) => {
        const list = Array.isArray(jobsData) ? jobsData : [];
        const batchList: CachedBatchSummary[] = Array.isArray(batchesData) ? batchesData : [];
        setDashboardData(list, batchList);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [
    router,
    authLoading,
    user,
    apiKey,
    dashboardLoaded,
    dashboardLastFetchedAt,
    dashboardJobs,
    setDashboardData,
  ]);

  // Fetch exact batch records when a specific batch card is selected
  useEffect(() => {
    if (!apiKey) return;
    if (!selectedBatchId) {
      setBatchScopedJobs(null);
      return;
    }

    // Show immediate local filter first (0ms), then confirm from DB
    const localFiltered = dashboardJobs.filter((j) => j.batchId === selectedBatchId);
    setBatchScopedJobs(localFiltered);

    setLoadingBatchJobs(localFiltered.length === 0);
    fetch(
      `http://localhost:4000/api/verification/dashboard?batchId=${encodeURIComponent(selectedBatchId)}`,
      { headers: { "x-api-key": apiKey } }
    )
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) {
          setBatchScopedJobs(data);
        }
        setLoadingBatchJobs(false);
      })
      .catch(() => setLoadingBatchJobs(false));
  }, [selectedBatchId, apiKey]);

  const handleDownloadBatchSummary = async (batchId: string) => {
    if (!apiKey) return;
    setDownloadingBatchId(batchId);
    const toastId = toast.loading("Generating Executive Batch Summary PDF...");
    try {
      const res = await fetch(
        `http://localhost:4000/api/verification/batches/${encodeURIComponent(batchId)}/summary/pdf`,
        { headers: { "x-api-key": apiKey } }
      );
      if (!res.ok) {
        throw new Error(`Failed to generate summary PDF (HTTP ${res.status})`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `VeriSphere_Batch_Summary_${batchId.slice(0, 6)}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success("Batch Summary PDF downloaded!", { id: toastId });
    } catch (err: any) {
      toast.error(err?.message || "Could not generate batch summary PDF.", { id: toastId });
    } finally {
      setDownloadingBatchId(null);
    }
  };

  const allJobs = dashboardJobs;
  const batches = dashboardBatches;
  const displayedJobs = selectedBatchId ? batchScopedJobs ?? [] : allJobs;

  const filtered = displayedJobs.filter((job) => {
    const name = `${job.candidate?.firstName || ""} ${job.candidate?.lastName || ""}`.toLowerCase();
    const email = (job.candidate?.email || "").toLowerCase();
    const q = searchQuery.toLowerCase();
    const matchesSearch = name.includes(q) || email.includes(q);
    const matchesStatus = statusFilter === "ALL" || job.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  // Top-level Stats
  const completedJobs = allJobs.filter((j) => j.status === "COMPLETED");
  const avgScore =
    completedJobs.length > 0
      ? Math.round(
          completedJobs.reduce((acc, j) => acc + (j.report?.trustScore || 0), 0) /
            completedJobs.length
        )
      : 0;
  const highRisk = completedJobs.filter((j) => (j.report?.trustScore || 0) < 60).length;

  const statCards = [
    {
      label: "Total Verifications",
      value: allJobs.length,
      icon: Users,
      color: "text-blue-500",
      bg: "bg-blue-50",
    },
    {
      label: "Completed",
      value: completedJobs.length,
      icon: CheckCircle2,
      color: "text-emerald-500",
      bg: "bg-emerald-50",
    },
    {
      label: "Avg Trust Score",
      value: avgScore ? `${avgScore}%` : "—",
      icon: TrendingUp,
      color: "text-purple-500",
      bg: "bg-purple-50",
    },
    {
      label: "High Risk Flags",
      value: highRisk,
      icon: AlertTriangle,
      color: "text-amber-500",
      bg: "bg-amber-50",
    },
    ...(isOrg
      ? [
          {
            label: "Batches Verified",
            value: batches.length,
            icon: Layers,
            color: "text-indigo-500",
            bg: "bg-indigo-50",
          },
        ]
      : []),
  ];

  const activeBatchObj = batches.find((b) => b.id === selectedBatchId) || null;

  if (apiKey === null) return null;

  return (
    <div className="min-h-screen bg-[var(--bg-page)]">
      <div className="max-w-7xl mx-auto px-6 py-10">
        {/* Top Row Stats */}
        <div
          className={`grid grid-cols-2 ${
            isOrg ? "md:grid-cols-5" : "md:grid-cols-4"
          } gap-4 mb-8`}
        >
          {statCards.map((s) => (
            <div
              key={s.label}
              className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-2xl p-5 shadow-[var(--shadow-sm)]"
            >
              <div className={`w-10 h-10 ${s.bg} rounded-xl flex items-center justify-center mb-3`}>
                <s.icon size={20} className={s.color} />
              </div>
              <div className="text-2xl font-bold text-[var(--text-primary)] mb-0.5">{s.value}</div>
              <div className="text-xs text-[var(--text-secondary)]">{s.label}</div>
            </div>
          ))}
        </div>

        {/* Organization Batch Cards Grid */}
        {isOrg && (
          <div className="mb-8">
            <div className="flex items-center justify-between mb-3.5">
              <div>
                <h2 className="font-heading font-bold text-base text-[var(--text-primary)] flex items-center gap-2">
                  <Layers size={17} className="text-[var(--brand-blue)]" />
                  <span>Verification Batches</span>
                </h2>
                <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                  Select a batch to filter candidates verified in that upload, or download an executive Batch Summary PDF.
                </p>
              </div>
              <Link
                href="/verify"
                className="px-3.5 py-2 rounded-xl bg-[var(--brand-blue)] text-white text-xs font-semibold hover:bg-blue-700 transition-colors"
              >
                + New Bulk Batch
              </Link>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3.5">
              {/* First Card: All Verifications */}
              <button
                type="button"
                onClick={() => setSelectedBatchId(null)}
                className={`text-left p-4 rounded-2xl border transition-colors flex flex-col justify-between min-h-[122px] ${
                  selectedBatchId === null
                    ? "bg-[var(--brand-blue)] text-white border-[var(--brand-blue)] shadow-md"
                    : "bg-[var(--bg-surface)] text-[var(--text-primary)] border-[var(--border)] hover:border-[var(--brand-blue)]/60 shadow-[var(--shadow-sm)]"
                }`}
              >
                <div className="flex items-center justify-between w-full">
                  <div
                    className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                      selectedBatchId === null
                        ? "bg-white/20 text-white"
                        : "bg-[var(--brand-blue-light)] text-[var(--brand-blue)]"
                    }`}
                  >
                    <FolderOpen size={16} />
                  </div>
                  <span
                    className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${
                      selectedBatchId === null
                        ? "bg-white/20 text-white"
                        : "bg-[var(--bg-subtle)] text-[var(--text-secondary)]"
                    }`}
                  >
                    {allJobs.length} total
                  </span>
                </div>

                <div className="mt-3">
                  <div className="font-heading font-bold text-sm leading-tight">
                    All Verifications
                  </div>
                  <div
                    className={`text-[11px] mt-0.5 ${
                      selectedBatchId === null ? "text-white/80" : "text-[var(--text-tertiary)]"
                    }`}
                  >
                    Complete candidate table
                  </div>
                </div>
              </button>

              {/* Clickable Batch Cards */}
              {batches.map((batch) => {
                const { dateDay, time } = formatBatchTitle(batch.createdAt);
                const isSelected = selectedBatchId === batch.id;
                const isDownloadingThis = downloadingBatchId === batch.id;

                return (
                  <div
                    key={batch.id}
                    onClick={() => setSelectedBatchId(batch.id)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") setSelectedBatchId(batch.id);
                    }}
                    className={`cursor-pointer text-left p-4 rounded-2xl border transition-colors flex flex-col justify-between min-h-[122px] ${
                      isSelected
                        ? "bg-[var(--brand-blue)] text-white border-[var(--brand-blue)] shadow-md"
                        : "bg-[var(--bg-surface)] text-[var(--text-primary)] border-[var(--border)] hover:border-[var(--brand-blue)]/60 shadow-[var(--shadow-sm)]"
                    }`}
                  >
                    <div className="flex items-center justify-between w-full gap-1">
                      <div
                        className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                          isSelected
                            ? "bg-white/20 text-white"
                            : "bg-indigo-50 text-indigo-600"
                        }`}
                      >
                        <Calendar size={15} />
                      </div>

                      <div className="flex items-center gap-1">
                        <span
                          className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${
                            isSelected
                              ? "bg-white/20 text-white"
                              : "bg-[var(--bg-subtle)] text-[var(--text-secondary)]"
                          }`}
                        >
                          {batch.totalJobs} {batch.totalJobs === 1 ? "resume" : "resumes"}
                        </span>
                        <button
                          type="button"
                          title="Download Batch Summary PDF"
                          disabled={isDownloadingThis}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDownloadBatchSummary(batch.id);
                          }}
                          className={`p-1.5 rounded-lg transition-colors ${
                            isSelected
                              ? "hover:bg-white/20 text-white"
                              : "hover:bg-[var(--bg-subtle)] text-[var(--text-secondary)] hover:text-[var(--brand-blue)]"
                          }`}
                        >
                          {isDownloadingThis ? (
                            <Loader2 size={14} className="animate-spin" />
                          ) : (
                            <FileDown size={14} />
                          )}
                        </button>
                      </div>
                    </div>

                    <div className="mt-3">
                      <div className="font-heading font-bold text-sm leading-tight">
                        {dateDay}
                      </div>
                      <div
                        className={`text-xs font-mono mt-0.5 ${
                          isSelected ? "text-white/85" : "text-[var(--text-secondary)]"
                        }`}
                      >
                        {time}
                      </div>
                      {batch.label && (
                        <div
                          className={`text-[10px] truncate mt-1 ${
                            isSelected ? "text-white/75" : "text-[var(--text-tertiary)]"
                          }`}
                        >
                          {batch.label}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Active Batch Indicator Banner + Executive Batch Summary PDF Button */}
        {isOrg && activeBatchObj && (
          <div className="mb-4 px-4 py-3 rounded-xl bg-[var(--brand-blue-light)] border border-[var(--brand-blue)]/25 flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2 text-[var(--brand-blue)] font-semibold">
              <Layers size={14} />
              <span>
                Viewing Batch: {formatBatchTitle(activeBatchObj.createdAt).dateDay} ·{" "}
                {formatBatchTitle(activeBatchObj.createdAt).time}
                {activeBatchObj.label ? ` — ${activeBatchObj.label}` : ""}
              </span>
              <span className="font-normal opacity-80">
                ({displayedJobs.length} candidate{displayedJobs.length === 1 ? "" : "s"})
              </span>
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                disabled={downloadingBatchId === activeBatchObj.id}
                onClick={() => handleDownloadBatchSummary(activeBatchObj.id)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--brand-blue)] text-white font-semibold hover:bg-blue-700 disabled:opacity-60 transition-colors"
              >
                {downloadingBatchId === activeBatchObj.id ? (
                  <Loader2 size={13} className="animate-spin" />
                ) : (
                  <FileDown size={13} />
                )}
                <span>Download Batch Summary PDF</span>
              </button>
              <button
                type="button"
                onClick={() => setSelectedBatchId(null)}
                className="font-bold text-[var(--brand-blue)] hover:underline"
              >
                Show All
              </button>
            </div>
          </div>
        )}

        {/* Search & Status Filter Controls */}
        <div className="flex flex-col sm:flex-row gap-3 mb-6">
          <div className="relative flex-1">
            <Search
              className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)]"
              size={16}
            />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by name or email..."
              className="w-full pl-10 pr-4 py-2.5 bg-[var(--bg-surface)] border border-[var(--border)] rounded-xl text-sm text-[var(--text-primary)] outline-none focus:border-[var(--brand-blue)] transition-colors"
            />
          </div>
          <div className="flex gap-2">
            {["ALL", "COMPLETED", "ANALYZING", "FAILED"].map((s) => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`px-3 py-2.5 rounded-xl text-xs font-semibold transition-colors ${
                  statusFilter === s
                    ? "bg-[var(--brand-blue)] text-white"
                    : "bg-[var(--bg-surface)] border border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                }`}
              >
                {s === "ALL" ? "All" : s.charAt(0) + s.slice(1).toLowerCase()}
              </button>
            ))}
          </div>
        </div>

        {/* Table */}
        <div className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-2xl shadow-[var(--shadow-sm)] overflow-hidden">
          <div className="grid grid-cols-12 gap-4 px-6 py-3 bg-[var(--bg-subtle)] border-b border-[var(--border)] text-xs font-bold text-[var(--text-tertiary)] uppercase tracking-wider">
            <div className="col-span-4">Candidate</div>
            <div className="col-span-2">Status</div>
            <div className="col-span-2">Trust Score</div>
            <div className="col-span-2">Submitted</div>
            <div className="col-span-2 text-right">Action</div>
          </div>

          {loading || loadingBatchJobs ? (
            <div className="px-6 py-16 text-center text-[var(--text-secondary)]">
              <Loader2 className="w-7 h-7 animate-spin text-[var(--brand-blue)] mx-auto mb-3" />
              Loading verifications from database...
            </div>
          ) : filtered.length === 0 ? (
            <div className="px-6 py-20 text-center">
              <BarChart2 className="mx-auto text-[var(--text-tertiary)] mb-4" size={40} />
              <p className="text-[var(--text-secondary)] font-medium mb-1">
                No verifications found
              </p>
              <p className="text-sm text-[var(--text-tertiary)] mb-6">
                {displayedJobs.length === 0
                  ? "Submit your first candidate or batch to get started."
                  : "Try adjusting your search or filter."}
              </p>
              {displayedJobs.length === 0 && (
                <Link href="/verify">
                  <button className="px-5 py-2.5 bg-[var(--brand-blue)] text-white rounded-xl text-sm font-semibold hover:bg-blue-700 transition-colors">
                    Start Verification
                  </button>
                </Link>
              )}
            </div>
          ) : (
            filtered.map((job) => {
              const name = `${job.candidate?.firstName || "Unknown"} ${
                job.candidate?.lastName || ""
              }`;
              const email = job.candidate?.email || "N/A";
              const score = job.report?.trustScore;
              const date = new Date(job.createdAt).toLocaleDateString("en-IN", {
                day: "numeric",
                month: "short",
                year: "numeric",
              });

              return (
                <div
                  key={job.id}
                  className="grid grid-cols-12 gap-4 px-6 py-4 border-b border-[var(--border)] last:border-0 items-center hover:bg-[var(--bg-subtle)] transition-colors"
                >
                  <div className="col-span-4">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-white text-sm font-bold shrink-0">
                        {name.charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="font-semibold text-[var(--text-primary)] text-sm truncate">
                          {name}
                        </p>
                        <p className="text-xs text-[var(--text-secondary)] truncate">{email}</p>
                      </div>
                    </div>
                  </div>
                  <div className="col-span-2">
                    <StatusBadge status={job.status} />
                  </div>
                  <div className="col-span-2">
                    {score != null ? (
                      <ScoreRing score={score} />
                    ) : (
                      <span className="text-xs text-[var(--text-tertiary)]">—</span>
                    )}
                  </div>
                  <div className="col-span-2">
                    <span className="text-sm text-[var(--text-secondary)]">{date}</span>
                  </div>
                  <div className="col-span-2 flex justify-end">
                    {job.status === "COMPLETED" ? (
                      <Link href={`/report/${job.id}`}>
                        <button className="flex items-center gap-1.5 px-3 py-1.5 bg-[var(--brand-blue)] text-white rounded-lg text-xs font-semibold hover:bg-blue-700 transition-colors">
                          View Report <ChevronRight size={12} />
                        </button>
                      </Link>
                    ) : (
                      <span className="text-xs text-[var(--text-tertiary)]">
                        {job.status === "FAILED" ? "Failed" : "In Progress..."}
                      </span>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[var(--bg-page)] flex items-center justify-center">
          <Loader2 className="w-7 h-7 animate-spin text-[var(--brand-blue)]" />
        </div>
      }
    >
      <DashboardContent />
    </Suspense>
  );
}
