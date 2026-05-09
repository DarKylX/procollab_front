/** @format */

export type ProgramAnalyticsSubmissionStatus = "not_submitted" | "submitted";
export type ProgramAnalyticsEvaluationStatus =
  | "not_evaluated"
  | "partially_evaluated"
  | "evaluated";

export interface ProgramAnalyticsMaterial {
  title: string;
  url: string;
  kind: "presentation" | "link";
}

export interface ProgramAnalyticsSubmission {
  programProjectId: number;
  projectId: number;
  projectTitle: string;
  projectDescription: string;
  participantsPreview: string;
  participantsCount: number;
  authorName: string;
  participantLabel: string;
  submittedAt: string | null;
  submissionStatus: ProgramAnalyticsSubmissionStatus;
  evaluationStatus: ProgramAnalyticsEvaluationStatus;
  evaluationsReceived: number;
  evaluationsRequired: number;
  averageScore: number | null;
  finalScore: number | null;
  projectMaterials: ProgramAnalyticsMaterial[];
}

export interface ProgramAnalytics {
  programId: number;
  title: string;
  status: string;
  currentStage: string;
  evaluationDeadline: string | null;
  participantsCount: number;
  submittedProjectsCount: number;
  evaluatedProjectsCount: number;
  averageScore: number | null;
  verificationStatus?: "not_requested" | "pending" | "verified" | "rejected" | "revoked";
  submissions: ProgramAnalyticsSubmission[];
}
