/** @format */

import { ApiPagination } from "@models/api-pagination.model";
import {
  ProgramVerificationRequest,
  VerificationRequestStatus,
} from "@office/program/models/program-verification.model";

export type { ProgramVerificationRequest } from "@office/program/models/program-verification.model";

export interface RejectionReason {
  code: string;
  label: string;
}

export interface ModerationLog {
  id: number;
  actor?: {
    id: number;
    fullName: string;
    email: string;
  } | null;
  action: string;
  actionLabel?: string;
  comment?: string;
  reasonCode?: string;
  reasonLabel?: string;
  createdAt?: string;
  datetimeCreated?: string;
}

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

export type ModerationVerificationPage = ApiPagination<ProgramVerificationRequest>;
