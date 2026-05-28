/** @format */

import { CommonModule } from "@angular/common";
import { Component, HostListener, OnDestroy, OnInit, signal } from "@angular/core";
import { Router } from "@angular/router";
import { IconComponent } from "@ui/components";
import {
  Notification,
  NotificationCategory,
  NotificationEventType,
  NotificationPreferences,
} from "@models/notification.model";
import { NotificationService } from "@services/notification.service";

type NotificationFilter = "all" | "unread" | NotificationCategory;

interface NotificationFilterOption {
  label: string;
  value: NotificationFilter;
}

interface TelegramPreferenceOption {
  label: string;
  value: NotificationEventType;
}

@Component({
  selector: "app-notifications",
  standalone: true,
  imports: [CommonModule, IconComponent],
  templateUrl: "./notifications.component.html",
  styleUrl: "./notifications.component.scss",
})
export class NotificationsComponent implements OnInit, OnDestroy {
  protected readonly notifications = signal<Notification[]>([]);
  protected readonly activeFilter = signal<NotificationFilter>("all");
  protected readonly loading = signal(false);
  protected readonly preferences = signal<NotificationPreferences | null>(null);
  protected readonly telegramLink = signal("");
  protected readonly telegramToken = signal("");
  protected readonly telegramBotUrl = signal("");
  protected readonly telegramLoading = signal(false);
  protected readonly telegramChecking = signal(false);
  protected readonly telegramError = signal("");
  protected readonly telegramNotice = signal("");
  protected readonly telegramNoticeStrong = signal(false);

  protected readonly filters: NotificationFilterOption[] = [
    { label: "Все", value: "all" },
    { label: "Непрочитанные", value: "unread" },
    { label: "Модерация", value: "moderation" },
    { label: "Верификация", value: "verification" },
    { label: "Экспертиза", value: "expertise" },
  ];

  protected readonly telegramPreferenceOptions: TelegramPreferenceOption[] = [
    { label: "Новые заявки на модерацию", value: "program_submitted_to_moderation" },
    { label: "Одобрение чемпионата", value: "program_moderation_approved" },
    { label: "Отклонение чемпионата", value: "program_moderation_rejected" },
    { label: "Заявки на верификацию", value: "company_verification_submitted" },
    { label: "Подтверждение компании", value: "company_verification_approved" },
    { label: "Отклонение верификации", value: "company_verification_rejected" },
    { label: "Назначение эксперту", value: "expert_projects_assigned" },
  ];

  private telegramPollingId: ReturnType<typeof setInterval> | null = null;
  private telegramPollingAttempts = 0;
  private readonly telegramPollingMaxAttempts = 40;

  constructor(
    private readonly notificationService: NotificationService,
    private readonly router: Router
  ) {}

  ngOnInit(): void {
    this.loadNotifications();
    this.loadPreferences();
  }

  ngOnDestroy(): void {
    this.stopTelegramStatusPolling();
  }

  @HostListener("window:focus")
  protected onWindowFocus(): void {
    this.refreshTelegramStatusAfterReturn();
  }

  @HostListener("document:visibilitychange")
  protected onVisibilityChange(): void {
    if (!document.hidden) {
      this.refreshTelegramStatusAfterReturn();
    }
  }

  protected filteredNotifications(): Notification[] {
    const filter = this.activeFilter();
    const notifications = this.notifications();

    if (filter === "all") {
      return notifications;
    }
    if (filter === "unread") {
      return notifications.filter(notification => !notification.isRead);
    }
    return notifications.filter(notification => notification.category === filter);
  }

  protected unreadCount(): number {
    return this.notifications().filter(notification => !notification.isRead).length;
  }

  protected setFilter(filter: NotificationFilter): void {
    this.activeFilter.set(filter);
  }

  protected markAllRead(): void {
    this.notificationService.markAllRead().subscribe({
      next: () => this.loadNotifications(),
    });
  }

  protected openNotification(notification: Notification): void {
    const navigate = () => {
      if (notification.url) {
        this.router
          .navigateByUrl(notification.url)
          .then(() => console.debug("Route changed from NotificationsComponent"));
      }
    };

    if (notification.isRead) {
      navigate();
      return;
    }

    this.notificationService.markRead(notification.id).subscribe({
      next: navigate,
      error: navigate,
    });
  }

  protected notificationIcon(notification: Notification): string {
    if (notification.category === "expertise") {
      return "task";
    }
    if (notification.category === "verification") {
      return "person";
    }
    if (notification.type.includes("approved")) {
      return "circle-check";
    }
    if (notification.type.includes("rejected")) {
      return "deadline";
    }
    return "bell";
  }

  protected notificationDate(notification: Notification): string {
    return new Date(notification.createdAt).toLocaleString("ru-RU", {
      day: "2-digit",
      month: "long",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  protected telegramPreferenceEnabled(type: NotificationEventType): boolean {
    const state = this.preferences()?.telegramPreferencesState ?? {};
    return state[type] ?? state[this.camelizePreferenceKey(type)] ?? false;
  }

  protected createTelegramLink(): void {
    this.telegramLoading.set(true);
    this.telegramError.set("");
    this.telegramNotice.set("");
    this.telegramNoticeStrong.set(false);

    this.notificationService.createTelegramLink().subscribe({
      next: response => {
        const token = response.token || this.extractTelegramStartToken(response.link);
        const botUrl = response.botUrl || this.extractTelegramBotUrl(response.link);

        this.telegramLink.set(response.link);
        this.telegramToken.set(token);
        this.telegramBotUrl.set(botUrl);
        this.startTelegramStatusPolling();
        this.telegramLoading.set(false);
      },
      error: () => {
        this.telegramError.set("Не удалось создать ссылку подключения");
        this.telegramLoading.set(false);
      },
    });
  }

  protected disconnectTelegram(): void {
    this.telegramLoading.set(true);
    this.telegramError.set("");
    this.telegramNotice.set("");
    this.telegramNoticeStrong.set(false);
    this.stopTelegramStatusPolling();

    this.notificationService.disconnectTelegram().subscribe({
      next: () => {
        this.telegramLink.set("");
        this.telegramToken.set("");
        this.telegramBotUrl.set("");
        this.loadPreferences();
        this.telegramLoading.set(false);
      },
      error: () => {
        this.telegramError.set("Не удалось отключить Telegram");
        this.telegramLoading.set(false);
      },
    });
  }

  protected openTelegramLink(): void {
    const link = this.telegramBotUrl() || this.telegramLink();

    if (link) {
      this.startTelegramStatusPolling();
      window.open(link, "_blank", "noopener,noreferrer");
    }
  }

  protected copyTelegramLink(): void {
    const token = this.telegramToken();

    if (!token || !navigator.clipboard) {
      return;
    }

    navigator.clipboard.writeText(token).catch(() => undefined);
    this.telegramNotice.set("Токен скопирован.");
    this.telegramNoticeStrong.set(false);
  }

  protected toggleTelegramPreference(type: NotificationEventType, event: Event): void {
    const target = event.target as HTMLInputElement;

    this.notificationService
      .updatePreferences({ telegramPreferences: { [type]: target.checked } })
      .subscribe({
        next: preferences => this.applyTelegramPreferences(preferences),
        error: () => this.telegramError.set("Не удалось сохранить настройки Telegram"),
      });
  }

  protected checkTelegramConnection(): void {
    this.refreshTelegramStatus(true);
  }

  private loadNotifications(): void {
    this.loading.set(true);
    this.notificationService.getNotifications({ page: 1, page_size: 100 }).subscribe({
      next: response => {
        this.notifications.set(response.results);
        this.notificationService.refreshSummary();
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  private loadPreferences(): void {
    this.notificationService.getPreferences({ fresh: true }).subscribe({
      next: preferences => this.applyTelegramPreferences(preferences),
    });
  }

  private applyTelegramPreferences(preferences: NotificationPreferences): void {
    this.preferences.set(preferences);

    if (preferences.telegramConnected) {
      this.telegramLink.set("");
      this.telegramToken.set("");
      this.telegramBotUrl.set("");
      this.telegramError.set("");
      this.telegramNotice.set("Telegram подключен к вашему аккаунту.");
      this.telegramNoticeStrong.set(false);
      this.stopTelegramStatusPolling();
    }
  }

  private startTelegramStatusPolling(): void {
    if (this.telegramPollingId) {
      return;
    }

    this.telegramPollingAttempts = 0;
    this.telegramPollingId = setInterval(() => {
      this.telegramPollingAttempts += 1;
      this.refreshTelegramStatus(false);

      if (this.telegramPollingAttempts >= this.telegramPollingMaxAttempts) {
        this.stopTelegramStatusPolling();
        this.telegramNotice.set("Если бот уже ответил, нажмите «Проверить подключение».");
        this.telegramNoticeStrong.set(true);
      }
    }, 3000);
  }

  private stopTelegramStatusPolling(): void {
    if (!this.telegramPollingId) {
      return;
    }

    clearInterval(this.telegramPollingId);
    this.telegramPollingId = null;
    this.telegramPollingAttempts = 0;
  }

  private refreshTelegramStatus(showPendingMessage: boolean): void {
    this.telegramChecking.set(true);

    this.notificationService.getPreferences({ fresh: true }).subscribe({
      next: preferences => {
        this.applyTelegramPreferences(preferences);
        if (!preferences.telegramConnected && showPendingMessage) {
          this.telegramNotice.set("Подключение пока не подтверждено. Отправьте токен боту и повторите проверку.");
          this.telegramNoticeStrong.set(true);
        }
        this.telegramChecking.set(false);
      },
      error: () => {
        if (showPendingMessage) {
          this.telegramError.set("Не удалось проверить подключение Telegram");
        }
        this.telegramChecking.set(false);
      },
    });
  }

  private refreshTelegramStatusAfterReturn(): void {
    if (!this.telegramToken() && !this.telegramPollingId) {
      return;
    }
    this.refreshTelegramStatus(false);
  }

  private extractTelegramStartToken(link: string): string {
    try {
      return new URL(link).searchParams.get("start") || "";
    } catch {
      const match = link.match(/[?&]start=([^&]+)/);
      return match ? decodeURIComponent(match[1]) : "";
    }
  }

  private extractTelegramBotUrl(link: string): string {
    try {
      const url = new URL(link);
      return `${url.origin}${url.pathname}`.replace(/\/$/, "");
    } catch {
      return link.split("?", 1)[0];
    }
  }

  private camelizePreferenceKey(type: NotificationEventType): string {
    return type.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase());
  }
}
