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
  object_type: string;
  object_id: number | null;
  url: string;
  is_read: boolean;
  created_at: string;
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
  email_reminders_enabled: boolean;
  email_moderation_results: boolean;
  email_verification_results: boolean;
  email_certificate_ready: boolean;
  email_deadline_warnings: boolean;
  inapp_notifications_enabled: boolean;
  telegram_connected: boolean;
  telegram_username: string | null;
  telegram_preferences_state: Record<NotificationEventType, boolean>;
}

export interface NotificationPreferencesPatch {
  telegram_preferences?: Partial<Record<NotificationEventType, boolean>>;
}

export interface TelegramLinkResponse {
  link: string;
  expires_at: string;
}
