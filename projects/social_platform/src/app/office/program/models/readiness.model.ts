/** @format */

export type ReadinessBlockKey =
  | "basic_info"
  | "dates"
  | "registration"
  | "materials"
  | "criteria_experts"
  | "visual_assets"
  | "certificate_template"
  | "verification";

export type ReadinessChecklistValue = boolean | "not_applicable";
export type ReadinessChecklist = Partial<Record<ReadinessBlockKey, ReadinessChecklistValue>> &
  Record<string, ReadinessChecklistValue>;

export interface ReadinessData {
  percentage: number;
  checklist: ReadinessChecklist;
  labels: Record<string, string>;
  missingRequiredSections: string[];
  canSubmitToModeration: boolean;
  readinessToModeration?: ReadinessStageData;
  readiness_to_moderation?: ReadinessStageData;
  operationalReadiness?: OperationalReadinessData;
  operational_readiness?: OperationalReadinessData;
}

export interface ReadinessStageData {
  percentage: number;
  checklist: ReadinessChecklist;
  labels?: Record<string, string>;
  requiredKeys?: string[];
  required_keys?: string[];
  missingRequiredSections?: string[];
  missing_required_sections?: string[];
  isReady?: boolean;
  is_ready?: boolean;
}

export interface OperationalReadinessData extends ReadinessStageData {
  items?: OperationalReadinessItem[];
}

export interface OperationalReadinessItem {
  key: string;
  label: string;
  deadline: string;
  completed: boolean;
  optional?: boolean;
  notApplicable?: boolean;
  not_applicable?: boolean;
}

export interface ReadinessChecklistItem {
  key: string;
  label: string;
  completed: boolean;
  optional?: boolean;
  notApplicable?: boolean;
}
