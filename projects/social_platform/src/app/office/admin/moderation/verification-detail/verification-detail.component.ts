/** @format */

import { CommonModule } from "@angular/common";
import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, inject, signal } from "@angular/core";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { FormControl, FormGroup, ReactiveFormsModule } from "@angular/forms";
import { ActivatedRoute, Router, RouterLink } from "@angular/router";
import { catchError, finalize, forkJoin, of } from "rxjs";
import { VerificationDocument } from "@office/program/models/program-verification.model";
import {
  ProgramVerificationRequest,
  RejectionReason,
} from "../moderation.models";
import { ModerationService } from "../moderation.service";
import { LoaderComponent } from "@ui/components/loader/loader.component";
import { ModalComponent } from "@ui/components/modal/modal.component";
import { SnackbarService } from "@ui/services/snackbar.service";

const DEFAULT_VERIFICATION_REJECTION_REASONS: RejectionReason[] = [
  { code: "company_not_confirmed", label: "Данные компании не подтверждены" },
  { code: "insufficient_documents", label: "Недостаточно документов" },
  { code: "invalid_documents", label: "Некорректные документы" },
  { code: "contact_not_verified", label: "Контактное лицо не подтверждено" },
  { code: "other", label: "Другая причина" },
];

@Component({
  selector: "app-verification-detail",
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink, LoaderComponent, ModalComponent],
  templateUrl: "./verification-detail.component.html",
  styleUrl: "./verification-detail.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VerificationDetailComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly moderationService = inject(ModerationService);
  private readonly snackbar = inject(SnackbarService);

  readonly request = signal<ProgramVerificationRequest | null>(null);
  readonly rejectionReasons = signal<RejectionReason[]>([]);
  readonly isLoading = signal(true);
  readonly isDeciding = signal(false);
  readonly decisionError = signal("");
  readonly decision = signal<"approve" | "reject">("approve");
  readonly approveConfirmOpen = signal(false);
  readonly rejectSheetOpen = signal(false);

  readonly decisionForm = new FormGroup({
    comment: new FormControl("", { nonNullable: true }),
    reasonCode: new FormControl("", { nonNullable: true }),
  });

  ngOnInit(): void {
    const requestId = Number(this.route.snapshot.paramMap.get("requestId"));
    if (!requestId) {
      this.router.navigate(["/office/admin/moderation/verification"]);
      return;
    }

    forkJoin({
      request: this.moderationService.getVerificationRequest(requestId),
      reasons: this.moderationService
        .getVerificationRejectionReasons()
        .pipe(catchError(() => of(DEFAULT_VERIFICATION_REJECTION_REASONS))),
    })
      .pipe(
        finalize(() => this.isLoading.set(false)),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe({
        next: ({ request, reasons }) => {
          this.request.set(request);
          this.rejectionReasons.set(this.normalizeRejectionReasons(reasons));
        },
        error: () => {
          this.snackbar.error("Не удалось загрузить заявку на верификацию");
          this.router.navigate(["/office/admin/moderation/verification"]);
        },
      });
  }

  get canDecide(): boolean {
    return this.request()?.status === "pending";
  }

  get isReject(): boolean {
    return this.decision() === "reject";
  }

  get reasonRequired(): boolean {
    return this.isReject && this.rejectionReasons().length > 0;
  }

  get canSaveDecision(): boolean {
    if (!this.canDecide || this.isDeciding()) {
      return false;
    }

    if (!this.isReject) {
      return true;
    }

    return Boolean(
      this.decisionForm.controls.comment.value.trim() &&
        (!this.reasonRequired || this.decisionForm.controls.reasonCode.value)
    );
  }

  setDecision(decision: "approve" | "reject"): void {
    this.decision.set(decision);
    this.decisionError.set("");
  }

  approve(): void {
    if (!this.canDecide || this.isDeciding()) {
      return;
    }

    this.setDecision("approve");
    this.approveConfirmOpen.set(true);
  }

  confirmApprove(): void {
    if (!this.canDecide || this.isDeciding()) {
      return;
    }

    this.setDecision("approve");
    this.approveConfirmOpen.set(false);
    this.submitDecision();
  }

  cancelApprove(): void {
    this.approveConfirmOpen.set(false);
  }

  openRejectSheet(): void {
    if (!this.canDecide || this.isDeciding()) {
      return;
    }

    this.setDecision("reject");
    this.rejectSheetOpen.set(true);
  }

  closeRejectSheet(): void {
    if (this.isDeciding()) {
      return;
    }

    this.rejectSheetOpen.set(false);
  }

  submitDecision(): void {
    const request = this.request();
    if (!request || !this.canSaveDecision) {
      this.showValidationError();
      return;
    }

    this.isDeciding.set(true);
    this.decisionError.set("");
    const decision = this.decision();
    this.moderationService
      .decideVerification(request.id, {
        decision,
        comment: this.decisionForm.controls.comment.value.trim(),
        reasonCode: this.decisionForm.controls.reasonCode.value || undefined,
      })
      .pipe(
        finalize(() => this.isDeciding.set(false)),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe({
        next: response => {
          this.request.set(response.request);
          this.snackbar.success(
            decision === "approve" ? "Компания подтверждена" : "Заявка отклонена"
          );
          this.router.navigate(["/office/admin/moderation/verification"]);
        },
        error: error => {
          const detail = error?.error?.detail || "Не удалось сохранить решение";
          this.decisionError.set(detail);
          this.snackbar.error(detail);
        },
      });
  }

  statusLabel(status: string): string {
    const labels: Record<string, string> = {
      pending: "На рассмотрении",
      approved: "Одобрена",
      verified: "Подтверждена",
      rejected: "Отклонена",
      draft: "Черновик",
      pending_moderation: "На модерации",
      published: "Опубликован",
      frozen: "Заморожен",
      archived: "Архив",
    };
    return labels[status] ?? status;
  }

  submittedAt(request: ProgramVerificationRequest): string {
    return request.submittedAt
      ? new Date(request.submittedAt).toLocaleString("ru-RU")
      : "Не указана";
  }

  decidedAt(request: ProgramVerificationRequest): string {
    const rawDate = request.reviewedAt ?? request.decidedAt;
    return rawDate ? new Date(rawDate).toLocaleString("ru-RU") : "Не указана";
  }

  documentUrl(document: VerificationDocument): string {
    return document.url || document.link || "";
  }

  documentName(document: VerificationDocument): string {
    return document.name || decodeURIComponent((document.link || document.url || "").split("/").pop() || "");
  }

  documentType(document: VerificationDocument): string {
    const extension = document.extension || this.documentName(document).split(".").pop() || "";
    return extension ? extension.toUpperCase() : "Файл";
  }

  documentSize(document: VerificationDocument): string {
    if (!document.size) {
      return "";
    }

    if (document.size < 1024 * 1024) {
      return `${Math.ceil(document.size / 1024)} КБ`;
    }

    return `${(document.size / (1024 * 1024)).toFixed(1)} МБ`;
  }

  private showValidationError(): void {
    if (!this.isReject) {
      return;
    }

    if (!this.decisionForm.controls.comment.value.trim()) {
      this.decisionError.set("Комментарий обязателен при отклонении.");
      return;
    }

    if (this.reasonRequired && !this.decisionForm.controls.reasonCode.value) {
      this.decisionError.set("Выберите причину отклонения.");
    }
  }

  private normalizeRejectionReasons(
    reasons: RejectionReason[] | null | undefined
  ): RejectionReason[] {
    const normalized = (reasons ?? [])
      .map(reason => ({
        code: String(reason?.code ?? "").trim(),
        label: String(reason?.label ?? "").trim(),
      }))
      .filter(reason => reason.code && reason.label);

    return normalized.length ? normalized : DEFAULT_VERIFICATION_REJECTION_REASONS;
  }
}
