/** @format */

import { CommonModule } from "@angular/common";
import { Component, OnInit, signal } from "@angular/core";
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
export class NotificationsComponent implements OnInit {
  protected readonly notifications = signal<Notification[]>([]);
  protected readonly activeFilter = signal<NotificationFilter>("all");
  protected readonly loading = signal(false);
  protected readonly preferences = signal<NotificationPreferences | null>(null);
  protected readonly telegramLink = signal("");
  protected readonly telegramLoading = signal(false);
  protected readonly telegramError = signal("");

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

  constructor(
    private readonly notificationService: NotificationService,
    private readonly router: Router
  ) {}

  ngOnInit(): void {
    this.loadNotifications();
    this.loadPreferences();
  }

  protected filteredNotifications(): Notification[] {
    const filter = this.activeFilter();
    const notifications = this.notifications();

    if (filter === "all") {
      return notifications;
    }
    if (filter === "unread") {
      return notifications.filter(notification => !notification.is_read);
    }
    return notifications.filter(notification => notification.category === filter);
  }

  protected unreadCount(): number {
    return this.notifications().filter(notification => !notification.is_read).length;
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

    if (notification.is_read) {
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
    return new Date(notification.created_at).toLocaleString("ru-RU", {
      day: "2-digit",
      month: "long",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  protected telegramPreferenceEnabled(type: NotificationEventType): boolean {
    return this.preferences()?.telegram_preferences_state?.[type] ?? false;
  }

  protected createTelegramLink(): void {
    this.telegramLoading.set(true);
    this.telegramError.set("");

    this.notificationService.createTelegramLink().subscribe({
      next: response => {
        this.telegramLink.set(response.link);
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

    this.notificationService.disconnectTelegram().subscribe({
      next: () => {
        this.telegramLink.set("");
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
    const link = this.telegramLink();

    if (link) {
      window.open(link, "_blank", "noopener,noreferrer");
    }
  }

  protected copyTelegramLink(): void {
    const link = this.telegramLink();

    if (!link || !navigator.clipboard) {
      return;
    }

    navigator.clipboard.writeText(link).catch(() => undefined);
  }

  protected toggleTelegramPreference(type: NotificationEventType, event: Event): void {
    const target = event.target as HTMLInputElement;

    this.notificationService
      .updatePreferences({ telegram_preferences: { [type]: target.checked } })
      .subscribe({
        next: preferences => this.preferences.set(preferences),
        error: () => this.telegramError.set("Не удалось сохранить настройки Telegram"),
      });
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
    this.notificationService.getPreferences().subscribe({
      next: preferences => this.preferences.set(preferences),
    });
  }
}
