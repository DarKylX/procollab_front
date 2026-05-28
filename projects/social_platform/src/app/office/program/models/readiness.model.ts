/** @format */

export type ReadinessBlockKey =
  | "basic_info"
  | "dates"
  | "registration"
  | "legal_terms"
  | "materials"
  | "criteria_experts"
  | "visual_assets"
  | "certificate_template"
  | "verification";

export type ReadinessChecklistValue = boolean | "not_applicable";
export type ReadinessChecklist = Partial<Record<ReadinessBlockKey, ReadinessChecklistValue>> &
  Record<string, ReadinessChecklistValue>;

export interface ReadinessSection {
  id: string;
  label: string;
  isReady?: boolean;
  is_ready?: boolean;
  weight: number;
  blockingForModeration?: boolean;
  blocking_for_moderation?: boolean;
  missingFields?: string[];
  missing_fields?: string[];
  missingReason?: string;
  missing_reason?: string;
  route?: string;
  section?: string;
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

export interface OperationalReadinessItem {
  key: string;
  label: string;
  deadline: string;
  completed: boolean;
  optional?: boolean;
  notApplicable?: boolean;
  not_applicable?: boolean;
}

export interface OperationalReadinessData extends ReadinessStageData {
  items?: OperationalReadinessItem[];
}

export interface ReadinessData {
  readinessPercent?: number;
  readiness_percent?: number;
  percentage: number;
  checklist: ReadinessChecklist;
  labels: Record<string, string>;
  missingRequiredSections: string[];
  missing_required_sections?: string[];
  canSubmitToModeration: boolean;
  can_submit_to_moderation?: boolean;
  sections?: ReadinessSection[];
  requiredSections?: string[];
  required_sections?: string[];
  status?: string;
  readinessToModeration?: ReadinessStageData;
  readiness_to_moderation?: ReadinessStageData;
  operationalReadiness?: OperationalReadinessData;
  operational_readiness?: OperationalReadinessData;
}

export interface ReadinessChecklistItem {
  key: string;
  label: string;
  completed: boolean;
  optional?: boolean;
  notApplicable?: boolean;
}
