/** @format */

import { CommonModule } from "@angular/common";
import { HttpErrorResponse, HttpParams } from "@angular/common/http";
import { Component, OnDestroy, OnInit, inject } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { ActivatedRoute, Router, RouterModule } from "@angular/router";
import { finalize, Subscription } from "rxjs";
import { ProjectRatingService } from "@office/program/services/project-rating.service";
import {
  ExpertEvaluationCounters,
  ExpertEvaluationParticipant,
  ExpertEvaluationProgram,
  ExpertEvaluationStatus,
  ExpertProjectSubmission,
} from "@office/program/models/project-evaluation.model";
import { pluralizeRu } from "@utils/helpers/russian-plural";

type ExpertEvaluationListFilter = "all" | "not_started" | "draft" | "submitted";

@Component({
  selector: "app-expert-evaluation-list",
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: "./expert-evaluation-list.component.html",
  styleUrl: "./expert-evaluation-list.component.scss",
})
export class ExpertEvaluationListComponent implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly projectRatingService = inject(ProjectRatingService);
  private readonly subscriptions = new Subscription();

  readonly filters: { key: ExpertEvaluationListFilter; label: string }[] = [
    { key: "all", label: "Все" },
    { key: "not_started", label: "Не оценены" },
    { key: "draft", label: "Черновики" },
    { key: "submitted", label: "Оценены" },
  ];

  program: ExpertEvaluationProgram | null = null;
  counters: ExpertEvaluationCounters = { assigned: 0, evaluated: 0, remaining: 0 };
  submissions: ExpertProjectSubmission[] = [];
  activeFilter: ExpertEvaluationListFilter = "not_started";
  searchValue = "";
  loading = false;
  forbidden = false;
  errorMessage = "";

  private searchDebounceId: number | undefined;

  ngOnInit(): void {
    this.activeFilter =
      (this.route.snapshot.queryParamMap.get("status") as ExpertEvaluationListFilter | null) ??
      "not_started";
    this.searchValue = this.route.snapshot.queryParamMap.get("search") ?? "";
    this.loadSubmissions();
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();

    if (this.searchDebounceId !== undefined) {
      window.clearTimeout(this.searchDebounceId);
    }
  }

  setFilter(filter: ExpertEvaluationListFilter): void {
    if (this.activeFilter === filter) {
      return;
    }

    this.activeFilter = filter;
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { status: filter === "all" ? null : filter },
      queryParamsHandling: "merge",
    });
    this.loadSubmissions();
  }

  onSearchChange(value: string): void {
    this.searchValue = value;

    if (this.searchDebounceId !== undefined) {
      window.clearTimeout(this.searchDebounceId);
    }

    this.searchDebounceId = window.setTimeout(() => {
      void this.router.navigate([], {
        relativeTo: this.route,
        queryParams: { search: this.searchValue.trim() || null },
        queryParamsHandling: "merge",
      });
      this.loadSubmissions();
    }, 300);
  }

  openSubmission(submission: ExpertProjectSubmission): void {
    void this.router.navigate([submission.id], { relativeTo: this.route });
  }

  statusLabel(status: ExpertEvaluationStatus): string {
    switch (status) {
      case "draft":
        return "Черновик";
      case "submitted":
        return "Оценено";
      case "not_started":
        return "Не оценено";
      default:
        return "Не оценено";
    }
  }

  actionLabel(submission: ExpertProjectSubmission): string {
    switch (submission.evaluationStatus) {
      case "draft":
        return "Продолжить";
      case "submitted":
        return "Посмотреть";
      case "not_started":
        return "Оценить";
      default:
        return "Оценить";
    }
  }

  statusClass(submission: ExpertProjectSubmission): string {
    return `expert-list__status expert-list__status--${submission.evaluationStatus}`;
  }

  participantNames(submission: ExpertProjectSubmission): string {
    return submission.participants.map(participant => participant.fullName).join(", ");
  }

  participantsCountLabel(count: number): string {
    return `${count} ${pluralizeRu(count, ["участник", "участника", "участников"])}`;
  }

  participantInitials(participant: ExpertEvaluationParticipant): string {
    const first = participant.firstName?.trim().charAt(0) ?? "";
    const last = participant.lastName?.trim().charAt(0) ?? "";
    const initials = `${first}${last}`.trim();

    return initials || participant.fullName.trim().charAt(0) || "?";
  }

  trackBySubmission(_: number, submission: ExpertProjectSubmission): number {
    return submission.id;
  }

  private loadSubmissions(): void {
    const programId = this.programId;

    if (!programId) {
      this.errorMessage = "Не удалось определить чемпионат для оценки.";
      return;
    }

    this.loading = true;
    this.forbidden = false;
    this.errorMessage = "";

    const request$ = this.projectRatingService
      .getSubmissions(programId, this.buildParams())
      .pipe(finalize(() => (this.loading = false)))
      .subscribe({
        next: response => {
          this.program = response.program;
          this.counters = response.counters;
          this.submissions = response.results;
        },
        error: error => this.handleError(error),
      });

    this.subscriptions.add(request$);
  }

  private buildParams(): HttpParams {
    let params = new HttpParams().set("limit", "100");

    if (this.activeFilter !== "all") {
      params = params.set("status", this.activeFilter);
    }

    const search = this.searchValue.trim();

    if (search) {
      params = params.set("search", search);
    }

    return params;
  }

  private handleError(error: unknown): void {
    if (error instanceof HttpErrorResponse && error.status === 403) {
      this.forbidden = true;
      return;
    }

    this.errorMessage =
      error instanceof HttpErrorResponse && typeof error.error?.detail === "string"
        ? error.error.detail
        : "Не удалось загрузить проекты для оценки.";
  }

  private get programId(): number {
    const routeProgramId = this.route.parent?.snapshot.params["programId"];

    return Number(routeProgramId);
  }
}
