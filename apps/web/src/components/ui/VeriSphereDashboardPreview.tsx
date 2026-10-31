"use client";

import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence, useInView, useMotionValue, useSpring } from "framer-motion";
import {
  Github,
  Award,
  FileText,
  CheckCircle2,
  Lock,
  GitCommit,
  UserCheck,
  ShieldCheck,
  Search,
  Zap,
  Check,
} from "lucide-react";

/* ─── Analysis Phase Messages ─────────────────────────────── */
const ANALYSIS_STEPS = [
  { text: "Analyzing Candidate Evidence...",       icon: Search, duration: 1000 },
  { text: "Cross-referencing Resume Claims",       icon: FileText, duration: 900  },
  { text: "Scanning GitHub Activity",              icon: Zap, duration: 900  },
  { text: "Verifying Certificate Authenticity",   icon: Award, duration: 900  },
  { text: "Generating Trust Assessment",           icon: ShieldCheck, duration: 800  },
];

/* ─── Animated Count-Up ───────────────────────────────────── */
function CountUp({ to, duration = 1.5, trigger }: { to: number; duration?: number; trigger: boolean }) {
  const [val, setVal] = useState(0);
  useEffect(() => {
    if (!trigger) return;
    const start = performance.now();
    const step = (now: number) => {
      const t = Math.min((now - start) / (duration * 1000), 1);
      const eased = 1 - Math.pow(1 - t, 3);
      setVal(Math.round(eased * to));
      if (t < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }, [trigger, to, duration]);
  return <>{val}</>;
}

/* ─── Animated SVG Connection Line ───────────────────────── */
function ConnectionLine({
  trigger,
  delay = 0,
  vertical = true,
}: {
  trigger: boolean;
  delay?: number;
  vertical?: boolean;
}) {
  return (
    <div className={`${vertical ? "w-full flex justify-center h-6" : "h-full flex items-center w-6"} relative`}>
      <svg
        className={vertical ? "w-0.5 h-full" : "h-0.5 w-full"}
        viewBox={vertical ? "0 0 2 24" : "0 0 80 2"}
        fill="none"
        preserveAspectRatio="none"
      >
        {/* Background track */}
        <line
          x1={vertical ? "1" : "0"} y1={vertical ? "0" : "1"}
          x2={vertical ? "1" : "80"} y2={vertical ? "24" : "1"}
          stroke="var(--border-strong)" strokeWidth="1" strokeDasharray="3 3"
        />
        {/* Animated fill line */}
        <motion.line
          x1={vertical ? "1" : "0"} y1={vertical ? "0" : "1"}
          x2={vertical ? "1" : "80"} y2={vertical ? "24" : "1"}
          stroke="var(--brand-blue)"
          strokeWidth="1.5"
          strokeLinecap="round"
          initial={{ pathLength: 0, opacity: 0 }}
          animate={trigger ? { pathLength: 1, opacity: 1 } : { pathLength: 0, opacity: 0 }}
          transition={{ duration: 0.6, delay, ease: [0.16, 1, 0.3, 1] }}
        />
        {/* Data pulse */}
        {trigger && (
          <motion.circle
            r="2"
            fill="var(--brand-blue)"
            cx={vertical ? 1 : 0}
            cy={vertical ? 0 : 1}
            initial={{ opacity: 0, cx: vertical ? 1 : 0, cy: vertical ? 0 : 1 }}
            animate={{
              opacity: [0, 1, 0],
              cx: vertical ? [1, 1] : [0, 80],
              cy: vertical ? [0, 24] : [1, 1],
            }}
            transition={{ duration: 1.2, delay: delay + 0.3, repeat: 2, ease: "easeInOut" }}
          />
        )}
      </svg>
    </div>
  );
}

/* ─── Animated SVG Path (Left panel → Right cards) ─────────── */
function DataFlowPath({
  trigger,
  delay = 0,
  d,
  viewBox,
  className,
}: {
  trigger: boolean;
  delay?: number;
  d: string;
  viewBox: string;
  className?: string;
}) {
  return (
    <svg viewBox={viewBox} fill="none" className={className} preserveAspectRatio="none">
      <path d={d} stroke="var(--border-strong)" strokeWidth="1.5" strokeDasharray="4 4" />
      <motion.path
        d={d}
        stroke="var(--brand-blue)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeDasharray="200"
        initial={{ strokeDashoffset: 200, opacity: 0 }}
        animate={trigger ? { strokeDashoffset: 0, opacity: 1 } : { strokeDashoffset: 200, opacity: 0 }}
        transition={{ duration: 0.8, delay, ease: [0.16, 1, 0.3, 1] }}
      />
      {/* Traveling pulse dot */}
      {trigger && (
        <motion.circle
          r="3"
          fill="var(--brand-blue)"
          cx="0"
          cy="0"
          initial={{ opacity: 0, offsetDistance: "0%" }}
          animate={{ opacity: [0, 1, 1, 0], offsetDistance: "100%" }}
          transition={{ duration: 1.2, delay: delay + 0.2, ease: "easeInOut" }}
          style={{ offsetPath: `path("${d}")` } as React.CSSProperties}
        />
      )}
    </svg>
  );
}

/* ─── Mini Bar Chart ─────────────────────────────────────── */
function MiniBarChart({ trigger }: { trigger: boolean }) {
  const bars = [35, 60, 45, 80, 50, 75, 90, 65, 85];
  return (
    <div className="flex items-end gap-1.5 bg-[var(--bg-subtle)] p-3 rounded-xl border border-[var(--border)] h-20 w-32 shrink-0">
      {bars.map((h, i) => (
        <div key={i} className="flex-1 bg-[var(--border-strong)] rounded-sm h-full relative overflow-hidden flex items-end">
          <motion.div
            className="w-full bg-[var(--brand-blue)] rounded-sm"
            initial={{ height: 0 }}
            animate={trigger ? { height: `${h}%` } : { height: 0 }}
            transition={{ duration: 0.7, delay: i * 0.05, ease: [0.16, 1, 0.3, 1] }}
          />
        </div>
      ))}
    </div>
  );
}

/* ─── Inline Trust Gauge (no external dep) ───────────────── */
function InlineTrustGauge({ score, trigger }: { score: number; trigger: boolean }) {
  const radius = 80;
  const circumference = Math.PI * radius;
  const dashoffset = circumference - (score / 100) * circumference;

  const color = score >= 80 ? "var(--verified)" : score >= 50 ? "var(--warning)" : "var(--danger)";
  const label = score >= 80 ? "HIGH CONFIDENCE" : score >= 50 ? "MODERATE CONFIDENCE" : "LOW CONFIDENCE";
  const badgeBg = score >= 80 ? "var(--verified-bg)" : score >= 50 ? "var(--warning-bg)" : "var(--danger-bg)";

  return (
    <div className="flex flex-col items-center relative">
      <div className="relative w-[180px] h-[100px] overflow-hidden">
        <svg className="w-full h-[180px]" viewBox="0 0 200 200">
          <path d="M 20 100 A 80 80 0 0 1 180 100" fill="none" stroke="var(--bg-muted)" strokeWidth="16" strokeLinecap="round" />
          <motion.path
            d="M 20 100 A 80 80 0 0 1 180 100"
            fill="none"
            stroke={color}
            strokeWidth="16"
            strokeLinecap="round"
            strokeDasharray={circumference}
            initial={{ strokeDashoffset: circumference }}
            animate={trigger ? { strokeDashoffset: dashoffset } : { strokeDashoffset: circumference }}
            transition={{ duration: 1.8, ease: [0.16, 1, 0.3, 1], delay: 0.2 }}
          />
        </svg>
        <div className="absolute bottom-0 left-0 right-0 flex justify-center pb-1">
          <span className="font-heading text-5xl font-bold" style={{ color: "var(--brand-navy)" }}>
            <CountUp to={score} duration={1.8} trigger={trigger} />
          </span>
        </div>
      </div>
      <motion.div
        className="mt-3 px-3 py-1 rounded-full text-[10px] font-bold tracking-wider"
        style={{ backgroundColor: badgeBg, color }}
        initial={{ opacity: 0, scale: 0.8 }}
        animate={trigger ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.8 }}
        transition={{ delay: 1.2, duration: 0.4, type: "spring", stiffness: 200 }}
      >
        {label}
      </motion.div>
    </div>
  );
}

/* ─── Main Component ──────────────────────────────────────── */
export function VeriSphereDashboardPreview() {
  const containerRef = useRef<HTMLDivElement>(null);
  const inView = useInView(containerRef, { once: true, margin: "-100px" });

  const [phase, setPhase] = useState<"idle" | "analyzing" | "building">("idle");
  const [analysisStep, setAnalysisStep] = useState(0);
  const [analysisText, setAnalysisText] = useState("");
  const [dotCount, setDotCount] = useState(0);

  const [liveData, setLiveData] = useState<{name: string, initials: string, score: number, skills: string[], commits: number} | null>(null);

  useEffect(() => {
    const key = typeof window !== "undefined" ? localStorage.getItem("verisphere_api_key") : null;
    if (!key) {
      // No API key, keep default preview/mock data
      return;
    }

    fetch("http://localhost:4000/api/verification/dashboard", {
      headers: { "x-api-key": key }
    })
      .then(res => {
        if (!res.ok) {
          throw new Error(`HTTP error! status: ${res.status}`);
        }
        return res.json();
      })
      .then(data => {
        if (data && data.length > 0) {
          const job = data[0];
          const name = `${job.candidate.firstName} ${job.candidate.lastName}`;
          let skills = ["React", "TypeScript", "Node.js"];
          try {
             if (job.report?.semanticMatchJson) {
                const parsed = JSON.parse(job.report.semanticMatchJson);
                skills = parsed.map((m: any) => m.claimedSkill || m.skill).filter(Boolean).slice(0, 5);
             }
          } catch(e) {}
          let commits = 2847;
          try {
             if (job.githubMetricsJson) {
                const parsed = JSON.parse(job.githubMetricsJson);
                commits = parsed.totalCommitsCollected || 0;
             }
          } catch(e) {}

          setLiveData({
            name,
            initials: `${job.candidate.firstName[0]}${job.candidate.lastName[0]}`.toUpperCase(),
            score: job.report?.trustScore || 87,
            skills: skills.length > 0 ? skills : ["React", "TypeScript", "Node.js"],
            commits
          });
        }
      })
      .catch(err => console.error("Failed to fetch dashboard data:", err));
  }, []);

  // Build phases
  const [showProfile, setShowProfile]   = useState(false);
  const [showGauge, setShowGauge]       = useState(false);
  const [showConn1, setShowConn1]       = useState(false);
  const [showGithub, setShowGithub]     = useState(false);
  const [showConn2, setShowConn2]       = useState(false);
  const [showResume, setShowResume]     = useState(false);
  const [showConn3, setShowConn3]       = useState(false);
  const [showCert, setShowCert]         = useState(false);
  const [showFinalPulse, setShowFinalPulse] = useState(false);
  const [showFloaters, setShowFloaters] = useState(false);
  const [hoveredCard, setHoveredCard]   = useState<string | null>(null);

  /* ─── Kickoff sequence when section enters viewport ───── */
  useEffect(() => {
    if (!inView || phase !== "idle") return;
    setPhase("analyzing");
  }, [inView, phase]);

  /* ─── Animated dots for loading text ──────────────────── */
  useEffect(() => {
    if (phase !== "analyzing") return;
    const interval = setInterval(() => setDotCount(d => (d + 1) % 4), 350);
    return () => clearInterval(interval);
  }, [phase]);

  /* ─── Step through analysis messages ──────────────────── */
  useEffect(() => {
    if (phase !== "analyzing") return;
    if (analysisStep >= ANALYSIS_STEPS.length) {
      // Transition to building phase
      setPhase("building");
      return;
    }
    const step = ANALYSIS_STEPS[analysisStep];
    // Animate text character by character
    let i = 0;
    setAnalysisText("");
    const charInterval = setInterval(() => {
      setAnalysisText(step.text.slice(0, i + 1));
      i++;
      if (i >= step.text.length) clearInterval(charInterval);
    }, 25);

    const stepTimer = setTimeout(() => {
      clearInterval(charInterval);
      setAnalysisStep(s => s + 1);
    }, step.duration);

    return () => {
      clearInterval(charInterval);
      clearTimeout(stepTimer);
    };
  }, [phase, analysisStep]);

  /* ─── Building phase: sequential card reveal ──────────── */
  useEffect(() => {
    if (phase !== "building") return;
    const t = (fn: () => void, ms: number) => setTimeout(fn, ms);
    const timers = [
      t(() => setShowProfile(true),    100),
      t(() => setShowGauge(true),      600),
      t(() => setShowConn1(true),      2000),
      t(() => setShowGithub(true),     2700),
      t(() => setShowConn2(true),      3500),
      t(() => setShowResume(true),     4100),
      t(() => setShowConn3(true),      4800),
      t(() => setShowCert(true),       5400),
      t(() => setShowFinalPulse(true), 6400),
      t(() => setShowFloaters(true),   6800),
    ];
    return () => timers.forEach(clearTimeout);
  }, [phase]);

  /* ─── Skill pill delays ─────────────────────────────────── */
  const skills = ["React / Next.js", "TypeScript", "Node.js", "AWS Cloud"];

  /* ─── Floater animation ──────────────────────────────────── */
  const floatingAnimation = (delay: number) => ({
    y: ["0px", "-10px", "0px"],
    transition: { duration: 5, repeat: Infinity, ease: "easeInOut" as const, delay },
  });

  /* ─── Analysis Progress percentage ───────────────────────── */
  const progressPct = Math.min((analysisStep / ANALYSIS_STEPS.length) * 100, 100);

  return (
    <div ref={containerRef} className="w-full max-w-6xl mx-auto px-4 py-8 relative min-h-[520px]">

      {/* ── PHASE 1: ANALYSIS SEQUENCE ─────────────────────── */}
      <AnimatePresence mode="wait">
        {phase === "analyzing" && (
          <motion.div
            key="analysis"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, y: -30, filter: "blur(8px)" }}
            transition={{ duration: 0.5 }}
            className="absolute inset-0 flex flex-col items-center justify-center z-30 px-6"
          >
            {/* Scanning grid background */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
              <div
                className="absolute inset-0 opacity-[0.04]"
                style={{
                  backgroundImage:
                    "linear-gradient(var(--brand-blue) 1px, transparent 1px), linear-gradient(90deg, var(--brand-blue) 1px, transparent 1px)",
                  backgroundSize: "32px 32px",
                }}
              />
              {/* Scanning beam */}
              <motion.div
                className="absolute left-0 right-0 h-px bg-gradient-to-r from-transparent via-[var(--brand-blue)] to-transparent opacity-40"
                animate={{ y: ["-10%", "110%"] }}
                transition={{ duration: 2.5, repeat: Infinity, ease: "linear" }}
              />
            </div>

            {/* Step label */}
            <motion.div
              key={analysisStep}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.3 }}
              className="mb-4 text-[var(--brand-blue)] flex items-center justify-center"
            >
              {(() => {
                const step = ANALYSIS_STEPS[Math.min(analysisStep, ANALYSIS_STEPS.length - 1)];
                if (!step) return null;
                const StepIcon = step.icon;
                return <StepIcon className="w-12 h-12 stroke-[1.5]" />;
              })()}
            </motion.div>

            {/* Main analysis text */}
            <div className="text-center mb-8">
              <h2 className="font-heading text-2xl md:text-3xl font-semibold text-[var(--text-primary)] tracking-tight">
                {analysisText}
                <motion.span
                  animate={{ opacity: [1, 0, 1] }}
                  transition={{ duration: 0.6, repeat: Infinity }}
                  className="ml-0.5 inline-block w-0.5 h-6 bg-[var(--brand-blue)] align-middle"
                />
              </h2>

              {/* Subtitle steps */}
              <div className="flex items-center justify-center gap-2 mt-3 flex-wrap">
                {ANALYSIS_STEPS.map((s, i) => (
                  <motion.span
                    key={i}
                    animate={
                      i === analysisStep
                        ? { opacity: 1, scale: 1 }
                        : i < analysisStep
                        ? { opacity: 0.4, scale: 0.95 }
                        : { opacity: 0.2, scale: 0.9 }
                    }
                    className="inline-flex items-center justify-center text-xs font-heading font-medium text-[var(--text-secondary)] w-6 h-6 rounded-full border border-[var(--border)]"
                    style={{
                      borderColor: i === analysisStep ? "var(--brand-blue)" : undefined,
                      color: i === analysisStep ? "var(--brand-blue)" : undefined,
                      backgroundColor: i < analysisStep ? "var(--verified-bg)" : undefined,
                    }}
                  >
                    {i < analysisStep ? <Check className="w-3.5 h-3.5 stroke-[2.5]" /> : i + 1}
                  </motion.span>
                ))}
              </div>
            </div>

            {/* Progress bar */}
            <div className="w-full max-w-md">
              <div className="h-1 bg-[var(--bg-muted)] rounded-full overflow-hidden">
                <motion.div
                  className="h-full rounded-full bg-gradient-to-r from-[var(--brand-blue)] to-[var(--verified)]"
                  animate={{ width: `${progressPct}%` }}
                  transition={{ duration: 0.5, ease: "easeOut" }}
                />
              </div>
              <div className="flex justify-between mt-2">
                <span className="text-[11px] text-[var(--text-tertiary)] font-heading">
                  Processing{"·".repeat(dotCount)}
                </span>
                <span className="text-[11px] text-[var(--brand-blue)] font-heading font-semibold">
                  {Math.round(progressPct)}%
                </span>
              </div>
            </div>

            {/* Orbiting dots */}
            <div className="relative w-16 h-16 mt-6">
              {[0, 1, 2].map((i) => (
                <motion.div
                  key={i}
                  className="absolute w-2 h-2 rounded-full bg-[var(--brand-blue)]"
                  animate={{ rotate: 360 }}
                  transition={{
                    duration: 1.5,
                    repeat: Infinity,
                    ease: "linear",
                    delay: i * 0.5,
                  }}
                  style={{
                    originX: "50%",
                    originY: "50%",
                    left: `calc(50% + ${28 * Math.cos((i * 2 * Math.PI) / 3)}px - 4px)`,
                    top: `calc(50% + ${28 * Math.sin((i * 2 * Math.PI) / 3)}px - 4px)`,
                    opacity: 0.3 + i * 0.3,
                  }}
                />
              ))}
              <div className="absolute inset-0 flex items-center justify-center">
                <motion.div
                  animate={{ scale: [1, 1.2, 1], opacity: [0.5, 1, 0.5] }}
                  transition={{ duration: 1.5, repeat: Infinity }}
                  className="w-4 h-4 rounded-full bg-[var(--brand-blue)] opacity-50"
                />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── PHASE 2: DASHBOARD BUILD ────────────────────────── */}
      <AnimatePresence>
        {phase === "building" && (
          <motion.div
            key="dashboard"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.4 }}
            className="w-full"
          >
            {/* Background decoration */}
            <div className="absolute inset-0 bg-gradient-to-tr from-[var(--brand-blue-light)]/20 via-transparent to-transparent blur-3xl -z-20 pointer-events-none" />

            {/* Floating micro-cards */}
            <div className="hidden xl:block">
              <AnimatePresence>
                {showFloaters && (
                  <>
                    <motion.div
                      initial={{ opacity: 0, x: -20, scale: 0.9 }}
                      animate={{ opacity: 1, x: 0, scale: 1, ...floatingAnimation(0) }}
                      transition={{ duration: 0.5 }}
                      className="absolute -left-8 top-1/4 bg-[var(--bg-surface)] border border-[var(--border)] rounded-2xl p-4 shadow-[var(--shadow-md)] flex items-center gap-3 max-w-[220px] z-20"
                    >
                      <div className="w-8 h-8 rounded-full bg-[var(--verified-bg)] text-[var(--verified)] flex items-center justify-center shrink-0">
                        <ShieldCheck size={16} />
                      </div>
                      <div>
                        <div className="text-xs font-bold text-[var(--text-primary)]">Anti-Tampering</div>
                        <div className="text-[10px] text-[var(--text-secondary)]">Metadata scan: PASS</div>
                      </div>
                    </motion.div>

                    <motion.div
                      initial={{ opacity: 0, x: 20, scale: 0.9 }}
                      animate={{ opacity: 1, x: 0, scale: 1, ...floatingAnimation(1.5) }}
                      transition={{ duration: 0.5, delay: 0.1 }}
                      className="absolute -right-8 top-12 bg-[var(--bg-surface)] border border-[var(--border)] rounded-2xl p-4 shadow-[var(--shadow-md)] flex items-center gap-3 max-w-[220px] z-20"
                    >
                      <div className="w-8 h-8 rounded-full bg-[var(--verified-bg)] text-[var(--verified)] flex items-center justify-center shrink-0">
                        <CheckCircle2 size={16} />
                      </div>
                      <div>
                        <div className="text-xs font-bold text-[var(--text-primary)]">Code Ownership</div>
                        <div className="text-[10px] text-[var(--text-secondary)]">100% verified original</div>
                      </div>
                    </motion.div>

                    <motion.div
                      initial={{ opacity: 0, x: 20, scale: 0.9 }}
                      animate={{ opacity: 1, x: 0, scale: 1, ...floatingAnimation(3) }}
                      transition={{ duration: 0.5, delay: 0.2 }}
                      className="absolute -right-12 bottom-1/4 bg-[var(--bg-surface)] border border-[var(--border)] rounded-2xl p-4 shadow-[var(--shadow-md)] flex items-center gap-3 max-w-[240px] z-20"
                    >
                      <div className="w-8 h-8 rounded-full bg-[var(--brand-blue-light)] text-[var(--brand-blue)] flex items-center justify-center shrink-0">
                        <GitCommit size={16} />
                      </div>
                      <div>
                        <div className="text-xs font-bold text-[var(--text-primary)]">Commit Audit</div>
                        <div className="text-[10px] text-[var(--text-secondary)]">
                          {liveData?.commits ? liveData.commits.toLocaleString() : "2,847"} commits mapped
                        </div>
                      </div>
                    </motion.div>
                  </>
                )}
              </AnimatePresence>
            </div>

            {/* Main grid */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch relative">

              {/* ── LEFT: Candidate Profile Card ──────────────── */}
              <AnimatePresence>
                {showProfile && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.92, y: 20 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
                    onMouseEnter={() => setHoveredCard("profile")}
                    onMouseLeave={() => setHoveredCard(null)}
                    className={`lg:col-span-5 bg-[var(--bg-surface)] border rounded-3xl p-8 shadow-[var(--shadow-md)] flex flex-col justify-between relative overflow-hidden transition-shadow duration-300 ${
                      hoveredCard === "profile" ? "border-[var(--brand-blue)] shadow-[var(--shadow-lg)] -translate-y-1" : "border-[var(--border)]"
                    }`}
                  >
                    {/* Final pulse ring */}
                    <AnimatePresence>
                      {showFinalPulse && (
                        <motion.div
                          className="absolute inset-0 rounded-3xl border-2 border-[var(--brand-blue)] pointer-events-none z-10"
                          initial={{ opacity: 0, scale: 1 }}
                          animate={{ opacity: [0, 0.6, 0], scale: [1, 1.02, 1] }}
                          transition={{ duration: 1.2, times: [0, 0.4, 1], repeat: 2 }}
                        />
                      )}
                    </AnimatePresence>

                    {/* Header */}
                    <div className="flex items-start justify-between mb-8">
                      <div className="flex items-center gap-4">
                        <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center font-bold text-white text-xl shadow-inner shadow-white/10 relative overflow-hidden">
                          {liveData?.initials || "AR"}
                          <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/10 to-transparent pointer-events-none" />
                        </div>
                        <div>
                          <h3 className="font-heading font-bold text-lg text-[var(--text-primary)]">{liveData?.name || "Candidate Overview"}</h3>
                          <p className="text-xs text-[var(--text-secondary)] font-medium">Senior Full Stack Developer</p>
                        </div>
                      </div>
                      <motion.span
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: 0.5, type: "spring", stiffness: 200 }}
                        className="flex items-center gap-1 text-[10px] font-bold text-[var(--verified)] bg-[var(--verified-bg)] px-2.5 py-1 rounded-full uppercase tracking-wider border border-[var(--verified)]/10"
                      >
                        <UserCheck size={10} /> Verified
                      </motion.span>
                    </div>

                    {/* Trust Gauge */}
                    <div className="my-4 flex justify-center">
                      <InlineTrustGauge score={liveData?.score || 87} trigger={showGauge} />
                    </div>

                    {/* Skills */}
                    <div className="mt-6 pt-6 border-t border-[var(--border)]">
                      <span className="text-[10px] font-heading font-bold text-[var(--text-tertiary)] uppercase tracking-widest block mb-4">
                        Verified Skills Matrix
                      </span>
                      <div className="flex flex-wrap gap-2">
                        {(liveData?.skills || ["React", "TypeScript", "Node.js"]).map((s, i) => (
                          <motion.div
                            key={`${s}-${i}`}
                            initial={{ opacity: 0, scale: 0.85, x: -6 }}
                            animate={showGauge ? { opacity: 1, scale: 1, x: 0 } : {}}
                            transition={{ duration: 0.3, delay: 1.8 + i * 0.12, type: "spring", stiffness: 300 }}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[var(--bg-subtle)] border border-[var(--border)] rounded-full text-xs font-semibold text-[var(--text-secondary)]"
                          >
                            <motion.span
                              className="w-1.5 h-1.5 rounded-full bg-[var(--verified)]"
                              initial={{ scale: 0 }}
                              animate={showGauge ? { scale: 1 } : {}}
                              transition={{ delay: 2.0 + i * 0.12, type: "spring", stiffness: 400 }}
                            />
                            {s}
                          </motion.div>
                        ))}
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* ── RIGHT: Evidence Layers ──────────────────────── */}
              <div className="lg:col-span-7 flex flex-col gap-0 relative">

                {/* Animated SVG connector paths (desktop) */}
                <div className="hidden lg:block absolute top-0 -left-8 w-8 h-full z-0 pointer-events-none">
                  <svg className="w-full h-full" viewBox="0 0 32 300" fill="none" preserveAspectRatio="none">
                    <path d="M 0 150 Q 16 150 32 50" stroke="var(--border-strong)" strokeWidth="1" strokeDasharray="3 3" />
                    <motion.path
                      d="M 0 150 Q 16 150 32 50"
                      stroke="var(--brand-blue)"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeDasharray="120"
                      initial={{ strokeDashoffset: 120, opacity: 0 }}
                      animate={showConn1 ? { strokeDashoffset: 0, opacity: 1 } : {}}
                      transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
                    />
                    {showConn1 && (
                      <motion.circle r="3" fill="var(--brand-blue)"
                        animate={{ opacity: [0, 1, 0], cx: [0, 16, 32], cy: [150, 150, 50] }}
                        transition={{ duration: 1, ease: "easeInOut", repeat: 2 }}
                      />
                    )}

                    <path d="M 0 150 H 32" stroke="var(--border-strong)" strokeWidth="1" strokeDasharray="3 3" />
                    <motion.path
                      d="M 0 150 H 32"
                      stroke="var(--brand-blue)"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeDasharray="32"
                      initial={{ strokeDashoffset: 32, opacity: 0 }}
                      animate={showConn2 ? { strokeDashoffset: 0, opacity: 1 } : {}}
                      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                    />

                    <path d="M 0 150 Q 16 150 32 250" stroke="var(--border-strong)" strokeWidth="1" strokeDasharray="3 3" />
                    <motion.path
                      d="M 0 150 Q 16 150 32 250"
                      stroke="var(--brand-blue)"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeDasharray="120"
                      initial={{ strokeDashoffset: 120, opacity: 0 }}
                      animate={showConn3 ? { strokeDashoffset: 0, opacity: 1 } : {}}
                      transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
                    />
                  </svg>
                </div>

                {/* ── GitHub Card ─────────────────────────────── */}
                <AnimatePresence>
                  {showGithub && (
                    <motion.div
                      initial={{ opacity: 0, x: 30, y: 10 }}
                      animate={{ opacity: 1, x: 0, y: 0 }}
                      transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
                      onMouseEnter={() => setHoveredCard("github")}
                      onMouseLeave={() => setHoveredCard(null)}
                      className={`bg-[var(--bg-surface)] border rounded-2xl p-6 flex flex-col md:flex-row md:items-center justify-between gap-6 overflow-hidden transition-all duration-300 ${
                        hoveredCard === "github" ? "border-[var(--brand-blue)] shadow-[var(--shadow-md)] -translate-y-0.5" : "border-[var(--border)]"
                      }`}
                    >
                      <div className="space-y-3 flex-1">
                        <div className="flex items-center gap-2">
                          <motion.div
                            initial={{ scale: 0, rotate: -20 }}
                            animate={{ scale: 1, rotate: 0 }}
                            transition={{ delay: 0.1, type: "spring", stiffness: 300 }}
                            className="w-8 h-8 rounded-lg bg-[var(--bg-subtle)] flex items-center justify-center text-[var(--text-primary)]"
                          >
                            <Github size={18} />
                          </motion.div>
                          <h4 className="font-heading font-bold text-sm text-[var(--text-primary)]">GitHub Evidence Matching</h4>
                        </div>
                        <p className="text-xs text-[var(--text-secondary)] leading-relaxed max-w-md">
                          Forensic verification maps applicant experience claims against public repository activities, commit history, and genuine development cadence.
                        </p>
                        <div className="flex gap-4 pt-1">
                          {[
                            { label: "Commits", value: 2847, color: "var(--text-primary)", format: (v: number) => v.toLocaleString() },
                            { label: "Active Repos", value: 12, color: "var(--text-primary)", format: (v: number) => `${v} verified` },
                            { label: "Cadence Match", value: 91, color: "var(--verified)", format: (v: number) => `${v}% (High)` },
                          ].map((stat, i) => (
                            <React.Fragment key={stat.label}>
                              {i > 0 && <div className="w-px h-8 bg-[var(--border)]" />}
                              <motion.div
                                initial={{ opacity: 0, y: 8 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: 0.2 + i * 0.1 }}
                              >
                                <div className="text-xs text-[var(--text-tertiary)] font-medium">{stat.label}</div>
                                <div className="text-sm font-heading font-bold" style={{ color: stat.color }}>
                                  <CountUp to={stat.value} duration={1.2} trigger={showGithub} />
                                  {stat.label === "Active Repos" && " verified"}
                                  {stat.label === "Cadence Match" && "% (High)"}
                                </div>
                              </motion.div>
                            </React.Fragment>
                          ))}
                        </div>
                      </div>
                      <MiniBarChart trigger={showGithub} />
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Connector gap */}
                {showGithub && <div className="h-4" />}

                {/* ── Resume Card ─────────────────────────────── */}
                <AnimatePresence>
                  {showResume && (
                    <motion.div
                      initial={{ opacity: 0, x: 30, y: 10 }}
                      animate={{ opacity: 1, x: 0, y: 0 }}
                      transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
                      onMouseEnter={() => setHoveredCard("resume")}
                      onMouseLeave={() => setHoveredCard(null)}
                      className={`bg-[var(--bg-surface)] border rounded-2xl p-6 flex items-center justify-between gap-6 transition-all duration-300 ${
                        hoveredCard === "resume" ? "border-[var(--brand-blue)] shadow-[var(--shadow-md)] -translate-y-0.5" : "border-[var(--border)]"
                      }`}
                    >
                      <div className="space-y-3 flex-1">
                        <div className="flex items-center gap-2">
                          <motion.div
                            initial={{ scale: 0, rotate: -20 }}
                            animate={{ scale: 1, rotate: 0 }}
                            transition={{ delay: 0.1, type: "spring", stiffness: 300 }}
                            className="w-8 h-8 rounded-lg bg-[var(--bg-subtle)] flex items-center justify-center text-[var(--text-primary)]"
                          >
                            <FileText size={18} />
                          </motion.div>
                          <h4 className="font-heading font-bold text-sm text-[var(--text-primary)]">Resume Semantic Consistency</h4>
                        </div>
                        <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                          VeriSphere reads resume text and checks work experience durations against dates extracted from public profiles and commits.
                        </p>
                        <motion.div
                          initial={{ opacity: 0, scale: 0.9, x: -8 }}
                          animate={{ opacity: 1, scale: 1, x: 0 }}
                          transition={{ delay: 0.4, type: "spring", stiffness: 250 }}
                          className="inline-flex items-center gap-1.5 px-3 py-1 bg-[var(--verified-bg)] border border-[var(--verified)]/10 rounded-full text-xs font-heading font-semibold text-[var(--verified)]"
                        >
                          <motion.span
                            initial={{ pathLength: 0 }}
                            animate={{ pathLength: 1 }}
                            transition={{ delay: 0.5, duration: 0.4 }}
                          >
                            <CheckCircle2 size={12} />
                          </motion.span>
                          Claims align · No experience overlap anomalies
                        </motion.div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Connector gap */}
                {showResume && <div className="h-4" />}

                {/* ── Certificate Card ─────────────────────────── */}
                <AnimatePresence>
                  {showCert && (
                    <motion.div
                      initial={{ opacity: 0, x: 30, y: 10 }}
                      animate={{ opacity: 1, x: 0, y: 0 }}
                      transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
                      onMouseEnter={() => setHoveredCard("cert")}
                      onMouseLeave={() => setHoveredCard(null)}
                      className={`bg-[var(--bg-surface)] border rounded-2xl p-6 flex items-center justify-between gap-6 transition-all duration-300 ${
                        hoveredCard === "cert" ? "border-[var(--brand-blue)] shadow-[var(--shadow-md)] -translate-y-0.5" : "border-[var(--border)]"
                      }`}
                    >
                      <div className="space-y-3 flex-1">
                        <div className="flex items-center gap-2">
                          <motion.div
                            initial={{ scale: 0, rotate: -20 }}
                            animate={{ scale: 1, rotate: 0 }}
                            transition={{ delay: 0.1, type: "spring", stiffness: 300 }}
                            className="w-8 h-8 rounded-lg bg-[var(--bg-subtle)] flex items-center justify-center text-[var(--text-primary)]"
                          >
                            <Award size={18} />
                          </motion.div>
                          <h4 className="font-heading font-bold text-sm text-[var(--text-primary)]">Certificate Cryptographic Proof</h4>
                        </div>
                        <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                          PDF signature audit checks metadata for edit software flags, date stamps, and matches badge hashes directly with issue registries.
                        </p>
                        <div className="flex gap-4 flex-wrap">
                          {["Stanford CS Cert: Authenticated", "AWS solutions architect: Validated"].map((cert, i) => (
                            <motion.div
                              key={cert}
                              initial={{ opacity: 0, x: -8 }}
                              animate={{ opacity: 1, x: 0 }}
                              transition={{ delay: 0.3 + i * 0.15 }}
                              className="flex items-center gap-1.5 text-xs text-[var(--text-secondary)] font-medium"
                            >
                              <motion.span
                                initial={{ scale: 0 }}
                                animate={{ scale: 1 }}
                                transition={{ delay: 0.4 + i * 0.15, type: "spring", stiffness: 400 }}
                              >
                                <CheckCircle2 size={12} className="text-[var(--verified)]" />
                              </motion.span>
                              {cert}
                            </motion.div>
                          ))}
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>

            {/* Footer */}
            <AnimatePresence>
              {showCert && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 1, duration: 0.4 }}
                  className="mt-8 flex justify-center items-center gap-1.5 text-xs text-[var(--text-tertiary)] bg-[var(--bg-surface)] border border-[var(--border)] px-4 py-2.5 rounded-2xl w-fit mx-auto shadow-sm"
                >
                  <Lock size={12} />
                  <span>Verification maps multiple indicators directly to primary evidence, ensuring bulletproof audit reports.</span>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
