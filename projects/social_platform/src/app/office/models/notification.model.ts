/** @format */

export type NotificationCategory = "moderation" | "verification" | "expertise" | "other";

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
