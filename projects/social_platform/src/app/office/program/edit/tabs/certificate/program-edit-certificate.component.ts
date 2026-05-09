/** @format */

import { CommonModule } from "@angular/common";
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  DestroyRef,
  OnDestroy,
  OnInit,
  inject,
} from "@angular/core";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { FormBuilder, ReactiveFormsModule } from "@angular/forms";
import { DomSanitizer, SafeResourceUrl } from "@angular/platform-browser";
import { catchError, finalize, forkJoin, map, Observable, of, tap, throwError } from "rxjs";
import { FileService } from "@core/services/file.service";
import {
  CertificateFieldPosition,
  CertificateGenerationStats,
  CertificateReleaseMode,
  CertificateAssetPosition,
  IssuedCertificate,
  ProgramCertificateSettings,
} from "@office/program/models/program-certificate.model";
import { Program } from "@office/program/models/program.model";
import { ProgramService } from "@office/program/services/program.service";
import { IconComponent } from "@ui/components";
import { SnackbarService } from "@ui/services/snackbar.service";
import {
  ProgramEditStateService,
  ProgramEditTabController,
} from "../../services/program-edit-state.service";

interface CertificateFieldRow extends CertificateFieldPosition {
  key: string;
  label: string;
  sample: string;
  fontSize: number;
}

type CertificateUploadTarget = "background" | "signature" | "stamp" | "companyLogo";

const DEFAULT_FIELD_LABELS: Record<string, string> = {
  participant_full_name: "ФИО участника",
  program_title: "Название чемпионата",
  completion_date: "Дата завершения",
  organizer_name: "Организатор",
  certificate_id: "ID сертификата",
  project_title: "Название проекта",
  team_members: "Участники проекта",
  rank: "Место в рейтинге",
  signer_name: "Имя подписанта",
};

const FIELD_SAMPLE_VALUES: Record<string, string> = {
  participant_full_name: "Иван Петров",
  program_title: "Финансовый форсайт 2026",
  completion_date: "15 июля 2026",
  organizer_name: "PROCOLLAB",
  certificate_id: "CERT-2026-000124",
  project_title: "AI-модель оценки рисков",
  team_members: "Иван Петров, Анна Смирнова",
  rank: "1 место",
  signer_name: "Анна Смирнова",
};

const DEFAULT_FIELD_POSITIONS: Record<string, CertificateFieldPosition> = {
  participant_full_name: { x: 0.5, y: 0.43, fontSize: 36, align: "center", visible: true },
  program_title: { x: 0.5, y: 0.55, fontSize: 24, align: "center", visible: true },
  completion_date: { x: 0.22, y: 0.79, fontSize: 14, align: "left", visible: true },
  organizer_name: { x: 0.24, y: 0.82, fontSize: 14, align: "center", visible: false },
  certificate_id: { x: 0.22, y: 0.88, fontSize: 12, align: "left", visible: true },
  project_title: { x: 0.5, y: 0.64, fontSize: 14, align: "center", visible: true },
  team_members: { x: 0.5, y: 0.56, fontSize: 14, align: "center", visible: false },
  rank: { x: 0.5, y: 0.6, fontSize: 18, align: "center", visible: false },
  signer_name: { x: 0.6, y: 0.88, fontSize: 15, align: "left", visible: true },
};

const DEFAULT_SIGNATURE_POSITION: CertificateAssetPosition = { x: 0.6, y: 0.79, width: 0.16 };
const DEFAULT_STAMP_POSITION: CertificateAssetPosition = { x: 0.43, y: 0.8, width: 0.13 };
const DEFAULT_COMPANY_LOGO_POSITION: CertificateAssetPosition = { x: 0.78, y: 0.13, width: 0.18 };
const DEFAULT_SIGNER_NAME = "Анна Смирнова";

@Component({
  selector: "app-program-edit-certificate",
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, IconComponent],
  templateUrl: "./program-edit-certificate.component.html",
  styleUrl: "./program-edit-certificate.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProgramEditCertificateComponent implements OnInit, OnDestroy {
  private readonly fb = inject(FormBuilder);
  private readonly destroyRef = inject(DestroyRef);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly editState = inject(ProgramEditStateService);
  private readonly programService = inject(ProgramService);
  private readonly fileService = inject(FileService);
  private readonly snackbar = inject(SnackbarService);
  private readonly sanitizer = inject(DomSanitizer);

  private readonly tabKey = "certificate";
  private initialSnapshot = "";
  private previewUrl?: string;

  readonly form = this.fb.nonNullable.group({
    isEnabled: [false],
    releaseMode: ["after_program_end" as CertificateReleaseMode],
    templateName: [""],
    backgroundFile: [""],
    signatureFile: [""],
    stampFile: [""],
    companyLogoFile: [""],
    signerName: [DEFAULT_SIGNER_NAME],
    signatureX: [DEFAULT_SIGNATURE_POSITION.x],
    signatureY: [DEFAULT_SIGNATURE_POSITION.y],
    signatureWidth: [DEFAULT_SIGNATURE_POSITION.width],
    stampX: [DEFAULT_STAMP_POSITION.x],
    stampY: [DEFAULT_STAMP_POSITION.y],
    stampWidth: [DEFAULT_STAMP_POSITION.width],
    companyLogoX: [DEFAULT_COMPANY_LOGO_POSITION.x],
    companyLogoY: [DEFAULT_COMPANY_LOGO_POSITION.y],
    companyLogoWidth: [DEFAULT_COMPANY_LOGO_POSITION.width],
    textColor: ["#4F2BD9"],
    fontFamily: ["inter"],
    showProjectTitle: [true],
    showTeamMembers: [false],
    showRank: [{ value: false, disabled: true }],
  });

  readonly controller: ProgramEditTabController = {
    tabKey: this.tabKey,
    save: () => this.saveForEditFooter(),
    reset: () => this.reset(),
  };

  settings?: ProgramCertificateSettings;
  stats?: CertificateGenerationStats;
  certificates: IssuedCertificate[] = [];
  fieldRows: CertificateFieldRow[] = [];
  isLoading = true;
  isEditing = false;
  uploadingTarget: CertificateUploadTarget | null = null;
  isPreviewLoading = false;
  isGenerating = false;
  isReleasing = false;
  previewOpen = false;
  previewObjectUrl: SafeResourceUrl | null = null;

  ngOnInit(): void {
    this.editState.registerController(this.controller);
    this.load();

    this.form.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      this.syncState();
      this.cdr.markForCheck();
    });
  }

  ngOnDestroy(): void {
    this.editState.unregisterController(this.controller);
    this.revokePreviewUrl();
  }

  get program(): Program | null {
    return this.editState.program();
  }

  get isReadonly(): boolean {
    const status = this.program?.status;
    return status === "pending_moderation" || status === "frozen" || status === "archived";
  }

  get hasSavedTemplate(): boolean {
    return Boolean(this.settings?.isConfigured || this.form.controls.backgroundFile.value);
  }

  get isGenerated(): boolean {
    return Boolean((this.stats?.generatedCount ?? this.certificates.length) > 0);
  }

  get canGenerate(): boolean {
    return Boolean(
      this.settings?.isEnabled &&
        this.settings?.isConfigured &&
        (this.stats?.eligibleCount ?? 0) > 0 &&
        !this.isReadonly
    );
  }

  get canReleaseManual(): boolean {
    return Boolean(
      this.settings?.releaseMode === "manual" &&
        this.isGenerated &&
        !this.settings?.releasedAt &&
        !this.isReadonly
    );
  }

  get backgroundFileName(): string {
    const meta = this.settings?.backgroundFileMeta;
    if (meta?.name) {
      return `${meta.name}${meta.extension ? "." + meta.extension : ""}`;
    }
    const link = this.form.controls.backgroundFile.value || this.settings?.backgroundFile || "";
    return decodeURIComponent(String(link).split("/").pop() || "Файл загружен");
  }

  get usesDefaultBackground(): boolean {
    return !this.form.controls.backgroundFile.value;
  }

  get isUploading(): boolean {
    return this.uploadingTarget !== null;
  }

  isUploadingTarget(target: CertificateUploadTarget): boolean {
    return this.uploadingTarget === target;
  }

  assetFileName(target: "signature" | "stamp" | "companyLogo"): string {
    const meta =
      target === "signature"
        ? this.settings?.signatureFileMeta
        : target === "stamp"
          ? this.settings?.stampFileMeta
          : this.settings?.companyLogoFileMeta;
    if (meta?.name) {
      return `${meta.name}${meta.extension ? "." + meta.extension : ""}`;
    }
    const link =
      target === "signature"
        ? this.form.controls.signatureFile.value || this.settings?.signatureFile || ""
        : target === "stamp"
          ? this.form.controls.stampFile.value || this.settings?.stampFile || ""
          : this.form.controls.companyLogoFile.value || this.settings?.companyLogoFile || "";
    return decodeURIComponent(String(link).split("/").pop() || "Файл загружен");
  }

  startSetup(): void {
    this.isEditing = true;
    this.form.patchValue({ isEnabled: true }, { emitEvent: false });
    this.syncState();
  }

  editSettings(): void {
    this.isEditing = true;
    this.syncState();
  }

  cancelEdit(): void {
    this.reset();
    this.isEditing = Boolean(!this.settings?.isConfigured);
  }

  onFileSelected(event: Event): void {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) {
      return;
    }

    const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
    if (!["pdf", "png", "jpg", "jpeg"].includes(extension)) {
      this.snackbar.error("Поддерживаются PDF, PNG, JPG и JPEG");
      input.value = "";
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      this.snackbar.error("Файл должен быть не больше 10 МБ");
      input.value = "";
      return;
    }

    this.uploadingTarget = "background";
    this.fileService
      .uploadFile(file, { preserveOriginal: true })
      .pipe(
        catchError(error => {
          this.snackbar.error("Не удалось загрузить фон сертификата");
          return throwError(() => error);
        }),
        finalize(() => {
          this.uploadingTarget = null;
          input.value = "";
          this.cdr.markForCheck();
        }),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe(response => {
        const uploaded = response.file as { link?: string } | undefined;
        this.form.patchValue({ backgroundFile: uploaded?.link ?? response.url });
        this.snackbar.success("Фон сертификата загружен");
      });
  }

  onAssetSelected(event: Event, target: "signature" | "stamp" | "companyLogo"): void {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) {
      return;
    }

    const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
    if (!["png", "jpg", "jpeg"].includes(extension)) {
      this.snackbar.error("Для подписи и печати поддерживаются PNG, JPG и JPEG");
      input.value = "";
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      this.snackbar.error("Файл должен быть не больше 10 МБ");
      input.value = "";
      return;
    }

    this.uploadingTarget = target;
    this.fileService
      .uploadFile(file, { preserveOriginal: true })
      .pipe(
        catchError(error => {
          this.snackbar.error("Не удалось загрузить файл");
          return throwError(() => error);
        }),
        finalize(() => {
          this.uploadingTarget = null;
          input.value = "";
          this.cdr.markForCheck();
        }),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe(response => {
        const uploaded = response.file as { link?: string } | undefined;
        const link = uploaded?.link ?? response.url;
        this.form.patchValue(
          target === "signature"
            ? { signatureFile: link }
            : target === "stamp"
              ? { stampFile: link }
              : { companyLogoFile: link }
        );
        this.snackbar.success(
          target === "signature"
            ? "Подпись загружена"
            : target === "stamp"
              ? "Печать загружена"
              : "Логотип компании загружен"
        );
      });
  }

  removeUploadedAsset(target: "signature" | "stamp" | "companyLogo"): void {
    this.form.patchValue(
      target === "signature"
        ? { signatureFile: "" }
        : target === "stamp"
          ? { stampFile: "" }
          : { companyLogoFile: "" }
    );
  }

  updateField(row: CertificateFieldRow, key: keyof CertificateFieldRow, value: unknown): void {
    if (this.isReadonly) {
      return;
    }

    const nextValue =
      key === "visible"
        ? Boolean(value)
        : key === "align"
          ? value
          : Number(value);
    this.fieldRows = this.fieldRows.map(item =>
      item.key === row.key ? ({ ...item, [key]: nextValue } as CertificateFieldRow) : item
    );
    this.syncState();
  }

  openPreview(): void {
    const programId = this.program?.id;
    if (!programId) {
      return;
    }

    this.isPreviewLoading = true;
    this.programService
      .previewCertificate(programId, this.buildPayload())
      .pipe(
        catchError(error => {
          this.snackbar.error("Не удалось сформировать предпросмотр");
          return throwError(() => error);
        }),
        finalize(() => {
          this.isPreviewLoading = false;
          this.cdr.markForCheck();
        }),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe(blob => {
        this.revokePreviewUrl();
        this.previewUrl = URL.createObjectURL(blob);
        this.previewObjectUrl = this.sanitizer.bypassSecurityTrustResourceUrl(this.previewUrl);
        this.previewOpen = true;
        this.cdr.markForCheck();
      });
  }

  closePreview(): void {
    this.previewOpen = false;
  }

  saveFromPreview(): void {
    this.saveSettings().subscribe({ error: () => undefined });
    this.previewOpen = false;
  }

  saveSettingsClick(): void {
    this.saveSettings().subscribe({ error: () => undefined });
  }

  saveSettings(): Observable<ProgramCertificateSettings> {
    const programId = this.program?.id;
    if (!programId || this.isReadonly) {
      return throwError(() => new Error("Certificate settings cannot be saved"));
    }

    return this.programService.saveCertificateSettings(programId, this.buildPayload()).pipe(
      tap(settings => {
        this.settings = settings;
        this.patchForm(settings);
        this.isEditing = false;
        this.initialSnapshot = this.currentSnapshot();
        this.syncState(false);
        this.snackbar.success("Шаблон сертификата сохранен");
        this.refreshList();
      }),
      catchError(error => {
        this.snackbar.error("Не удалось сохранить сертификат");
        return throwError(() => error);
      })
    );
  }

  generateCertificates(): void {
    const programId = this.program?.id;
    if (!programId || !this.canGenerate) {
      return;
    }

    if (
      this.isGenerated &&
      !window.confirm(
        "Старые PDF будут обновлены. Участники будут скачивать новую версию сертификата."
      )
    ) {
      return;
    }

    this.isGenerating = true;
    this.programService
      .generateCertificates(programId, true)
      .pipe(
        catchError(error => {
          this.snackbar.error("Не удалось сгенерировать сертификаты");
          return throwError(() => error);
        }),
        finalize(() => {
          this.isGenerating = false;
          this.cdr.markForCheck();
        }),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe(response => {
        this.stats = response.stats;
        this.settings = this.settings
          ? { ...this.settings, generatedAt: response.run.completedAt ?? new Date().toISOString() }
          : this.settings;
        this.refreshList();
        this.snackbar.success("Сертификаты сгенерированы");
      });
  }

  releaseCertificates(): void {
    const programId = this.program?.id;
    if (!programId || !this.canReleaseManual) {
      return;
    }

    this.isReleasing = true;
    this.programService
      .releaseCertificates(programId)
      .pipe(
        catchError(error => {
          this.snackbar.error("Не удалось открыть доступ к сертификатам");
          return throwError(() => error);
        }),
        finalize(() => {
          this.isReleasing = false;
          this.cdr.markForCheck();
        }),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe(settings => {
        this.settings = settings;
        this.patchForm(settings);
        this.initialSnapshot = this.currentSnapshot();
        this.syncState(false);
        this.snackbar.success("Доступ к сертификатам открыт");
      });
  }

  formatDate(value?: string | null): string {
    if (!value) {
      return "нет данных";
    }
    return new Date(value).toLocaleString("ru-RU", {
      day: "numeric",
      month: "long",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  releaseModeLabel(value?: string): string {
    return value === "manual" ? "вручную" : "после завершения чемпионата";
  }

  private load(): void {
    const programId = this.program?.id;
    if (!programId) {
      return;
    }

    forkJoin({
      settings: this.programService.getCertificateSettings(programId),
      list: this.programService.getCertificateList(programId).pipe(
        catchError(() => of({ certificates: [], stats: this.emptyStats() }))
      ),
    })
      .pipe(
        finalize(() => {
          this.isLoading = false;
          this.cdr.markForCheck();
        }),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe(({ settings, list }) => {
        this.settings = settings;
        this.certificates = list.certificates;
        this.stats = list.stats;
        this.patchForm(settings);
        this.isEditing = !settings.isConfigured && !settings.isEnabled;
        this.initialSnapshot = this.currentSnapshot();
        this.syncState(false);
      });
  }

  private refreshList(): void {
    const programId = this.program?.id;
    if (!programId) {
      return;
    }

    this.programService
      .getCertificateList(programId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(response => {
        this.certificates = response.certificates;
        this.stats = response.stats;
        this.cdr.markForCheck();
      });
  }

  private patchForm(settings: ProgramCertificateSettings): void {
    this.form.patchValue(
      {
        isEnabled: settings.isEnabled,
        releaseMode: settings.releaseMode ?? "after_program_end",
        templateName: settings.templateName || "",
        backgroundFile: settings.backgroundFile || settings.backgroundFileMeta?.link || "",
        signatureFile: settings.signatureFile || settings.signatureFileMeta?.link || "",
        stampFile: settings.stampFile || settings.stampFileMeta?.link || "",
        companyLogoFile: settings.companyLogoFile || settings.companyLogoFileMeta?.link || "",
        signerName: settings.signerName || DEFAULT_SIGNER_NAME,
        signatureX: Number(settings.signaturePosition?.x ?? DEFAULT_SIGNATURE_POSITION.x),
        signatureY: Number(settings.signaturePosition?.y ?? DEFAULT_SIGNATURE_POSITION.y),
        signatureWidth: Number(settings.signaturePosition?.width ?? DEFAULT_SIGNATURE_POSITION.width),
        stampX: Number(settings.stampPosition?.x ?? DEFAULT_STAMP_POSITION.x),
        stampY: Number(settings.stampPosition?.y ?? DEFAULT_STAMP_POSITION.y),
        stampWidth: Number(settings.stampPosition?.width ?? DEFAULT_STAMP_POSITION.width),
        companyLogoX: Number(settings.companyLogoPosition?.x ?? DEFAULT_COMPANY_LOGO_POSITION.x),
        companyLogoY: Number(settings.companyLogoPosition?.y ?? DEFAULT_COMPANY_LOGO_POSITION.y),
        companyLogoWidth: Number(
          settings.companyLogoPosition?.width ?? DEFAULT_COMPANY_LOGO_POSITION.width
        ),
        textColor: settings.textColor || "#4F2BD9",
        fontFamily: settings.fontFamily || "inter",
        showProjectTitle: settings.showProjectTitle ?? true,
        showTeamMembers: settings.showTeamMembers ?? false,
        showRank: settings.showRank ?? false,
      },
      { emitEvent: false }
    );
    this.fieldRows = this.buildFieldRows(settings.fieldPositions);
  }

  private buildFieldRows(
    positions: ProgramCertificateSettings["fieldPositions"] | undefined
  ): CertificateFieldRow[] {
    return Object.entries(DEFAULT_FIELD_POSITIONS).map(([key, defaults]) => {
      const config = positions?.[key] ?? defaults;
      return {
        key,
        label: DEFAULT_FIELD_LABELS[key] ?? key,
        sample: FIELD_SAMPLE_VALUES[key] ?? "",
        x: Number(config.x ?? defaults.x),
        y: Number(config.y ?? defaults.y),
        fontSize: Number(config.fontSize ?? config.font_size ?? defaults.fontSize ?? 14),
        align: config.align ?? defaults.align,
        visible: Boolean(config.visible ?? defaults.visible),
        color: config.color ?? null,
      };
    });
  }

  private buildPayload(): Partial<ProgramCertificateSettings> {
    const value = this.form.getRawValue();
    const fieldPositions = this.fieldRows.reduce<Record<string, CertificateFieldPosition>>(
      (acc, row) => {
        acc[row.key] = {
          x: Number(row.x),
          y: Number(row.y),
          fontSize: Number(row.fontSize),
          align: row.align,
          visible: row.visible,
          color: row.color ?? null,
        };
        return acc;
      },
      {}
    );

    return {
      isEnabled: value.isEnabled,
      issueRule: "submitted_project",
      releaseMode: value.releaseMode,
      certificateType: "participation",
      showProjectTitle: value.showProjectTitle,
      showTeamMembers: value.showTeamMembers,
      showRank: Boolean(value.showRank),
      templateName: value.templateName.trim() || "Базовый шаблон A4",
      backgroundFile: value.backgroundFile || null,
      signatureFile: value.signatureFile || null,
      stampFile: value.stampFile || null,
      companyLogoFile: value.companyLogoFile || null,
      signerName: value.signerName.trim() || DEFAULT_SIGNER_NAME,
      signaturePosition: {
        x: Number(value.signatureX),
        y: Number(value.signatureY),
        width: Number(value.signatureWidth),
      },
      stampPosition: {
        x: Number(value.stampX),
        y: Number(value.stampY),
        width: Number(value.stampWidth),
      },
      companyLogoPosition: {
        x: Number(value.companyLogoX),
        y: Number(value.companyLogoY),
        width: Number(value.companyLogoWidth),
      },
      textColor: value.textColor || "#4F2BD9",
      fontFamily: value.fontFamily || "inter",
      fieldPositions,
    };
  }

  private saveForEditFooter(): Observable<Program> {
    return this.saveSettings().pipe(map(() => this.program as Program));
  }

  private reset(): void {
    if (this.settings) {
      this.patchForm(this.settings);
    }
    this.syncState(false);
    this.cdr.markForCheck();
  }

  private syncState(explicitDirty?: boolean): void {
    const dirty = explicitDirty ?? this.currentSnapshot() !== this.initialSnapshot;
    const valid = true;
    this.editState.updateFormState(dirty, valid, this.isReadonly, {
      tabKey: this.tabKey,
      draft: this.buildPayload(),
    });
  }

  private currentSnapshot(): string {
    return JSON.stringify(this.buildPayload());
  }

  private emptyStats(): CertificateGenerationStats {
    return {
      issuedCount: 0,
      generatedCount: 0,
      pendingCount: 0,
      eligibleCount: 0,
      errorCount: 0,
      lastRun: null,
    };
  }

  private revokePreviewUrl(): void {
    if (this.previewUrl) {
      URL.revokeObjectURL(this.previewUrl);
      this.previewUrl = undefined;
    }
    this.previewObjectUrl = null;
  }
}
