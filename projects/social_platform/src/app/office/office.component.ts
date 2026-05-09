/** @format */

import { Component, HostListener, OnDestroy, OnInit, signal, Signal } from "@angular/core";
import { IndustryService } from "@services/industry.service";
import { forkJoin, map, noop, Subscription } from "rxjs";
import { ActivatedRoute, Router, RouterOutlet, RouterLink } from "@angular/router";
import { Invite } from "@models/invite.model";
import { AuthService } from "@auth/services";
import { User } from "@auth/models/user.model";
import { ChatService } from "@services/chat.service";
import { SnackbarComponent } from "@ui/components/snackbar/snackbar.component";
import { DeleteConfirmComponent } from "@ui/components/delete-confirm/delete-confirm.component";
import { ButtonComponent, IconComponent } from "@ui/components";
import { ModalComponent } from "@ui/components/modal/modal.component";
import { NavComponent } from "./features/nav/nav.component";
import { ProfileControlPanelComponent, SidebarComponent } from "@uilib";
import { AsyncPipe } from "@angular/common";
import { InviteService } from "@services/invite.service";
import { toSignal } from "@angular/core/rxjs-interop";
import { ProgramSidebarCardComponent } from "./features/program-sidebar-card/program-sidebar-card.component";
import { ProgramService } from "./program/services/program.service";
import { Program } from "./program/models/program.model";
import { ProjectRatingService } from "./program/services/project-rating.service";
import { NotificationService } from "@services/notification.service";
import type { Notification } from "@models/notification.model";

type OfficeNavItem = {
  name: string;
  icon: string;
  link: string;
  isExternal?: boolean;
  isActive?: boolean;
};

/**
 * Главный компонент офиса - корневой компонент рабочего пространства
 * Управляет общим состоянием приложения, навигацией и модальными окнами
 *
 * Принимает:
 * - Данные о приглашениях через резолвер
 * - События от сервисов (auth, chat, invite)
 *
 * Возвращает:
 * - Рендерит основной интерфейс офиса с сайдбаром, навигацией и роутер-аутлетом
 * - Управляет модальными окнами для верификации и приглашений
 */
@Component({
  selector: "app-office",
  templateUrl: "./office.component.html",
  styleUrl: "./office.component.scss",
  standalone: true,
  imports: [
    SidebarComponent,
    NavComponent,
    RouterOutlet,
    ModalComponent,
    ButtonComponent,
    DeleteConfirmComponent,
    SnackbarComponent,
    AsyncPipe,
    RouterLink,
    IconComponent,
    ProfileControlPanelComponent,
    ProgramSidebarCardComponent,
  ],
})
export class OfficeComponent implements OnInit, OnDestroy {
  constructor(
    private readonly industryService: IndustryService,
    private readonly route: ActivatedRoute,
    public readonly authService: AuthService,
    private readonly inviteService: InviteService,
    private readonly router: Router,
    public readonly chatService: ChatService,
    private readonly programService: ProgramService,
    private readonly projectRatingService: ProjectRatingService,
    private readonly notificationService: NotificationService
  ) {}

  readonly notifications$ = this.notificationService.notifications$;
  readonly notificationUnreadCount$ = this.notificationService.unreadCount$;

  invites: Signal<Invite[]> = toSignal(
    this.route.data.pipe(
      map(r => r["invites"]),
      map(invites => invites.filter((invite: Invite) => invite.isAccepted === null))
    )
  );

  profile?: User;

  waitVerificationModal = false;
  waitVerificationAccepted = false;

  inviteErrorModal = false;

  protected readonly programs = signal<Program[]>([]);
  protected showExpertEvaluationsLink = false;
  protected mobileDrawerOpen = false;

  navItems: OfficeNavItem[] = [];

  subscriptions$: Subscription[] = [];

  ngOnInit(): void {
    this.notificationService.refreshSummary();

    const globalSubscription$ = forkJoin([this.industryService.getAll()]).subscribe(noop);
    this.subscriptions$.push(globalSubscription$);

    const profileSub$ = this.authService.profile.subscribe(profile => {
      this.profile = profile;
      this.buildNavItems(profile);
      this.setupExpertEvaluationEntry(profile);

      if (!this.profile.doesCompleted()) {
        this.router
          .navigateByUrl("/office/onboarding")
          .then(() => console.debug("Route changed from OfficeComponent"));
      } else if (this.profile.verificationDate === null) {
        this.waitVerificationModal = true;
      }
    });
    this.subscriptions$.push(profileSub$);

    this.chatService.connect().subscribe(() => {
      this.chatService.onSetOffline().subscribe(evt => {
        this.chatService.setOnlineStatus(evt.userId, false);
      });

      this.chatService.onSetOnline().subscribe(evt => {
        this.chatService.setOnlineStatus(evt.userId, true);
      });
    });

    if (!this.router.url.includes("chats")) {
      this.chatService.hasUnreads().subscribe(unreads => {
        this.chatService.unread$.next(unreads);
      });
    }

    if (localStorage.getItem("waitVerificationAccepted") === "true") {
      this.waitVerificationAccepted = true;
    }

    if (!this.router.url.split("?")[0].startsWith("/office/program")) {
      const programsSub$ = this.programService.getActualPrograms().subscribe({
        next: ({ results: programs }) => {
          const resultPrograms = programs.filter(
            (program: Program) => Date.now() < Date.parse(program.datetimeRegistrationEnds)
          );
          this.programs.set(resultPrograms.slice(0, 3));
        },
      });

      this.subscriptions$.push(programsSub$);
    }
  }

  ngOnDestroy(): void {
    this.subscriptions$.forEach($ => $.unsubscribe());
  }

  @HostListener("document:keydown.escape")
  onEscape(): void {
    this.closeMobileDrawer();
  }

  protected openMobileDrawer(): void {
    this.mobileDrawerOpen = true;
  }

  protected closeMobileDrawer(): void {
    this.mobileDrawerOpen = false;
  }

  protected onMobileNavClick(): void {
    this.closeMobileDrawer();
  }

  protected navItemUrl(item: OfficeNavItem): string {
    return item.link.startsWith("/") ? item.link : `/office/${item.link}`;
  }

  protected isMobileNavItemActive(item: OfficeNavItem): boolean {
    const currentUrl = this.router.url.split("?")[0].split("#")[0];

    if (this.isProjectRatingRoute(currentUrl)) {
      return item.link === "expert/evaluations";
    }

    const itemUrl = this.navItemUrl(item);

    return currentUrl === itemUrl || currentUrl.startsWith(`${itemUrl}/`);
  }

  protected profileInitials(user: User): string {
    const firstNameInitial = user.firstName?.trim().charAt(0) ?? "";
    const lastNameInitial = user.lastName?.trim().charAt(0) ?? "";

    return `${firstNameInitial}${lastNameInitial}` || "P";
  }

  onAcceptWaitVerification() {
    this.waitVerificationAccepted = true;
    localStorage.setItem("waitVerificationAccepted", "true");
  }

  onRejectInvite(inviteId: number): void {
    this.inviteService.rejectInvite(inviteId).subscribe({
      next: () => {
        const index = this.invites().findIndex(invite => invite.id === inviteId);
        this.invites().splice(index, 1);
      },
      error: () => {
        this.inviteErrorModal = true;
      },
    });
  }

  onAcceptInvite(inviteId: number): void {
    this.inviteService.acceptInvite(inviteId).subscribe({
      next: () => {
        const index = this.invites().findIndex(invite => invite.id === inviteId);
        const invite = JSON.parse(JSON.stringify(this.invites()[index]));
        this.invites().splice(index, 1);

        this.router
          .navigateByUrl(`/office/projects/${invite.project.id}`)
          .then(() => console.debug("Route changed from SidebarComponent"));
      },
      error: () => {
        this.inviteErrorModal = true;
      },
    });
  }

  onLogout() {
    this.authService
      .logout()
      .subscribe(() =>
        this.router
          .navigateByUrl("/auth")
          .then(() => console.debug("Route changed from OfficeComponent"))
      );
  }

  onNotificationClick(notification: Notification): void {
    const navigate = () => {
      if (notification.url) {
        this.router
          .navigateByUrl(notification.url)
          .then(() => console.debug("Route changed from OfficeComponent notification"));
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

  onMarkAllNotificationsRead(): void {
    this.notificationService.markAllRead().subscribe();
  }

  onOpenNotificationsPage(): void {
    this.closeMobileDrawer();
    this.router
      .navigateByUrl("/office/notifications")
      .then(() => console.debug("Route changed from OfficeComponent notifications"));
  }

  private buildNavItems(profile: User) {
    this.navItems = [
      { name: "мой профиль", icon: "person", link: `profile/${profile.id}` },
      { name: "новости", icon: "feed", link: "feed" },
      { name: "проекты", icon: "projects", link: "projects" },
      { name: "участники", icon: "people-bold", link: "members" },
      { name: "чемпионаты", icon: "program", link: "program" },
      { name: "уведомления", icon: "bell", link: "notifications" },
      { name: "курсы", icon: "trajectories", link: "courses" },
    ];

    if (this.showExpertEvaluationsLink) {
      this.navItems.splice(5, 0, {
        name: "оценка проектов",
        icon: "task",
        link: "expert/evaluations",
      });
    }

    if (profile.isStaff) {
      this.navItems.splice(6, 0, {
        name: "модерация",
        icon: "deadline",
        link: "admin/moderation",
      });
    }
  }

  private setupExpertEvaluationEntry(profile: User): void {
    if (profile.isStaff) {
      this.showExpertEvaluationsLink = true;
      this.buildNavItems(profile);
      return;
    }

    const expertProgramsSub$ = this.projectRatingService.getExpertEvaluationPrograms().subscribe({
      next: programs => {
        this.showExpertEvaluationsLink = programs.length > 0;
        this.buildNavItems(profile);
      },
      error: () => {
        this.showExpertEvaluationsLink = false;
        this.buildNavItems(profile);
      },
    });

    this.subscriptions$.push(expertProgramsSub$);
  }

  private isProjectRatingRoute(url: string): boolean {
    return /^\/office\/program\/[^/]+\/projects-rating/.test(url);
  }
}
