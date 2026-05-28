/** @format */

export type NotificationCategory = "moderation" | "verification" | "expertise" | "other";

export type NotificationEventType =
  | "program_submitted_to_moderation"
  | "program_moderation_approved"
  | "program_moderation_rejected"
  | "company_verification_submitted"
  | "company_verification_approved"
  | "company_verification_rejected"
  | "expert_projects_assigned";

export interface Notification {
  id: number;
  type: string;
  title: string;
  message: string;
  objectType: string;
  objectId: number | null;
  url: string;
  isRead: boolean;
  createdAt: string;
  category: NotificationCategory;
}

export interface NotificationListResponse {
  count: number;
  next: string | null;
  previous: string | null;
  results: Notification[];
}

export interface NotificationQueryParams {
  unread_only?: boolean;
  type?: string;
  page?: number;
  page_size?: number;
}

export interface NotificationPreferences {
  emailRemindersEnabled: boolean;
  emailModerationResults: boolean;
  emailVerificationResults: boolean;
  emailCertificateReady: boolean;
  emailDeadlineWarnings: boolean;
  inappNotificationsEnabled: boolean;
  telegramConnected: boolean;
  telegramUsername: string | null;
  telegramPreferencesState: Record<string, boolean>;
}

export interface NotificationPreferencesPatch {
  telegramPreferences?: Partial<Record<NotificationEventType, boolean>>;
}

export interface TelegramLinkResponse {
  link: string;
  token: string;
  botUrl: string;
  expiresAt: string;
}
