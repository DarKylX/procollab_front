/** @format */

import { CommonModule } from "@angular/common";
import { ChangeDetectionStrategy, Component, Input, Output, EventEmitter } from "@angular/core";
import { InviteManageCardComponent, ProfileInfoComponent, IconComponent } from "@uilib";
import { ClickOutsideModule } from "ng-click-outside";
import type { Invite } from "@office/models/invite.model";
import type { Notification } from "@office/models/notification.model";
import type { User } from "../../../models/user.model";
import { UserData } from "projects/skills/src/models/profile.model";

/**
 * Компонент панели управления профилем
 *
 * Отображает кнопки для уведомлений, чатов и выхода из системы.
 * Включает выпадающую панель с уведомлениями и приглашениями.
 * Показывает информацию о текущем пользователе.
 *
 * @example
 * \`\`\`html
 * <app-profile-control-panel
 *   [user]="currentUser"
 *   [invites]="userInvites"
 *   [hasNotifications]="true"
 *   [hasUnreads]="false"
 *   (acceptInvite)="onAcceptInvite($event)"
 *   (rejectInvite)="onRejectInvite($event)"
 *   (logout)="onLogout()">
 * </app-profile-control-panel>
 * \`\`\`
 */
@Component({
  selector: "app-profile-control-panel",
  standalone: true,
  imports: [
    CommonModule,
    InviteManageCardComponent,
    ProfileInfoComponent,
    ClickOutsideModule,
    IconComponent,
  ],
  templateUrl: "./profile-control-panel.component.html",
  styleUrl: "./profile-control-panel.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProfileControlPanelComponent {
  /** Данные текущего пользователя */
  @Input({ required: true }) user!: User | UserData | null;

  /** Массив приглашений пользователя */
  @Input({ required: true }) invites!: Invite[];

  /** Флаг наличия уведомлений */
  @Input({ required: true }) hasNotifications = false;

  @Input() notificationUnreadCount = 0;

  @Input() notifications: Notification[] = [];

  /** Флаг наличия непрочитанных сообщений */
  @Input({ required: true }) hasUnreads = false;

  /** Событие принятия приглашения (передает ID приглашения) */
  @Output() acceptInvite = new EventEmitter<number>();

  /** Событие отклонения приглашения (передает ID приглашения) */
  @Output() rejectInvite = new EventEmitter<number>();

  /** Событие выхода из системы */
  @Output() logout = new EventEmitter();

  @Output() notificationClick = new EventEmitter<Notification>();

  @Output() markAllNotificationsRead = new EventEmitter<void>();

  @Output() openNotificationsPage = new EventEmitter<void>();

  /**
   * Проверяет наличие неотвеченных приглашений
   * @returns true если есть приглашения без ответа
   */
  get hasInvites(): boolean {
    return !!this.invites.filter(invite => invite.isAccepted === null).length;
  }

  get hasNotificationItems(): boolean {
    return this.notifications.length > 0;
  }

  notificationIcon(notification: Notification): string {
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

  notificationTime(notification: Notification): string {
    return new Date(notification.created_at).toLocaleString("ru-RU", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  /** Флаг отображения панели уведомлений */
  showNotifications = false;

  /**
   * Обработчик клика вне панели уведомлений
   * Скрывает панель уведомлений
   */
  onClickOutside() {
    this.showNotifications = false;
  }
}
