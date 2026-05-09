/** @format */

export type CertificateReleaseMode = "after_program_end" | "manual";
export type CertificateIssueRule = "submitted_project";
export type CertificateType = "participation";
export type CertificateParticipantState = "unavailable" | "scheduled" | "not_released" | "available";

export interface CertificateBackgroundFile {
  link: string;
  name: string;
  extension: string;
  mimeType?: string;
  mime_type?: string;
  size?: number;
}

export interface CertificateFieldPosition {
  x: number;
  y: number;
  fontSize?: number;
  font_size?: number;
  align: "left" | "center" | "right";
  visible: boolean;
  color?: string | null;
}

export interface CertificateAssetPosition {
  x: number;
  y: number;
  width: number;
}

export type CertificateFieldPositions = Record<string, CertificateFieldPosition>;

export interface ProgramCertificateSettings {
  id?: number | null;
  program?: number;
  isEnabled: boolean;
  issueRule: CertificateIssueRule;
  releaseMode: CertificateReleaseMode;
  certificateType: CertificateType;
  showProjectTitle: boolean;
  showTeamMembers: boolean;
  showRank: boolean;
  templateName: string;
  backgroundFile?: string | null;
  backgroundFileMeta?: CertificateBackgroundFile | null;
  signatureFile?: string | null;
  signatureFileMeta?: CertificateBackgroundFile | null;
  signaturePosition?: CertificateAssetPosition | null;
  stampFile?: string | null;
  stampFileMeta?: CertificateBackgroundFile | null;
  stampPosition?: CertificateAssetPosition | null;
  companyLogoFile?: string | null;
  companyLogoFileMeta?: CertificateBackgroundFile | null;
  companyLogoPosition?: CertificateAssetPosition | null;
  signerName?: string;
  textColor: string;
  fontFamily: string;
  fieldPositions: CertificateFieldPositions;
  generatedAt?: string | null;
  releasedAt?: string | null;
  isConfigured?: boolean;
  datetimeUpdated?: string;
}

export interface IssuedCertificate {
  id: number;
  program: number;
  participant: number;
  programProject?: number | null;
  projectTitle?: string;
  participantFullName?: string;
  certificateId: string;
  status: "generated" | "error" | "revoked";
  downloadUrl?: string;
  generatedAt?: string;
  issuedAt?: string;
  downloadedAt?: string | null;
}

export interface CertificateGenerationRun {
  id: number;
  program: number;
  status: "queued" | "running" | "completed" | "failed" | "skipped";
  totalExpected: number;
  enqueuedCount: number;
  issuedCount: number;
  errorCount: number;
  errorMessage?: string;
  startedAt?: string;
  completedAt?: string;
}

export interface CertificateGenerationStats {
  issuedCount: number;
  generatedCount: number;
  pendingCount: number;
  eligibleCount: number;
  errorCount: number;
  lastRun?: CertificateGenerationRun | null;
}

export interface CertificateListResponse {
  certificates: IssuedCertificate[];
  stats: CertificateGenerationStats;
}

export interface CertificateGenerateResponse {
  run: CertificateGenerationRun;
  stats: CertificateGenerationStats;
}

export interface MyCertificateResponse {
  state: CertificateParticipantState;
  availableAt?: string | null;
  settings?: {
    isEnabled?: boolean;
    releaseMode?: CertificateReleaseMode;
    releasedAt?: string | null;
    showProjectTitle?: boolean;
  } | null;
  certificate?: IssuedCertificate | null;
}
