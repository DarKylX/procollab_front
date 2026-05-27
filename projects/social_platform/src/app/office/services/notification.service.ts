/** @format */

import { Injectable } from "@angular/core";
import { HttpParams } from "@angular/common/http";
import { BehaviorSubject, map, Observable, tap } from "rxjs";
import { ApiService } from "projects/core";
import {
  Notification,
  NotificationListResponse,
  NotificationPreferences,
  NotificationPreferencesPatch,
  NotificationQueryParams,
  TelegramLinkResponse,
} from "@models/notification.model";

@Injectable({
  providedIn: "root",
})
export class NotificationService {
  private readonly NOTIFICATIONS_URL = "/notifications";

  private readonly notificationsSubject = new BehaviorSubject<Notification[]>([]);
  private readonly unreadCountSubject = new BehaviorSubject<number>(0);

  readonly notifications$ = this.notificationsSubject.asObservable();
  readonly unreadCount$ = this.unreadCountSubject.asObservable();
  readonly hasNotifications = this.unreadCount$.pipe(map(count => count > 0));

  constructor(private readonly apiService: ApiService) {}

  getNotifications(params: NotificationQueryParams = {}): Observable<NotificationListResponse> {
    return this.apiService.get<NotificationListResponse>(
      `${this.NOTIFICATIONS_URL}/`,
      this.toHttpParams(params)
    );
  }

  loadLatest(limit = 7): void {
    this.getNotifications({ page: 1, page_size: limit }).subscribe({
      next: response => this.notificationsSubject.next(response.results),
    });
  }

  loadUnreadCount(): void {
    this.apiService
      .get<{ count: number }>(`${this.NOTIFICATIONS_URL}/unread-count/`)
      .subscribe({
        next: response => this.unreadCountSubject.next(response.count),
      });
  }

  refreshSummary(): void {
    this.loadLatest();
    this.loadUnreadCount();
  }

  markRead(id: number): Observable<Notification> {
    return this.apiService
      .post<Notification>(`${this.NOTIFICATIONS_URL}/${id}/read/`, {})
      .pipe(
        tap(notification => {
          const updated = this.notificationsSubject.value.map(item =>
            item.id === id ? notification : item
          );
          this.notificationsSubject.next(updated);
          this.loadUnreadCount();
        })
      );
  }

  markAllRead(): Observable<{ updated: number }> {
    return this.apiService
      .post<{ updated: number }>(`${this.NOTIFICATIONS_URL}/mark-all-read/`, {})
      .pipe(
        tap(() => {
          this.notificationsSubject.next(
            this.notificationsSubject.value.map(notification => ({
              ...notification,
              is_read: true,
            }))
          );
          this.unreadCountSubject.next(0);
        })
      );
  }

  getPreferences(options: { fresh?: boolean } = {}): Observable<NotificationPreferences> {
    const params = options.fresh ? new HttpParams().set("_", Date.now().toString()) : undefined;
    return this.apiService.get<NotificationPreferences>(
      "/auth/users/me/notification-preferences/",
      params
    );
  }

  updatePreferences(payload: NotificationPreferencesPatch): Observable<NotificationPreferences> {
    return this.apiService.patch<NotificationPreferences>(
      "/auth/users/me/notification-preferences/",
      payload
    );
  }

  createTelegramLink(): Observable<TelegramLinkResponse> {
    return this.apiService.post<TelegramLinkResponse>("/auth/users/me/telegram-link/", {});
  }

  disconnectTelegram(): Observable<void> {
    return this.apiService.delete<void>("/auth/users/me/telegram-link/");
  }

  private toHttpParams(query: NotificationQueryParams): HttpParams {
    let params = new HttpParams();

    Object.entries(query).forEach(([key, value]) => {
      if (value === undefined || value === null || value === "") {
        return;
      }
      params = params.set(key, String(value));
    });

    return params;
  }
}
