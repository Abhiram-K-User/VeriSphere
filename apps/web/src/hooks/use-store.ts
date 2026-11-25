/**
 * @file use-store.ts
 * @package apps/web
 * @purpose Global Zustand store caching dashboard jobs, batches, and UI filters
 *          so navigating between tabs renders instantly (0ms) with stale-while-revalidate.
 */

import { create } from "zustand";
import { Candidate, VerificationJob } from "@verisphere/shared-types";

export interface CachedBatchSummary {
  id: string;
  orgEmail?: string | null;
  label?: string | null;
  createdAt: string;
  totalJobs: number;
  completedCount: number;
  failedCount: number;
  analyzingCount: number;
  avgTrustScore: number | null;
}

interface VerisphereState {
  candidates: Candidate[];
  activeJob: VerificationJob | null;

  // Instant dashboard cache across route transitions
  dashboardJobs: any[];
  dashboardBatches: CachedBatchSummary[];
  dashboardLoaded: boolean;
  dashboardLastFetchedAt: number;

  // Dashboard UI Filters
  searchQuery: string;
  statusFilter: string;

  // Actions
  setCandidates: (candidates: Candidate[]) => void;
  setActiveJob: (job: VerificationJob | null) => void;
  setDashboardData: (jobs: any[], batches: CachedBatchSummary[]) => void;
  setSearchQuery: (query: string) => void;
  setStatusFilter: (filter: string) => void;
  resetFilters: () => void;
}

export const useVerisphereStore = create<VerisphereState>((set) => ({
  candidates: [],
  activeJob: null,
  dashboardJobs: [],
  dashboardBatches: [],
  dashboardLoaded: false,
  dashboardLastFetchedAt: 0,
  searchQuery: "",
  statusFilter: "ALL",

  setCandidates: (candidates) => set({ candidates }),
  setActiveJob: (activeJob) => set({ activeJob }),
  setDashboardData: (dashboardJobs, dashboardBatches) =>
    set({
      dashboardJobs,
      dashboardBatches,
      dashboardLoaded: true,
      dashboardLastFetchedAt: Date.now(),
    }),
  setSearchQuery: (searchQuery) => set({ searchQuery }),
  setStatusFilter: (statusFilter) => set({ statusFilter }),
  resetFilters: () => set({ searchQuery: "", statusFilter: "ALL" }),
}));
