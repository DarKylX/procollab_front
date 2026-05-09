/** @format */

import { CommonModule } from "@angular/common";
import { HttpErrorResponse } from "@angular/common/http";
import { Component, OnDestroy, OnInit, inject } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { ActivatedRoute, Router, RouterModule } from "@angular/router";
import { Subscription, finalize } from "rxjs";
import {
  ProgramAnalytics,
  ProgramAnalyticsEvaluationStatus,
  ProgramAnalyticsSubmission,
  ProgramAnalyticsSubmissionStatus,
} from "@office/program/models/program-analytics.model";
import { ProgramService } from "@office/program/services/program.service";
import { saveFile } from "@utils/helpers/export-file";

type ProjectStatusFilter = "all" | ProgramAnalyticsSubmissionStatus;
type EvaluationStatusFilter = "all" | ProgramAnalyticsEvaluationStatus;
type SortKey = "averageScore" | "submittedAt" | "projectTitle";

interface AnalyticsEmptyState {
  title: string;
  text: string;
}

@Component({
  selector: "app-program-analytics",
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: "./program-analytics.component.html",
  styleUrl: "./program-analytics.component.scss",
})
export class ProgramAnalyticsComponent implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly programService = inject(ProgramService);
  private readonly subscriptions = new Subscription();

  analytics: ProgramAnalytics | null = null;
  loading = false;
  downloading = false;
  downloadingContacts = false;
  forbidden = false;
  errorMessage = "";
  searchValue = "";
  projectStatusFilter: ProjectStatusFilter = "all";
  evaluationStatusFilter: EvaluationStatusFilter = "all";
  sortKey: SortKey = "averageScore";

  ngOnInit(): void {
    this.loadAnalytics();
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  get programId(): number {
    return Number(
      this.route.snapshot.params["programId"] ?? this.route.parent?.snapshot.params["programId"]
    );
  }

  get displayedSubmissions(): ProgramAnalyticsSubmission[] {
    const submissions = [...(this.analytics?.submissions ?? [])];
    const search = this.searchValue.trim().toLowerCase();

    return submissions
      .filter(submission => {
        if (!search) {
          return true;
        }

        return [
          submission.projectTitle,
          submission.authorName,
          submission.participantLabel,
          submission.participantsPreview,
        ]
          .filter(Boolean)
          .some(value => value.toLowerCase().includes(search));
      })
      .filter(submission =>
        this.projectStatusFilter === "all"
          ? true
          : submission.submissionStatus === this.projectStatusFilter
      )
      .filter(submission =>
        this.evaluationStatusFilter === "all"
          ? true
          : submission.evaluationStatus === this.evaluationStatusFilter
      )
      .sort((first, second) => this.compareSubmissions(first, second));
  }

  get emptyState(): AnalyticsEmptyState | null {
    if (!this.analytics) {
      return null;
    }

    if (!this.analytics.submissions.length) {
      return {
        title: "Проекты еще не привязаны",
        text: "Когда участники привяжут проекты к чемпионату, они появятся в этом разделе.",
      };
    }

    if (this.analytics.submittedProjectsCount === 0) {
      return {
        title: "Проекты еще не сданы",
        text: "Когда участники отправят проекты на проверку, они появятся в этом разделе.",
      };
    }

    if (!this.analytics.submissions.some(submission => submission.evaluationsReceived > 0)) {
      return {
        title: "Оценки еще не выставлены",
        text: "Эксперты еще не отправили оценки. Следите за прогрессом в таблице.",
      };
    }

    if (!this.displayedSubmissions.length) {
      return {
        title: "Ничего не найдено",
        text: "Попробуйте изменить поиск или фильтры.",
      };
    }

    return null;
  }

  get shouldShowTable(): boolean {
    return Boolean(this.analytics && !this.emptyState);
  }

  loadAnalytics(): void {
    if (!this.programId) {
      this.errorMessage = "Не удалось определить чемпионат.";
      return;
    }

    this.loading = true;
    this.forbidden = false;
    this.errorMessage = "";

    const analyticsSub = this.programService
      .getAnalytics(this.programId)
      .pipe(finalize(() => (this.loading = false)))
      .subscribe({
        next: analytics => {
          this.analytics = analytics;
        },
        error: error => this.handleError(error),
      });

    this.subscriptions.add(analyticsSub);
  }

  downloadXlsx(): void {
    if (!this.programId || this.downloading) {
      return;
    }

    this.downloading = true;
    const exportSub = this.programService
      .exportAnalytics(this.programId)
      .pipe(finalize(() => (this.downloading = false)))
      .subscribe({
        next: blob => saveFile(blob, "analytics", this.analytics?.title ?? `${this.programId}`),
        error: () => {
          this.errorMessage = "Не удалось скачать XLSX-отчет.";
        },
      });

    this.subscriptions.add(exportSub);
  }

  downloadContactXlsx(): void {
    if (!this.programId || this.downloadingContacts || !this.analytics?.canExportContacts) {
      return;
    }

    this.downloadingContacts = true;
    const exportSub = this.programService
      .exportAnalyticsContacts(this.programId)
      .pipe(finalize(() => (this.downloadingContacts = false)))
      .subscribe({
        next: blob => saveFile(blob, "analytics", this.analytics?.title ?? `${this.programId}`),
        error: error => {
          this.errorMessage =
            error instanceof HttpErrorResponse && typeof error.error?.detail === "string"
              ? error.error.detail
              : "Контактная выгрузка доступна только после подтверждения компании.";
        },
      });

    this.subscriptions.add(exportSub);
  }

  openProject(submission: ProgramAnalyticsSubmission): void {
    void this.router.navigate(["/office/projects", submission.projectId]);
  }

  formatScore(score: number | null): string {
    return score === null || score === undefined ? "—" : score.toFixed(1);
  }

  statusLabel(status: string): string {
    const labels: Record<string, string> = {
      draft: "Черновик",
      pending_moderation: "На модерации",
      published: "Опубликован",
      rejected: "Отклонен",
      completed: "Завершен",
      frozen: "Заморожен",
      archived: "Архив",
    };
    return labels[status] ?? status;
  }

  submissionStatusLabel(status: ProgramAnalyticsSubmissionStatus): string {
    return status === "submitted" ? "Сдан" : "Не сдан";
  }

  evaluationStatusLabel(status: ProgramAnalyticsEvaluationStatus): string {
    const labels: Record<ProgramAnalyticsEvaluationStatus, string> = {
      not_evaluated: "Не оценено",
      partially_evaluated: "Частично",
      evaluated: "Оценено",
    };
    return labels[status];
  }

  evaluationStatusClass(status: ProgramAnalyticsEvaluationStatus): string {
    return `analytics__status analytics__status--${status}`;
  }

  trackBySubmission(_: number, submission: ProgramAnalyticsSubmission): number {
    return submission.programProjectId;
  }

  private compareSubmissions(
    first: ProgramAnalyticsSubmission,
    second: ProgramAnalyticsSubmission
  ): number {
    if (this.sortKey === "projectTitle") {
      return first.projectTitle.localeCompare(second.projectTitle, "ru");
    }

    if (this.sortKey === "submittedAt") {
      return this.dateValue(second.submittedAt) - this.dateValue(first.submittedAt);
    }

    const firstScore = first.averageScore ?? Number.NEGATIVE_INFINITY;
    const secondScore = second.averageScore ?? Number.NEGATIVE_INFINITY;
    return secondScore - firstScore;
  }

  private dateValue(value: string | null): number {
    if (!value) {
      return 0;
    }

    const time = Date.parse(value);
    return Number.isFinite(time) ? time : 0;
  }

  private handleError(error: unknown): void {
    if (error instanceof HttpErrorResponse && error.status === 403) {
      this.forbidden = true;
      return;
    }

    this.errorMessage =
      error instanceof HttpErrorResponse && typeof error.error?.detail === "string"
        ? error.error.detail
        : "Не удалось загрузить аналитику чемпионата.";
  }
}
