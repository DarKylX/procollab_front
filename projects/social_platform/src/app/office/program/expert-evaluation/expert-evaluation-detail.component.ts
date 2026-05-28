/** @format */

import { CommonModule } from "@angular/common";
import { HttpErrorResponse } from "@angular/common/http";
import { Component, OnDestroy, OnInit, inject } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { ActivatedRoute, Router, RouterModule } from "@angular/router";
import { finalize, Subscription } from "rxjs";
import {
  ExpertEvaluationCriterion,
  ExpertEvaluationPayload,
  ExpertEvaluationParticipant,
  ExpertEvaluationValue,
  ExpertProjectMaterial,
  ExpertProjectSubmissionDetail,
} from "@office/program/models/project-evaluation.model";
import { ProjectRatingService } from "@office/program/services/project-rating.service";
import { SnackbarService } from "@ui/services/snackbar.service";
import { pluralizeRu } from "@utils/helpers/russian-plural";

@Component({
  selector: "app-expert-evaluation-detail",
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: "./expert-evaluation-detail.component.html",
  styleUrl: "./expert-evaluation-detail.component.scss",
})
export class ExpertEvaluationDetailComponent implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly projectRatingService = inject(ProjectRatingService);
  private readonly snackbarService = inject(SnackbarService);
  private readonly subscriptions = new Subscription();

  submission: ExpertProjectSubmissionDetail | null = null;
  scoreValues: Record<number, ExpertEvaluationValue | undefined> = {};
  validationErrors: Record<number, string> = {};
  comment = "";
  backendTotalScore: string | number | null = null;
  loading = false;
  saving = false;
  submitting = false;
  forbidden = false;
  notFound = false;
  errorMessage = "";
  formError = "";

  ngOnInit(): void {
    this.loadSubmission();
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  get isReadonly(): boolean {
    return this.submission?.evaluationStatus === "submitted";
  }

  get formStatusText(): string {
    if (this.isReadonly) {
      return "Оценка отправлена";
    }

    return this.submission?.evaluationStatus === "draft"
      ? "Черновик оценки"
      : "Оценка не отправлена";
  }

  get formStatusHint(): string {
    return this.isReadonly
      ? "Изменить ее можно только через администратора платформы."
      : "Вы можете сохранить черновик оценки и вернуться к ней позже.";
  }

  get displayTotalScore(): string {
    if (this.backendTotalScore !== null && this.backendTotalScore !== undefined) {
      return this.formatTotal(this.backendTotalScore);
    }

    return this.previewTotalScore() ?? "—";
  }

  get isPreviewTotal(): boolean {
    return !this.isReadonly && this.backendTotalScore === null && this.previewTotalScore() !== null;
  }

  loadSubmission(): void {
    const programId = this.programId;
    const programProjectId = this.programProjectId;

    if (!programId || !programProjectId) {
      this.errorMessage = "Не удалось определить проект для оценки.";
      return;
    }

    this.loading = true;
    this.forbidden = false;
    this.notFound = false;
    this.errorMessage = "";

    const request$ = this.projectRatingService
      .getSubmission(programId, programProjectId)
      .pipe(finalize(() => (this.loading = false)))
      .subscribe({
        next: submission => this.applySubmission(submission),
        error: error => this.handleLoadError(error),
      });

    this.subscriptions.add(request$);
  }

  saveDraft(): void {
    if (this.isReadonly || !this.validateScores(false)) {
      return;
    }

    this.saving = true;

    const request$ = this.projectRatingService
      .saveDraft(this.programId, this.programProjectId, this.collectPayload())
      .pipe(finalize(() => (this.saving = false)))
      .subscribe({
        next: submission => {
          this.applySubmission(submission);
          this.snackbarService.success("Черновик оценки сохранен.");
        },
        error: error => this.handleSaveError(error),
      });

    this.subscriptions.add(request$);
  }

  submitEvaluation(): void {
    if (this.isReadonly || !this.validateScores(true)) {
      return;
    }

    const confirmed = window.confirm(
      "После отправки оценку нельзя будет изменить без администратора."
    );

    if (!confirmed) {
      return;
    }

    this.submitting = true;

    const request$ = this.projectRatingService
      .submitEvaluation(this.programId, this.programProjectId, this.collectPayload())
      .pipe(finalize(() => (this.submitting = false)))
      .subscribe({
        next: submission => {
          this.applySubmission(submission);
          this.snackbarService.success("Оценка отправлена.");
        },
        error: error => this.handleSaveError(error),
      });

    this.subscriptions.add(request$);
  }

  backToList(): void {
    this.router.navigate(["../"], { relativeTo: this.route });
  }

  scoreValue(criterionId: number): ExpertEvaluationValue | undefined {
    return this.scoreValues[criterionId] ?? null;
  }

  setScoreValue(criterionId: number, value: ExpertEvaluationValue): void {
    this.scoreValues[criterionId] = value;
    this.backendTotalScore = null;
    this.validationErrors[criterionId] = "";
    this.formError = "";
  }

  isNumericCriterion(criterion: ExpertEvaluationCriterion): boolean {
    return criterion.type === "int" || criterion.type === "float";
  }

  criterionScale(criterion: ExpertEvaluationCriterion): string {
    if (this.isNumericCriterion(criterion)) {
      const min = criterion.minValue ?? 0;
      const max = criterion.maxValue ?? "∞";

      return `${min} - ${max}`;
    }

    return criterion.type === "bool" ? "Да / Нет" : "Текст";
  }

  criterionWeight(criterion: ExpertEvaluationCriterion): string {
    return `${Number(criterion.weight).toLocaleString("ru-RU")}%`;
  }

  criterionError(criterion: ExpertEvaluationCriterion): string {
    return this.validationErrors[criterion.id] ?? "";
  }

  readonlyValue(criterion: ExpertEvaluationCriterion): string {
    const value = this.scoreValue(criterion.id);

    if (this.isBlank(value)) {
      return "—";
    }

    if (criterion.type === "bool") {
      return value === true || value === "True" || value === "true" ? "Да" : "Нет";
    }

    return String(value);
  }

  participantInitials(participant: ExpertEvaluationParticipant): string {
    const first = participant.firstName?.trim().charAt(0) ?? "";
    const last = participant.lastName?.trim().charAt(0) ?? "";
    const initials = `${first}${last}`.trim();

    return initials || participant.fullName.trim().charAt(0) || "?";
  }

  participantsCountLabel(count: number): string {
    return `${count} ${pluralizeRu(count, ["участник", "участника", "участников"])}`;
  }

  materialKindLabel(material: ExpertProjectMaterial): string {
    return material.kind === "presentation" ? "Презентация" : "Ссылка";
  }

  private applySubmission(submission: ExpertProjectSubmissionDetail): void {
    this.submission = submission;
    this.comment = submission.evaluation?.comment ?? "";
    this.backendTotalScore = submission.evaluation?.totalScore ?? null;
    this.validationErrors = {};
    this.formError = "";

    const nextScores: Record<number, ExpertEvaluationValue | undefined> = {};

    submission.criteria.forEach(criterion => {
      nextScores[criterion.id] = this.normalizeIncomingValue(criterion);
    });

    this.scoreValues = nextScores;
  }

  private normalizeIncomingValue(criterion: ExpertEvaluationCriterion): ExpertEvaluationValue {
    const value = criterion.value;

    if (criterion.type === "bool") {
      if (value === true || value === "True" || value === "true") {
        return true;
      }

      if (value === false || value === "False" || value === "false") {
        return false;
      }

      return null;
    }

    return value ?? "";
  }

  private validateScores(requireComplete: boolean): boolean {
    this.validationErrors = {};
    this.formError = "";

    if (!this.submission) {
      return false;
    }

    let valid = true;
    let hasNumericCriteria = false;
    let numericWeightSum = 0;

    this.submission.criteria.forEach(criterion => {
      if (!this.isNumericCriterion(criterion)) {
        return;
      }

      hasNumericCriteria = true;

      const weight = Number(criterion.weight);

      if (Number.isFinite(weight) && weight > 0) {
        numericWeightSum += weight;
      }

      const rawValue = this.scoreValue(criterion.id);

      if (this.isBlank(rawValue)) {
        if (requireComplete) {
          this.validationErrors[criterion.id] = "Укажите балл по критерию.";
          valid = false;
        }

        return;
      }

      const numericValue = Number(rawValue);

      if (!Number.isFinite(numericValue)) {
        this.validationErrors[criterion.id] = "Введите числовой балл.";
        valid = false;
        return;
      }

      if (criterion.type === "int" && !Number.isInteger(numericValue)) {
        this.validationErrors[criterion.id] = "Введите целое число.";
        valid = false;
        return;
      }

      if (criterion.minValue !== null && numericValue < criterion.minValue) {
        this.validationErrors[criterion.id] = `Минимальный балл: ${criterion.minValue}.`;
        valid = false;
        return;
      }

      if (criterion.maxValue !== null && numericValue > criterion.maxValue) {
        this.validationErrors[criterion.id] = `Максимальный балл: ${criterion.maxValue}.`;
        valid = false;
        return;
      }

      if (
        requireComplete &&
        (criterion.maxValue === null ||
          !Number.isFinite(Number(criterion.maxValue)) ||
          criterion.maxValue <= 0)
      ) {
        this.formError = "В критериях задана некорректная числовая шкала.";
        valid = false;
      }
    });

    if (requireComplete && !hasNumericCriteria) {
      this.formError = "Для отправки оценки нужны корректные числовые критерии.";
      valid = false;
    } else if (requireComplete && numericWeightSum <= 0) {
      this.formError = "Сумма весов числовых критериев должна быть больше нуля.";
      valid = false;
    }

    return valid && !this.formError;
  }

  private collectPayload(): ExpertEvaluationPayload {
    const scores =
      this.submission?.criteria.map(criterion => ({
        criterionId: criterion.id,
        value: this.payloadValue(criterion),
      })) ?? [];

    return {
      comment: this.comment,
      scores,
    };
  }

  private payloadValue(criterion: ExpertEvaluationCriterion): ExpertEvaluationValue {
    const rawValue = this.scoreValue(criterion.id);

    if (this.isBlank(rawValue)) {
      return null;
    }

    if (criterion.type === "bool") {
      return rawValue === true || rawValue === "true" || rawValue === "True";
    }

    if (this.isNumericCriterion(criterion)) {
      return Number(rawValue);
    }

    return String(rawValue);
  }

  private previewTotalScore(): string | null {
    if (!this.submission) {
      return null;
    }

    let weightSum = 0;
    let weightedTotal = 0;

    for (const criterion of this.submission.criteria) {
      if (!this.isNumericCriterion(criterion)) {
        continue;
      }

      const rawValue = this.scoreValue(criterion.id);
      const value = Number(rawValue);
      const maxValue = Number(criterion.maxValue);
      const weight = Number(criterion.weight);

      if (
        this.isBlank(rawValue) ||
        !Number.isFinite(value) ||
        !Number.isFinite(maxValue) ||
        maxValue <= 0 ||
        !Number.isFinite(weight) ||
        weight <= 0
      ) {
        return null;
      }

      weightedTotal += (value / maxValue) * 10 * weight;
      weightSum += weight;
    }

    if (weightSum <= 0) {
      return null;
    }

    return this.formatTotal(weightedTotal / weightSum);
  }

  private formatTotal(value: string | number): string {
    const numericValue = Number(value);

    if (!Number.isFinite(numericValue)) {
      return String(value);
    }

    const fixed = numericValue.toFixed(1);

    return fixed.endsWith(".0") ? fixed.slice(0, -2) : fixed;
  }

  private handleLoadError(error: unknown): void {
    if (error instanceof HttpErrorResponse && error.status === 403) {
      this.forbidden = true;
      return;
    }

    if (error instanceof HttpErrorResponse && error.status === 404) {
      this.notFound = true;
      return;
    }

    this.errorMessage = this.extractBackendError(error, "Не удалось загрузить проект для оценки.");
  }

  private handleSaveError(error: unknown): void {
    const message = this.extractBackendError(error, "Не удалось сохранить оценку.");
    this.formError = message;
    this.snackbarService.error(message);
  }

  private extractBackendError(error: unknown, fallback: string): string {
    if (!(error instanceof HttpErrorResponse)) {
      return fallback;
    }

    const messages = this.flattenError(error.error);

    return messages[0] ?? fallback;
  }

  private flattenError(value: unknown): string[] {
    if (typeof value === "string") {
      return [value];
    }

    if (Array.isArray(value)) {
      return value.flatMap(item => this.flattenError(item));
    }

    if (value && typeof value === "object") {
      return Object.values(value as Record<string, unknown>).flatMap(item =>
        this.flattenError(item)
      );
    }

    return [];
  }

  private isBlank(value: ExpertEvaluationValue | undefined): boolean {
    return value === null || value === undefined || value === "";
  }

  private get programId(): number {
    return Number(this.route.parent?.snapshot.params["programId"]);
  }

  private get programProjectId(): number {
    return Number(this.route.snapshot.params["programProjectId"]);
  }
}
