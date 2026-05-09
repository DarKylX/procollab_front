/** @format */

import { AsyncPipe, CommonModule } from "@angular/common";
import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, inject, signal } from "@angular/core";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { FormControl, ReactiveFormsModule } from "@angular/forms";
import { ActivatedRoute, Router, RouterLink } from "@angular/router";
import { debounceTime, distinctUntilChanged, finalize } from "rxjs";
import { AuthService } from "@auth/services";
import {
  ModerationPerson,
  ModerationProgramListItem,
  ModerationProgramPage,
  ModerationProgramStatusFilter,
  ModerationProgramStatus,
} from "../moderation.models";
import { ModerationService } from "../moderation.service";
import {
  ProgramStatus,
  ProgramStatusBadgeComponent,
} from "@office/program/shared/program-status-badge/program-status-badge.component";
import { ButtonComponent } from "@ui/components";
import { LoaderComponent } from "@ui/components/loader/loader.component";

interface StatusTab {
  value: ModerationProgramStatusFilter;
  label: string;
}

type MobileFilter = "new" | "urgent" | "all";

@Component({
  selector: "app-moderation-list",
  standalone: true,
  imports: [
    CommonModule,
    AsyncPipe,
    ReactiveFormsModule,
    RouterLink,
    ButtonComponent,
    LoaderComponent,
    ProgramStatusBadgeComponent,
  ],
  templateUrl: "./moderation-list.component.html",
  styleUrl: "./moderation-list.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ModerationListComponent implements OnInit {
  private readonly moderationService = inject(ModerationService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly authService = inject(AuthService);

  readonly searchControl = new FormControl("", { nonNullable: true });
  readonly isLoading = signal(false);
  readonly response = signal<ModerationProgramPage | null>(null);
  readonly pendingCount = signal(0);
  readonly verificationPendingCount = signal(0);
  readonly revisionCount = signal<number | null>(null);
  readonly profile$ = this.authService.profile;

  readonly statusTabs: StatusTab[] = [
    { value: "all", label: "все" },
    { value: "attention", label: "требуют внимания" },
    { value: "pending_moderation", label: "на модерации" },
    { value: "rejected", label: "на доработке" },
    { value: "published", label: "опубликованы" },
    { value: "frozen", label: "заморожены" },
    { value: "archived", label: "архив" },
    { value: "draft", label: "черновики" },
    { value: "completed", label: "завершены" },
  ];

  activeStatus: ModerationProgramStatusFilter = "pending_moderation";
  ordering = "-submitted";
  page = 1;
  readonly pageSize = 10;

  ngOnInit(): void {
    this.loadPendingCount();
    this.loadVerificationPendingCount();

    this.searchControl.valueChanges
      .pipe(debounceTime(300), distinctUntilChanged(), takeUntilDestroyed(this.destroyRef))
      .subscribe(search => {
        this.updateQuery({ search: search || null, page: null });
      });

    this.route.queryParams.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(params => {
      this.activeStatus = this.normalizeStatus(params["status"]);
      this.ordering = params["ordering"] || this.defaultOrdering(this.activeStatus);
      this.page = Number(params["page"] || 1);

      const search = params["search"] || "";
      if (this.searchControl.value !== search) {
        this.searchControl.setValue(search, { emitEvent: false });
      }

      this.loadPrograms();
    });
  }

  get programs(): ModerationProgramListItem[] {
    const programs = [...(this.response()?.results ?? [])];

    if (this.ordering === "urgent") {
      return programs.sort((left, right) => this.urgencyValue(left) - this.urgencyValue(right));
    }

    return programs;
  }

  get totalCount(): number {
    return this.response()?.count ?? 0;
  }

  get hasNextPage(): boolean {
    return Boolean(this.response()?.next);
  }

  get hasPreviousPage(): boolean {
    return Boolean(this.response()?.previous);
  }

  setStatus(status: ModerationProgramStatusFilter): void {
    this.updateQuery({
      status,
      ordering: this.defaultOrdering(status),
      page: null,
    });
  }

  setOrdering(ordering: string): void {
    this.updateQuery({ ordering, page: null });
  }

  setMobileFilter(filter: MobileFilter): void {
    const queryByFilter: Record<MobileFilter, Record<string, string | null>> = {
      new: {
        status: "pending_moderation",
        ordering: "-submitted",
        page: null,
      },
      urgent: {
        status: "pending_moderation",
        ordering: "urgent",
        page: null,
      },
      all: {
        status: "pending_moderation",
        ordering: "submitted",
        page: null,
      },
    };

    this.updateQuery(queryByFilter[filter]);
  }

  isMobileFilterActive(filter: MobileFilter): boolean {
    if (filter === "urgent") {
      return this.ordering === "urgent";
    }

    if (filter === "new") {
      return this.activeStatus === "pending_moderation" && this.ordering === "-submitted";
    }

    return this.activeStatus === "pending_moderation" && this.ordering === "submitted";
  }

  goToPage(page: number): void {
    this.updateQuery({ page: page <= 1 ? null : String(page) });
  }

  primaryOrganizer(program: ModerationProgramListItem): ModerationPerson | null {
    return program.organizers?.[0] ?? program.managers?.[0] ?? null;
  }

  accessTypeLabel(program: ModerationProgramListItem): string {
    const accessType = program.accessType ?? (program.isPrivate ? "closed" : "open");
    return accessType === "closed" ? "Закрытый" : "Открытый";
  }

  registrationTypeLabel(program: ModerationProgramListItem): string {
    const registrationType =
      program.registrationType ?? (program.registrationLink ? "external" : "internal");
    return registrationType === "external" ? "Внешняя ссылка" : "Встроенная форма";
  }

  submittedLabel(program: ModerationProgramListItem): string {
    const rawDate = program.submittedAt || program.decisionAt || program.datetimeUpdated;
    return rawDate ? new Date(rawDate).toLocaleString("ru-RU") : "нет данных";
  }

  primaryOrganizerLabel(program: ModerationProgramListItem): string {
    const organizer = this.primaryOrganizer(program);
    return organizer?.fullName || organizer?.email || "Организатор не указан";
  }

  companyLabel(program: ModerationProgramListItem): string {
    return program.company?.name || "Компания не указана";
  }

  readinessLabel(program: ModerationProgramListItem): string {
    return (program.readinessPercentage ?? 0) >= 100 ? "Готов к проверке" : "Проверить готовность";
  }

  mobileBadgeLabel(program: ModerationProgramListItem): string {
    if (this.isOverdue(program)) {
      return "Срочно";
    }

    if (program.submittedAt) {
      const days = Math.floor((Date.now() - new Date(program.submittedAt).getTime()) / 86_400_000);
      if (days >= 3) {
        return `${days} дня на проверке`;
      }
    }

    return "Новая";
  }

  companyVerificationLabel(program: ModerationProgramListItem): string {
    return program.isCompanyVerified ? "верифицирована" : "не верифицирована";
  }

  deadlineLabel(program: ModerationProgramListItem): string {
    if (!program.moderationDeadlineAt) {
      return "нет данных";
    }

    const deadline = new Date(program.moderationDeadlineAt).getTime();
    const diffMs = deadline - Date.now();
    const absMs = Math.abs(diffMs);
    const days = Math.floor(absMs / 86_400_000);
    const hours = Math.max(1, Math.ceil((absMs % 86_400_000) / 3_600_000));

    if (diffMs >= 0) {
      return days > 0 ? `осталось ${days} д.` : `осталось ${hours} ч.`;
    }

    return days > 0 ? `просрочено на ${days} д.` : `просрочено на ${hours} ч.`;
  }

  isOverdue(program: ModerationProgramListItem): boolean {
    return Boolean(program.moderationOverdueSeconds && program.moderationOverdueSeconds > 0);
  }

  emptyTitle(): string {
    const titles: Record<ModerationProgramStatusFilter, string> = {
      all: "Чемпионатов нет",
      attention: "Нет чемпионатов, требующих внимания",
      pending_moderation: "Нет чемпионатов на модерации",
      rejected: "Нет чемпионатов на доработке",
      published: "Нет опубликованных чемпионатов",
      frozen: "Нет замороженных чемпионатов",
      archived: "Нет архивных чемпионатов",
      draft: "Нет черновиков",
      completed: "Нет завершенных чемпионатов",
    };
    return titles[this.activeStatus] ?? "Чемпионатов нет";
  }

  emptyText(): string {
    if (this.activeStatus === "pending_moderation") {
      return "Когда организаторы отправят чемпионаты на проверку, они появятся здесь.";
    }

    return "Попробуйте изменить поиск или вкладку статуса.";
  }

  asProgramStatus(status: ModerationProgramStatus): ProgramStatus {
    return status as ProgramStatus;
  }

  private loadPrograms(): void {
    this.isLoading.set(true);
    this.moderationService
      .getPrograms({
        status: this.activeStatus,
        search: this.searchControl.value,
        ordering: this.ordering === "urgent" ? "-submitted" : this.ordering,
        page: this.page,
        pageSize: this.pageSize,
      })
      .pipe(
        finalize(() => this.isLoading.set(false)),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe({
        next: response => {
          this.response.set(response);
          if (this.activeStatus === "pending_moderation") {
            this.pendingCount.set(response.count);
          }

          if (this.activeStatus === "rejected") {
            this.revisionCount.set(response.count);
          }
        },
        error: () => this.response.set({ count: 0, next: "", previous: "", results: [] }),
      });
  }

  private loadPendingCount(): void {
    this.moderationService
      .getPrograms({ status: "pending_moderation", page: 1, pageSize: 1 })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: response => this.pendingCount.set(response.count),
        error: () => this.pendingCount.set(0),
      });
  }

  private loadVerificationPendingCount(): void {
    this.moderationService
      .getVerificationRequests({ status: "pending", page: 1, pageSize: 1 })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: response => this.verificationPendingCount.set(response.count),
        error: () => this.verificationPendingCount.set(0),
      });
  }

  private defaultOrdering(status: ModerationProgramStatusFilter): string {
    return status === "published" ? "-decision" : "-submitted";
  }

  private normalizeStatus(value: string | undefined): ModerationProgramStatusFilter {
    const knownStatuses = new Set<ModerationProgramStatusFilter>(
      this.statusTabs.map(tab => tab.value)
    );
    return value && knownStatuses.has(value as ModerationProgramStatusFilter)
      ? (value as ModerationProgramStatusFilter)
      : "pending_moderation";
  }

  private urgencyValue(program: ModerationProgramListItem): number {
    if (!program.moderationDeadlineAt) {
      return Number.MAX_SAFE_INTEGER;
    }

    return new Date(program.moderationDeadlineAt).getTime();
  }

  private updateQuery(queryParams: Record<string, string | null>): void {
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams,
      queryParamsHandling: "merge",
    });
  }
}
