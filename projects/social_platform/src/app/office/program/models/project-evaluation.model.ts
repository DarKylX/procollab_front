/** @format */

import { ApiPagination } from "@models/api-pagination.model";

export type ExpertEvaluationStatus = "not_started" | "draft" | "submitted";
export type ExpertEvaluationCriterionType = "int" | "float" | "bool" | "str";
export type ExpertEvaluationValue = string | number | boolean | null;

export interface ExpertEvaluationProgram {
  id: number;
  name: string;
  stage?: string;
  datetimeEvaluationEnds: string | null;
  isDistributedEvaluation?: boolean;
  participationFormat: "individual" | "team";
}

export interface ExpertEvaluationCounters {
  assigned: number;
  evaluated: number;
  remaining: number;
}

export interface ExpertEvaluationProgramSummary extends ExpertEvaluationCounters {
  id: number;
  name: string;
  evaluationDeadline: string | null;
  stage: string;
  stageStatus: string;
  isDistributedEvaluation: boolean;
}

export interface ExpertEvaluationParticipant {
  userId: number;
  firstName: string;
  lastName: string;
  avatar: string | null;
  fullName: string;
}

export interface ExpertEvaluationScore {
  criterionId: number;
  value: ExpertEvaluationValue;
}

export interface ExpertEvaluation {
  id: number;
  status: Exclude<ExpertEvaluationStatus, "not_started">;
  comment: string;
  totalScore: string | number | null;
  submittedAt: string | null;
  scores: ExpertEvaluationScore[];
}

export interface ExpertProjectSubmission {
  id: number;
  projectId: number;
  projectName: string;
  teamLabel: string;
  teamName: string;
  participants: ExpertEvaluationParticipant[];
  participantsCount: number;
  submittedAt: string | null;
  evaluationStatus: ExpertEvaluationStatus;
  evaluation: ExpertEvaluation | null;
}

export interface ExpertProjectMaterial {
  title: string;
  url: string;
  kind: "presentation" | "link";
}

export interface ExpertEvaluationCriterion {
  id: number;
  name: string;
  description: string;
  type: ExpertEvaluationCriterionType;
  minValue: number | null;
  maxValue: number | null;
  weight: number;
  value: ExpertEvaluationValue;
}

export interface ExpertProjectSubmissionDetail extends ExpertProjectSubmission {
  program: ExpertEvaluationProgram;
  projectDescription: string;
  materials: ExpertProjectMaterial[];
  criteria: ExpertEvaluationCriterion[];
}

export interface ExpertSubmissionsResponse extends ApiPagination<ExpertProjectSubmission> {
  program: ExpertEvaluationProgram;
  counters: ExpertEvaluationCounters;
}

export interface ExpertEvaluationPayload {
  comment: string;
  scores: ExpertEvaluationScore[];
}
