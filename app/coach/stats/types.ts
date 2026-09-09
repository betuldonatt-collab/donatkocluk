import type { ExitCategory } from "@/lib/exit-category";

export type PastStudent = {
  id: string;
  full_name: string | null;
  stayMonths: number;
  completedSessions: number;
  exitCategory: ExitCategory | null;
  exitNote: string | null;
};

export type ChurnBreakdownItem = {
  category: ExitCategory | "unspecified";
  label: string;
  count: number;
};

export type CoachStats = {
  activeCount: number;
  inactiveCount: number;
  avgRetentionMonths: number | null;
  avgRating: number | null;
  ratingCount: number;
  workload: {
    pending: number;
    completed: number;
    notHappened: number;
    total: number;
  };
  churnBreakdown: ChurnBreakdownItem[];
  pastStudents: PastStudent[];
};
