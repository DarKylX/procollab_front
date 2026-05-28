/** @format */

import { CommonModule } from "@angular/common";
import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, inject, signal } from "@angular/core";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { FormControl, FormGroup, ReactiveFormsModule } from "@angular/forms";
import { ActivatedRoute, Router, RouterLink } from "@angular/router";
import { catchError, finalize, forkJoin, of } from "rxjs";
import {
  ModerationCriterion,
  ModerationExpert,
  ModerationLog,
  ModerationMaterial,
  ModerationProgramDetail,
  RejectionReason,
} from "../moderation.models";
import { ModerationService } from "../moderation.service";
import {
  ProgramStatus,
  ProgramStatusBadgeComponent,
} from "@office/program/shared/program-status-badge/program-status-badge.component";
import { ButtonComponent, IconComponent } from "@ui/components";
import { LoaderComponent } from "@ui/components/loader/loader.component";
import { ModalComponent } from "@ui/components/modal/modal.component";
import { SnackbarService } from "@ui/services/snackbar.service";

const FIX_SECTION_OPTIONS = [
  { key: "basic_info", label: "Основная информация" },
  { key: "visual_assets", label: "Обложка и визуальные материалы" },
  { key: "dates", label: "Сроки и формат" },
  { key: "registration", label: "Регистрация" },
  { key: "legal_terms", label: "Правовые документы" },
  { key: "materials", label: "Материалы" },
  { key: "criteria_experts", label: "Критерии и эксперты" },
];

const MOBILE_MANDATORY_CHECKS = [
  { key: "basic_info", altKey: "basicInfo", label: "Основная информация" },
  { key: "dates", label: "Сроки и формат" },
  { key: "registration", label: "Регистрация" },
  { key: "legal_terms", label: "Правовые документы" },
];

const MOBILE_OPTIONAL_CHECKS = [
  { key: "materials", label: "Материалы" },
  { key: "criteria_experts", altKey: "criteriaExperts", label: "Критерии и эксперты" },
  { key: "visual_assets", altKey: "visualAssets", label: "Обложка и визуальные материалы" },
  { key: "certificate_template", altKey: "certificateTemplate", label: "Сертификат" },
  { key: "verification", label: "Верификация" },
];

const REJECTION_REASON_LABELS: Record<string, string> = {
  insufficient_data: "Недостаточно данных",
  platform_rules: "Нарушение правил платформы",
  duplicate: "Дублирующий чемпионат",
  inappropriate_content: "Некорректное содержание",
  suspicious_organizer: "Подозрительный организатор",
  other: "Другая причина",
};

interface VisualPreview {
  url: string;
  label: string;
}

@Component({
  selector: "app-moderation-detail",
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    RouterLink,
    ButtonComponent,
    IconComponent,
    LoaderComponent,
    ProgramStatusBadgeComponent,
    ModalComponent,
  ],
  templateUrl: "./moderation-detail.component.html",
  styleUrl: "./moderation-detail.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ModerationDetailComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly moderationService = inject(ModerationService);
  private readonly snackbar = inject(SnackbarService);

  readonly program = signal<ModerationProgramDetail | null>(null);
  readonly rejectionReasons = signal<RejectionReason[]>([]);
  readonly isLoading = signal(true);
  readonly isDeciding = signal(false);
  readonly decisionError = signal("");
  readonly commentInvalid = signal(false);
  readonly descriptionExpanded = signal(false);
  readonly selectedSectionsToFix = signal<string[]>([]);
  readonly selectedVisual = signal<VisualPreview | null>(null);
  readonly approveConfirmOpen = signal(false);
  readonly rejectSheetOpen = signal(false);
  readonly fixSectionOptions = FIX_SECTION_OPTIONS;
  readonly mobileMandatoryChecks = MOBILE_MANDATORY_CHECKS;
  readonly mobileOptionalChecks = MOBILE_OPTIONAL_CHECKS;

  readonly decisionForm = new FormGroup({
    comment: new FormControl("", { nonNullable: true }),
    reasonCode: new FormControl("", { nonNullable: true }),
  });

  ngOnInit(): void {
    const programId = Number(this.route.snapshot.paramMap.get("programId"));
    if (!programId) {
      this.router.navigate(["/office/admin/moderation"]);
      return;
    }

    forkJoin({
      program: this.moderationService.getProgram(programId),
      reasons: this.moderationService.getRejectionReasons().pipe(catchError(() => of([]))),
    })
      .pipe(
        finalize(() => this.isLoading.set(false)),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe({
        next: ({ program, reasons }) => {
          this.program.set(program);
          this.rejectionReasons.set(this.normalizeRejectionReasons(reasons));
        },
        error: () => {
          this.snackbar.error("Не удалось загрузить чемпионат для модерации");
          this.router.navigate(["/office/admin/moderation"]);
        },
      });

    this.decisionForm.controls.comment.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.commentInvalid.set(false));
  }

  get canDecide(): boolean {
    return this.program()?.status === "pending_moderation";
  }

  get canReject(): boolean {
    if (!this.canDecide || this.isDeciding()) {
      return false;
    }

    return Boolean(
      this.decisionForm.controls.comment.value.trim() &&
        (!this.rejectionReasons().length || this.decisionForm.controls.reasonCode.value)
    );
  }

  approve(): void {
    const program = this.program();
    if (!program || !this.canDecide || this.isDeciding()) {
      return;
    }

    this.approveConfirmOpen.set(true);
  }

  confirmApprove(): void {
    const program = this.program();
    if (!program || !this.canDecide || this.isDeciding()) {
      return;
    }

    this.approveConfirmOpen.set(false);
    this.submitDecision(program.id, "approve");
  }

  cancelApprove(): void {
    this.approveConfirmOpen.set(false);
  }

  openRejectSheet(): void {
    if (!this.canDecide || this.isDeciding()) {
      return;
    }

    this.rejectSheetOpen.set(true);
    this.decisionError.set("");
  }

  closeRejectSheet(): void {
    if (this.isDeciding()) {
      return;
    }

    this.rejectSheetOpen.set(false);
  }

  reject(): void {
    const program = this.program();
    if (!program || !this.canDecide || this.isDeciding()) {
      return;
    }

    const comment = this.decisionForm.controls.comment.value.trim();
    const reasonCode = this.decisionForm.controls.reasonCode.value;

    if (!comment) {
      this.commentInvalid.set(true);
      this.decisionError.set("Комментарий обязателен при отклонении.");
      return;
    }

    if (this.rejectionReasons().length && !reasonCode) {
      this.decisionError.set("Выберите причину отклонения.");
      return;
    }

    this.submitDecision(program.id, "reject");
  }

  asProgramStatus(status: ModerationProgramDetail["status"]): ProgramStatus {
    return status as ProgramStatus;
  }

  accessLabel(program: ModerationProgramDetail): string {
    return (program.accessType ?? (program.isPrivate ? "closed" : "open")) === "closed"
      ? "Закрытый"
      : "Открытый";
  }

  registrationLabel(program: ModerationProgramDetail): string {
    return (program.registrationType ?? (program.registrationLink ? "external" : "internal")) ===
      "external"
      ? "Внешняя ссылка"
      : "Встроенная форма";
  }

  organizers(program: ModerationProgramDetail) {
    return program.organizers?.length ? program.organizers : program.managers ?? [];
  }

  readinessEntries(program: ModerationProgramDetail): Array<{
    key: string;
    label: string;
    value: string;
    completed: boolean;
  }> {
    const readiness = program.readiness ?? {};
    return Object.entries(readiness).map(([key, value]) => ({
      key,
      label: this.readinessLabel(key),
      value: value === "not_applicable" ? "Не требуется" : value ? "Готово" : "Не готово",
      completed: value === true || value === "not_applicable",
    }));
  }

  dataSchemaEntries(program: ModerationProgramDetail): Array<{ key: string; label: string; type?: string }> {
    return Object.entries(program.dataSchema ?? {}).map(([key, field]) => ({
      key,
      label: field.label || field.name || key,
      type: field.type,
    }));
  }

  privacyWarningMessages(program: ModerationProgramDetail): string[] {
    const warnings = program.privacyWarnings;
    if (!warnings) {
      return [];
    }

    const messages: string[] = [];
    if (warnings.missingLegalDocuments?.length) {
      messages.push(
        `Нет активных правовых документов: ${warnings.missingLegalDocuments.join(", ")}.`
      );
    }
    if (warnings.organizerTermsNotAccepted) {
      messages.push("Организатор не принял обязательство по использованию данных участников.");
    }
    if (warnings.forbiddenRegistrationFields?.length) {
      messages.push("В регистрационной форме есть поля с потенциально избыточными ПДн.");
    }

    return messages;
  }

  trackById(_: number, item: ModerationMaterial | ModerationCriterion | ModerationExpert | ModerationLog): number {
    return item.id;
  }

  toggleDescription(): void {
    this.descriptionExpanded.update(value => !value);
  }

  toggleSectionToFix(sectionKey: string): void {
    this.selectedSectionsToFix.update(sections =>
      sections.includes(sectionKey)
        ? sections.filter(key => key !== sectionKey)
        : [...sections, sectionKey]
    );
  }

  isSectionSelected(sectionKey: string): boolean {
    return this.selectedSectionsToFix().includes(sectionKey);
  }

  companyVerificationLabel(program: ModerationProgramDetail): string {
    return program.isCompanyVerified
      ? "чемпионат от верифицированной компании"
      : "компания не верифицирована";
  }

  submittedLabel(program: ModerationProgramDetail): string {
    const rawDate = program.submittedAt || program.decisionAt || program.datetimeUpdated;
    return rawDate ? new Date(rawDate).toLocaleString("ru-RU") : "Нет данных";
  }

  primaryOrganizerLabel(program: ModerationProgramDetail): string {
    const organizer = this.organizers(program)[0];
    return organizer?.fullName || organizer?.email || "Организатор не указан";
  }

  readinessCheckLabel(
    program: ModerationProgramDetail,
    check: { key: string; altKey?: string }
  ): string {
    const value = this.readinessValue(program, check.key, check.altKey);

    if (value === "not_applicable") {
      return "Не влияет на публикацию";
    }

    if (value === undefined) {
      return "Нет данных";
    }

    return value ? "Готово" : "Не готово";
  }

  readinessCheckCompleted(
    program: ModerationProgramDetail,
    check: { key: string; altKey?: string }
  ): boolean {
    const value = this.readinessValue(program, check.key, check.altKey);
    return value === true || value === "not_applicable";
  }

  deadlineLabel(program: ModerationProgramDetail): string {
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

  logActionLabel(log: ModerationLog): string {
    const labels: Record<string, string> = {
      submit_to_moderation: "Отправка на модерацию",
      submitted: "Отправка на модерацию",
      approve: "Одобрение",
      approved: "Одобрение",
      reject: "Отклонение",
      rejected: "Отклонение",
      withdraw: "Отзыв с модерации",
      withdrawn: "Отзыв с модерации",
      restore: "Восстановление",
      archive: "Архивация",
      freeze: "Заморозка",
      auto_freeze: "Автоматическая заморозка",
    };
    return labels[log.action] ?? log.actionLabel ?? log.action;
  }

  statusLabel(status?: string): string {
    const labels: Record<string, string> = {
      draft: "Черновик",
      pending_moderation: "На модерации",
      published: "Опубликован",
      rejected: "На доработке",
      frozen: "Заморожен",
      archived: "Архив",
    };
    return status ? labels[status] ?? status : "";
  }

  sectionLabel(key: string): string {
    return this.fixSectionOptions.find(option => option.key === key)?.label ?? this.readinessLabel(key);
  }

  sectionsLabel(keys: string[] = []): string {
    return keys.map(key => this.sectionLabel(key)).join(", ");
  }

  actorLabel(log: ModerationLog): string {
    const actor = log.actor ?? log.author;
    return actor?.fullName || actor?.email || "";
  }

  openVisual(url: string | undefined, label: string): void {
    if (!url) {
      return;
    }

    this.selectedVisual.set({ url, label });
  }

  closeVisual(): void {
    this.selectedVisual.set(null);
  }

  private submitDecision(programId: number, decision: "approve" | "reject"): void {
    this.decisionError.set("");
    this.commentInvalid.set(false);
    this.isDeciding.set(true);
    this.moderationService
      .decide(programId, {
        decision,
        comment: this.decisionForm.controls.comment.value.trim(),
        reasonCode: this.decisionForm.controls.reasonCode.value || undefined,
        sectionsToFix: decision === "reject" ? this.selectedSectionsToFix() : [],
      })
      .pipe(
        finalize(() => this.isDeciding.set(false)),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe({
        next: () => {
          this.snackbar.success(
            decision === "approve"
              ? "Чемпионат опубликован"
              : "Чемпионат отправлен на доработку"
          );
          this.router.navigate(["/office/admin/moderation"]);
        },
        error: error => {
          const fallback = "Не удалось сохранить решение по модерации";
          this.decisionError.set(error?.error?.detail || fallback);
          this.snackbar.error(fallback);
        },
      });
  }

  private readinessLabel(key: string): string {
    const labels: Record<string, string> = {
      basicInfo: "Основная информация",
      basic_info: "Основная информация",
      dates: "Сроки и формат",
      registration: "Регистрация",
      legal_terms: "Правовые документы",
      legalTerms: "Правовые документы",
      materials: "Материалы",
      criteriaExperts: "Критерии и эксперты",
      criteria_experts: "Критерии и эксперты",
      visualAssets: "Обложка и визуальные материалы",
      visual_assets: "Обложка и визуальные материалы",
      verification: "Верификация",
      certificateTemplate: "Сертификат",
      certificate_template: "Сертификат",
    };
    return labels[key] ?? key;
  }

  private normalizeRejectionReasons(reasons: RejectionReason[]): RejectionReason[] {
    return reasons.map(reason => ({
      ...reason,
      label: REJECTION_REASON_LABELS[reason.code] ?? reason.label,
    }));
  }

  private readinessValue(
    program: ModerationProgramDetail,
    key: string,
    altKey?: string
  ): boolean | "not_applicable" | undefined {
    return program.readiness?.[key] ?? (altKey ? program.readiness?.[altKey] : undefined);
  }
}
