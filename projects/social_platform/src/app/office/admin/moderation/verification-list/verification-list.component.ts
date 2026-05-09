/** @format */

import { AsyncPipe, CommonModule } from "@angular/common";
import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, inject, signal } from "@angular/core";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { FormControl, ReactiveFormsModule } from "@angular/forms";
import { ActivatedRoute, Router, RouterLink } from "@angular/router";
import { debounceTime, distinctUntilChanged, finalize } from "rxjs";
import { AuthService } from "@auth/services";
import {
  ModerationVerificationPage,
  ModerationVerificationRequestStatus,
  ProgramVerificationRequest,
} from "../moderation.models";
import { ModerationService } from "../moderation.service";
import { LoaderComponent } from "@ui/components/loader/loader.component";

interface StatusTab {
  value: ModerationVerificationRequestStatus;
  label: string;
}

type MobileFilter = "new" | "urgent" | "all";

@Component({
  selector: "app-verification-list",
  standalone: true,
  imports: [CommonModule, AsyncPipe, ReactiveFormsModule, RouterLink, LoaderComponent],
  templateUrl: "./verification-list.component.html",
  styleUrl: "./verification-list.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VerificationListComponent implements OnInit {
  private readonly moderationService = inject(ModerationService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly authService = inject(AuthService);

  readonly searchControl = new FormControl("", { nonNullable: true });
  readonly isLoading = signal(false);
  readonly response = signal<ModerationVerificationPage | null>(null);
  readonly pendingCount = signal(0);
  readonly revisionCount = signal<number | null>(null);
  readonly activeMobileFilter = signal<MobileFilter>("new");
  readonly profile$ = this.authService.profile;

  readonly statusTabs: StatusTab[] = [
    { value: "pending", label: "на рассмотрении" },
    { value: "approved", label: "одобрены" },
    { value: "rejected", label: "отклонены" },
  ];

  activeStatus: ModerationVerificationRequestStatus = "pending";
  ordering = "-submitted";
  page = 1;
  readonly pageSize = 10;

  ngOnInit(): void {
    this.loadPendingCount();

    this.searchControl.valueChanges
      .pipe(debounceTime(300), distinctUntilChanged(), takeUntilDestroyed(this.destroyRef))
      .subscribe(search => this.updateQuery({ search: search || null, page: null }));

    this.route.queryParams.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(params => {
      this.activeStatus = this.normalizeStatus(params["status"]);
      this.ordering = params["ordering"] || this.defaultOrdering(this.activeStatus);
      this.activeMobileFilter.set(this.normalizeMobileFilter(params["filter"]));
      this.page = Number(params["page"] || 1);

      const search = params["search"] || "";
      if (this.searchControl.value !== search) {
        this.searchControl.setValue(search, { emitEvent: false });
      }

      this.loadRequests();
    });
  }

  get requests(): ProgramVerificationRequest[] {
    return this.response()?.results ?? [];
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

  setStatus(status: ModerationVerificationRequestStatus): void {
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
        status: "pending",
        ordering: "-submitted",
        filter,
        page: null,
      },
      urgent: {
        status: "pending",
        ordering: "submitted",
        filter,
        page: null,
      },
      all: {
        status: "pending",
        ordering: "-submitted",
        filter,
        page: null,
      },
    };

    this.updateQuery(queryByFilter[filter]);
  }

  isMobileFilterActive(filter: MobileFilter): boolean {
    return this.activeMobileFilter() === filter;
  }

  goToPage(page: number): void {
    this.updateQuery({ page: page <= 1 ? null : String(page) });
  }

  statusLabel(status: string): string {
    const labels: Record<string, string> = {
      pending: "На рассмотрении",
      approved: "Одобрена",
      rejected: "Отклонена",
    };
    return labels[status] ?? status;
  }

  statusClass(status: string): string {
    return `verification-list__status--${status}`;
  }

  submittedAt(request: ProgramVerificationRequest): string {
    return request.submittedAt
      ? new Date(request.submittedAt).toLocaleString("ru-RU")
      : "Не указана";
  }

  requesterLabel(request: ProgramVerificationRequest): string {
    return (
      request.submittedBy?.fullName ||
      request.initiator?.fullName ||
      request.contactFullName ||
      "Заявитель не указан"
    );
  }

  documentCountLabel(request: ProgramVerificationRequest): string {
    const count = request.documents.length;
    return `${count} ${count === 1 ? "документ" : "документа"}`;
  }

  private loadRequests(): void {
    this.isLoading.set(true);
    this.moderationService
      .getVerificationRequests({
        status: this.activeStatus,
        search: this.searchControl.value,
        ordering: this.ordering,
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
          if (this.activeStatus === "pending") {
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
      .getVerificationRequests({ status: "pending", page: 1, pageSize: 1 })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: response => this.pendingCount.set(response.count),
        error: () => this.pendingCount.set(0),
      });
  }

  private normalizeStatus(value: string | undefined): ModerationVerificationRequestStatus {
    return value === "approved" || value === "rejected" ? value : "pending";
  }

  private normalizeMobileFilter(value: string | undefined): MobileFilter {
    return value === "urgent" || value === "all" ? value : "new";
  }

  private defaultOrdering(status: ModerationVerificationRequestStatus): string {
    return status === "pending" ? "-submitted" : "-decided";
  }

  private updateQuery(queryParams: Record<string, string | null>): void {
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams,
      queryParamsHandling: "merge",
    });
  }
}
