/** @format */

import type { Program } from "./program.model";

export type VerificationStatus =
  | "not_requested"
  | "pending"
  | "verified"
  | "rejected"
  | "revoked";

export type VerificationRequestStatus = "pending" | "approved" | "rejected";

export interface VerificationPerson {
  id?: number;
  email?: string;
  fullName?: string;
}

export interface VerificationDocument {
  id?: number;
  name?: string;
  link?: string;
  url?: string;
  extension?: string;
  mimeType?: string;
  size?: number;
  datetimeUploaded?: string;
  datetimeCreated?: string;
}

export interface ProgramVerificationRequest {
  id: number;
  status: VerificationRequestStatus;
  companyName: string;
  inn: string;
  legalName?: string;
  ogrn?: string;
  website?: string;
  region?: string;
  contactFullName: string;
  contactPosition: string;
  contactEmail: string;
  contactPhone: string;
  companyRoleDescription: string;
  documents: VerificationDocument[];
  submittedAt?: string;
  decidedAt?: string;
  reviewedAt?: string;
  reasonCode?: string;
  rejectionReason?: string;
  rejectionReasonLabel?: string;
  adminComment?: string;
  initiator?: VerificationPerson | null;
  submittedBy?: VerificationPerson | null;
  decidedBy?: VerificationPerson | null;
  reviewedBy?: VerificationPerson | null;
  program?: Partial<Program> & {
    verificationStatus?: VerificationStatus;
  };
}

export interface ProgramVerificationCompanyData {
  companyName?: string;
  inn?: string;
  legalName?: string;
  ogrn?: string;
  website?: string;
  region?: string;
}

export interface ProgramVerificationState {
  verificationStatus: VerificationStatus;
  currentStatus?: VerificationStatus;
  isVerified: boolean;
  verifiedCompanyName?: string;
  companyData?: ProgramVerificationCompanyData | null;
  latestSubmittedAt?: string | null;
  decidedAt?: string | null;
  rejectionReason?: string;
  adminComment?: string;
  latestRequest?: ProgramVerificationRequest | null;
  requestsHistory?: ProgramVerificationRequest[];
  history?: ProgramVerificationRequest[];
}

export interface ProgramVerificationSubmitPayload {
  companyName: string;
  inn: string;
  legalName?: string;
  ogrn?: string;
  website?: string;
  region?: string;
  contactFullName: string;
  contactPosition: string;
  contactEmail: string;
  contactPhone: string;
  companyRoleDescription: string;
  documents: string[];
}
