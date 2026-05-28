/** @format */

import { ApiPagination } from "@models/api-pagination.model";
import {
  ProgramVerificationRequest,
  VerificationRequestPage,
  VerificationRequestStatus,
} from "@office/program/models/program-verification.model";
import { ProgramDataSchema } from "@office/program/models/program.model";

export type { ProgramVerificationRequest } from "@office/program/models/program-verification.model";

export type ModerationProgramStatus =
  | "draft"
  | "pending_moderation"
  | "rejected"
  | "published"
  | "completed"
  | "frozen"
  | "archived";

export type ModerationProgramStatusFilter = ModerationProgramStatus | "all" | "attention";

export interface ModerationCompany {
  id: number;
  name: string;
  inn?: string;
}

export interface ModerationPerson {
  id: number;
  fullName: string;
  email: string;
  company?: ModerationCompany | null;
  publishedProgramsCount?: number;
  completedProgramsCount?: number;
}

export interface ModerationMaterial {
  id: number;
  title: string;
  url: string;
  type?: "file" | "link";
  size?: number | null;
  datetimeCreated?: string;
}

export interface ModerationCriterion {
  id: number;
  name: string;
  description: string;
  type: string;
  minValue?: number | null;
  maxValue?: number | null;
  weight: number;
}

export interface ModerationExpert {
  id: number;
  userId: number;
  fullName: string;
  email: string;
  organization?: string;
  avatar?: string;
  status?: string;
}

export interface ModerationLog {
  id: number;
  actor?: ModerationPerson | null;
  author?: ModerationPerson | null;
  action: string;
  actionLabel?: string;
  oldStatus?: string;
  newStatus?: string;
  statusBefore?: string;
  statusAfter?: string;
  comment?: string;
  reasonCode?: string;
  reasonLabel?: string;
  rejectionReason?: string;
  rejectionReasonLabel?: string;
  sectionsToFix?: string[];
  createdAt?: string;
  datetimeCreated?: string;
}

export interface ModerationPrivacyFieldWarning {
  fieldId?: string;
  label?: string;
  term?: string;
  source?: string;
}

export interface ModerationPrivacyWarnings {
  missingLegalDocuments?: string[];
  organizerTermsNotAccepted?: boolean;
  forbiddenRegistrationFields?: ModerationPrivacyFieldWarning[];
}

export interface ModerationProgramListItem {
  id: number;
  name: string;
  description?: string;
  tag?: string;
  city?: string;
  imageAddress?: string;
  coverImageAddress?: string;
  mobileCoverImageAddress?: string;
  advertisementImageAddress?: string;
  datetimeStarted?: string;
  datetimeFinished?: string;
  datetimeRegistrationEnds?: string;
  datetimeProjectSubmissionEnds?: string;
  datetimeEvaluationEnds?: string;
  datetimeCreated?: string;
  datetimeUpdated?: string;
  status: ModerationProgramStatus;
  verificationStatus?: string;
  isPrivate?: boolean;
  registrationLink?: string | null;
  accessType?: "open" | "closed";
  registrationType?: "internal" | "external";
  company?: ModerationCompany | null;
  isCompanyVerified?: boolean;
  organizers?: ModerationPerson[];
  managers?: ModerationPerson[];
  managersEmails?: string[];
  submittedAt?: string | null;
  decisionAt?: string | null;
  readiness?: Record<string, boolean | "not_applicable">;
  readinessPercentage?: number;
  participantsCount?: number;
  moderationDeadlineAt?: string | null;
  moderationOverdueSeconds?: number;
}

export interface ModerationProgramDetail extends ModerationProgramListItem {
  presentationAddress?: string;
  isCompetitive?: boolean;
  isDistributedEvaluation?: boolean;
  maxProjectRates?: number | null;
  dataSchema?: ProgramDataSchema;
  projectsAvailability?: string;
  publishProjectsAfterFinish?: boolean;
  participationFormat?: "individual" | "team";
  projectTeamMinSize?: number | null;
  projectTeamMaxSize?: number | null;
  materials?: ModerationMaterial[];
  criteria?: ModerationCriterion[];
  experts?: ModerationExpert[];
  operationalReadinessPercentage?: number;
  moderationHistory?: ModerationLog[];
  privacyWarnings?: ModerationPrivacyWarnings;
}

export interface ModerationDecisionPayload {
  decision: "approve" | "reject";
  comment?: string;
  reasonCode?: string;
  sectionsToFix?: string[];
}

export interface ModerationDecisionResponse {
  log: ModerationLog;
  program: {
    id: number;
    status: ModerationProgramStatus;
    draft?: boolean;
  };
}

export interface RejectionReason {
  code: string;
  label: string;
}

export type ModerationProgramPage = ApiPagination<ModerationProgramListItem>;

export type ModerationVerificationRequestStatus = VerificationRequestStatus;

export interface ModerationVerificationQuery {
  status?: ModerationVerificationRequestStatus;
  search?: string;
  ordering?: string;
  page?: number;
  pageSize?: number;
}

export interface ModerationVerificationDecisionPayload {
  decision: "approve" | "reject";
  comment?: string;
  reasonCode?: string;
}

export interface ModerationVerificationDecisionResponse {
  request: ProgramVerificationRequest;
  log: ModerationLog;
  program: {
    id: number;
    status?: string;
    verificationStatus?: string;
    companyId?: number | null;
  };
}

export type ModerationVerificationPage = VerificationRequestPage;
