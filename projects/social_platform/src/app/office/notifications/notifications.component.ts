/** @format */

import { CommonModule } from "@angular/common";
import { Component, OnInit, signal } from "@angular/core";
import { Router } from "@angular/router";
import { IconComponent } from "@ui/components";
import { Notification, NotificationCategory } from "@models/notification.model";
import { NotificationService } from "@services/notification.service";

type NotificationFilter = "all" | "unread" | NotificationCategory;

interface NotificationFilterOption {
  label: string;
  value: NotificationFilter;
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

  protected readonly filters: NotificationFilterOption[] = [
    { label: "Все", value: "all" },
    { label: "Непрочитанные", value: "unread" },
    { label: "Модерация", value: "moderation" },
    { label: "Верификация", value: "verification" },
    { label: "Экспертиза", value: "expertise" },
  ];

  constructor(
    private readonly notificationService: NotificationService,
    private readonly router: Router
  ) {}

  ngOnInit(): void {
    this.loadNotifications();
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
}
