/** @format */

import { CommonModule } from "@angular/common";
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  DestroyRef,
  OnInit,
  inject,
} from "@angular/core";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { FormBuilder, ReactiveFormsModule, Validators } from "@angular/forms";
import { catchError, finalize, forkJoin, of, tap, throwError } from "rxjs";
import { FileService } from "@core/services/file.service";
import {
  ProgramVerificationRequest,
  ProgramVerificationState,
  VerificationDocument,
  VerificationStatus,
} from "@office/program/models/program-verification.model";
import { ProgramService } from "@office/program/services/program.service";
import { IconComponent } from "@ui/components";
import { LoaderComponent } from "@ui/components/loader/loader.component";
import { SnackbarService } from "@ui/services/snackbar.service";
import { ProgramEditStateService } from "../../services/program-edit-state.service";

const MAX_FILES = 5;
const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ALLOWED_EXTENSIONS = new Set(["pdf", "png", "jpg", "jpeg"]);
const ALLOWED_MIME_TYPES = new Set(["application/pdf", "image/png", "image/jpeg"]);
const WEBSITE_URL_PATTERN = /^https?:\/\/[^\s]+\.[^\s]+$/i;

interface SelectedVerificationDocument {
  file: File;
  name: string;
  size: number;
  url?: string;
  uploading: boolean;
  error?: string;
}

@Component({
  selector: "app-program-edit-verification",
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, IconComponent, LoaderComponent],
  templateUrl: "./program-edit-verification.component.html",
  styleUrl: "./program-edit-verification.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProgramEditVerificationComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly destroyRef = inject(DestroyRef);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly editState = inject(ProgramEditStateService);
  private readonly programService = inject(ProgramService);
  private readonly fileService = inject(FileService);
  private readonly snackbar = inject(SnackbarService);

  readonly maxFiles = MAX_FILES;
  readonly maxFileSizeMb = 10;

  readonly form = this.fb.nonNullable.group({
    companyName: ["", [Validators.required, Validators.maxLength(255)]],
    inn: ["", [Validators.required, Validators.pattern(/^\d{10}(\d{2})?$/)]],
    legalName: ["", [Validators.maxLength(255)]],
    ogrn: ["", [Validators.maxLength(32)]],
    website: ["", [Validators.maxLength(255), Validators.pattern(WEBSITE_URL_PATTERN)]],
    region: ["", [Validators.required, Validators.maxLength(255)]],
    contactFullName: ["", [Validators.required, Validators.maxLength(255)]],
    contactPosition: ["", [Validators.required, Validators.maxLength(255)]],
    contactEmail: ["", [Validators.required, Validators.email]],
    contactPhone: ["", [Validators.required, Validators.maxLength(64)]],
    companyRoleDescription: ["", [Validators.required, Validators.maxLength(1000)]],
    confirmed: [false, [Validators.requiredTrue]],
  });

  state: ProgramVerificationState | null = null;
  selectedDocuments: SelectedVerificationDocument[] = [];
  isLoading = true;
  isSubmitting = false;
  isDragActive = false;

  ngOnInit(): void {
    this.loadState();
  }

  get program() {
    return this.editState.program();
  }

  get status(): VerificationStatus {
    return (
      this.state?.verificationStatus ??
      this.state?.currentStatus ??
      this.program?.verificationStatus ??
      "not_requested"
    );
  }

  get latestRequest(): ProgramVerificationRequest | null {
    return this.state?.latestRequest ?? null;
  }

  get history(): ProgramVerificationRequest[] {
    return this.state?.requestsHistory ?? this.state?.history ?? [];
  }

  get canShowForm(): boolean {
    return this.status === "not_requested" || this.status === "rejected" || this.status === "revoked";
  }

  get formTitle(): string {
    return this.status === "rejected" || this.status === "revoked"
      ? "Форма верификации (заполните и подайте повторно)"
      : "Заявка на верификацию";
  }

  get submitButtonText(): string {
    if (this.isSubmitting) {
      return "Отправляем...";
    }

    return this.status === "rejected" || this.status === "revoked"
      ? "Подать повторно"
      : "Отправить заявку";
  }

  get uploadedDocumentUrls(): string[] {
    return this.selectedDocuments
      .map(document => document.url)
      .filter((url): url is string => Boolean(url));
  }

  get hasUploadingDocuments(): boolean {
    return this.selectedDocuments.some(document => document.uploading);
  }

  get canSubmit(): boolean {
    return Boolean(
      this.canShowForm &&
        this.form.valid &&
        this.uploadedDocumentUrls.length > 0 &&
        !this.hasUploadingDocuments &&
        !this.isSubmitting
    );
  }

  get roleDescriptionLength(): number {
    return this.form.controls.companyRoleDescription.value.length;
  }

  statusLabel(status: VerificationStatus | string = this.status): string {
    const labels: Record<string, string> = {
      not_requested: "Не запрошена",
      pending: "На рассмотрении",
      verified: "Подтверждена",
      rejected: "Отклонена",
      revoked: "Отозвана",
    };
    return labels[status] ?? status;
  }

  requestDate(request: ProgramVerificationRequest | null | undefined): string {
    const rawDate = request?.submittedAt;
    return rawDate ? new Date(rawDate).toLocaleString("ru-RU") : "Не указана";
  }

  decisionDate(request: ProgramVerificationRequest | null | undefined): string {
    const rawDate = request?.reviewedAt ?? request?.decidedAt;
    return rawDate ? new Date(rawDate).toLocaleString("ru-RU") : "Не указана";
  }

  documentUrl(document: VerificationDocument): string {
    return document.url || document.link || "";
  }

  documentName(document: VerificationDocument | SelectedVerificationDocument): string {
    if ("file" in document) {
      return document.name;
    }

    return document.name || this.fileName(document.link || document.url || "");
  }

  fileName(url: string): string {
    return decodeURIComponent(url.split("/").pop() || url);
  }

  fileSize(size?: number): string {
    if (!size) {
      return "размер не указан";
    }

    if (size < 1024 * 1024) {
      return `${Math.round(size / 1024)} КБ`;
    }

    return `${(size / (1024 * 1024)).toFixed(1)} МБ`;
  }

  isInvalid(controlName: keyof typeof this.form.controls): boolean {
    const control = this.form.controls[controlName];
    return control.invalid && (control.dirty || control.touched);
  }

  errorText(controlName: keyof typeof this.form.controls): string {
    const control = this.form.controls[controlName];

    if (control.hasError("required") || control.hasError("requiredTrue")) {
      return "Поле обязательно";
    }

    if (control.hasError("email")) {
      return "Введите корректный email";
    }

    if (control.hasError("server")) {
      return control.getError("server");
    }

    if (control.hasError("pattern")) {
      if (controlName === "website") {
        return "Введите корректную ссылку, например https://example.com";
      }
      return "ИНН должен содержать 10 или 12 цифр";
    }

    if (control.hasError("maxlength")) {
      return `Максимум ${control.getError("maxlength").requiredLength} символов`;
    }

    return "";
  }

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    this.isDragActive = true;
  }

  onDragLeave(event: DragEvent): void {
    event.preventDefault();
    this.isDragActive = false;
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    this.isDragActive = false;
    this.addFiles(Array.from(event.dataTransfer?.files ?? []));
  }

  onFileSelected(event: Event): void {
    const input = event.currentTarget as HTMLInputElement;
    this.addFiles(Array.from(input.files ?? []));
    input.value = "";
  }

  removeDocument(index: number): void {
    this.selectedDocuments = this.selectedDocuments.filter((_, documentIndex) => documentIndex !== index);
    this.cdr.markForCheck();
  }

  submit(): void {
    this.form.markAllAsTouched();

    if (!this.canSubmit) {
      return;
    }

    const programId = this.program?.id;
    if (!programId) {
      return;
    }

    const value = this.form.getRawValue();
    this.isSubmitting = true;
    this.programService
      .submitVerification(programId, {
        companyName: value.companyName.trim(),
        inn: value.inn.trim(),
        legalName: value.legalName.trim(),
        ogrn: value.ogrn.trim(),
        website: value.website.trim(),
        region: value.region.trim(),
        contactFullName: value.contactFullName.trim(),
        contactPosition: value.contactPosition.trim(),
        contactEmail: value.contactEmail.trim(),
        contactPhone: value.contactPhone.trim(),
        companyRoleDescription: value.companyRoleDescription.trim(),
        documents: this.uploadedDocumentUrls,
      })
      .pipe(
        tap(state => this.applyState(state, { resetDocuments: true })),
        catchError(error => {
          this.applyServerErrors(error?.error);
          const detail = error?.error?.detail || "Не удалось отправить заявку на верификацию";
          this.snackbar.error(this.formatApiError(error?.error) || detail);
          return throwError(() => error);
        }),
        finalize(() => {
          this.isSubmitting = false;
          this.cdr.markForCheck();
        }),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe({
        next: () => this.snackbar.success("Заявка отправлена на рассмотрение"),
        error: () => undefined,
      });
  }

  resetToLatestTextData(): void {
    this.prefillFromLatestRequest();
    this.selectedDocuments = [];
    this.form.controls.confirmed.setValue(false);
    this.cdr.markForCheck();
  }

  private loadState(): void {
    const programId = this.program?.id;
    if (!programId) {
      this.isLoading = false;
      return;
    }

    this.programService
      .getVerification(programId)
      .pipe(
        catchError(error => {
          this.snackbar.error("Не удалось загрузить данные верификации");
          return throwError(() => error);
        }),
        finalize(() => {
          this.isLoading = false;
          this.cdr.markForCheck();
        }),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe({
        next: state => this.applyState(state),
        error: () => undefined,
      });
  }

  private applyState(
    state: ProgramVerificationState,
    options: { resetDocuments?: boolean } = {}
  ): void {
    this.state = state;

    this.editState.updateProgram({
      verificationStatus: state.verificationStatus ?? state.currentStatus,
      isVerified: state.isVerified,
      verifiedCompanyName: state.verifiedCompanyName ?? "",
    });

    if (options.resetDocuments) {
      this.selectedDocuments = [];
    }

    if (this.canShowForm) {
      this.prefillFromLatestRequest();
    }

    this.cdr.markForCheck();
  }

  private prefillFromLatestRequest(): void {
    const request = this.latestRequest;
    if (!request) {
      return;
    }

    this.form.patchValue(
      {
        companyName: request.companyName ?? "",
        inn: request.inn ?? "",
        legalName: request.legalName ?? "",
        ogrn: request.ogrn ?? "",
        website: request.website ?? "",
        region: request.region ?? "",
        contactFullName: request.contactFullName ?? "",
        contactPosition: request.contactPosition ?? "",
        contactEmail: request.contactEmail ?? "",
        contactPhone: request.contactPhone ?? "",
        companyRoleDescription: request.companyRoleDescription ?? "",
        confirmed: false,
      },
      { emitEvent: false }
    );
  }

  private addFiles(files: File[]): void {
    if (!files.length || !this.canShowForm) {
      return;
    }

    const accepted: SelectedVerificationDocument[] = [];

    for (const file of files) {
      if (this.selectedDocuments.length + accepted.length >= MAX_FILES) {
        this.snackbar.error(`Можно загрузить не более ${MAX_FILES} файлов`);
        break;
      }

      const error = this.validateFile(file);
      if (error) {
        accepted.push({
          file,
          name: file.name,
          size: file.size,
          uploading: false,
          error,
        });
        continue;
      }

      accepted.push({
        file,
        name: file.name,
        size: file.size,
        uploading: true,
      });
    }

    this.selectedDocuments = [...this.selectedDocuments, ...accepted];
    this.uploadDocuments(accepted.filter(document => !document.error));
    this.cdr.markForCheck();
  }

  private uploadDocuments(documents: SelectedVerificationDocument[]): void {
    if (!documents.length) {
      return;
    }

    forkJoin(
      documents.map(document =>
        this.fileService.uploadFile(document.file, { preserveOriginal: true }).pipe(
          tap(response => {
            document.url = response.url;
            document.uploading = false;
          }),
          catchError(error => {
            document.uploading = false;
            document.error = "Не удалось загрузить файл";
            return of(error);
          })
        )
      )
    )
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.cdr.markForCheck());
  }

  private validateFile(file: File): string {
    const extension = (file.name.split(".").pop() || "").toLowerCase();
    const mimeAllowed = ALLOWED_MIME_TYPES.has(file.type);
    const extensionAllowed = ALLOWED_EXTENSIONS.has(extension);

    if (!mimeAllowed && !extensionAllowed) {
      return "Поддерживаются PDF, PNG, JPG и JPEG";
    }

    if (file.size > MAX_FILE_SIZE) {
      return "Файл больше 10 МБ";
    }

    return "";
  }

  private applyServerErrors(payload: unknown): void {
    if (!payload || typeof payload !== "object") {
      return;
    }

    const fieldMap: Record<string, keyof typeof this.form.controls> = {
      company_name: "companyName",
      inn: "inn",
      legal_name: "legalName",
      ogrn: "ogrn",
      website: "website",
      region: "region",
      contact_full_name: "contactFullName",
      contact_position: "contactPosition",
      contact_email: "contactEmail",
      contact_phone: "contactPhone",
      company_role_description: "companyRoleDescription",
    };

    for (const [apiField, controlName] of Object.entries(fieldMap)) {
      const message = this.apiFieldMessage(apiField, (payload as Record<string, unknown>)[apiField]);
      if (!message) {
        continue;
      }

      this.form.controls[controlName].setErrors({
        ...(this.form.controls[controlName].errors ?? {}),
        server: message,
      });
      this.form.controls[controlName].markAsTouched();
    }
  }

  private formatApiError(payload: unknown): string {
    if (!payload || typeof payload !== "object") {
      return "Не удалось отправить заявку на верификацию. Проверьте поля формы.";
    }

    const data = payload as Record<string, unknown>;
    if (typeof data["detail"] === "string") {
      return data["detail"];
    }

    const orderedFields = [
      "website",
      "inn",
      "documents",
      "company_name",
      "region",
      "contact_email",
      "contact_phone",
      "company_role_description",
    ];

    for (const field of orderedFields) {
      const message = this.apiFieldMessage(field, data[field]);
      if (message) {
        return message;
      }
    }

    for (const [field, value] of Object.entries(data)) {
      const message = this.apiFieldMessage(field, value);
      if (message) {
        return message;
      }
    }

    return "Не удалось отправить заявку на верификацию. Проверьте поля формы.";
  }

  private apiFieldMessage(field: string, value: unknown): string {
    const rawMessage = this.extractApiMessage(value);
    if (!rawMessage) {
      return "";
    }

    const normalized = rawMessage.toLowerCase();
    const fieldLabels: Record<string, string> = {
      company_name: "Название компании",
      inn: "ИНН компании",
      legal_name: "Юридическое наименование",
      ogrn: "ОГРН / ОГРНИП",
      website: "Сайт компании",
      region: "Город / регион",
      contact_full_name: "ФИО контактного лица",
      contact_position: "Должность",
      contact_email: "Email",
      contact_phone: "Телефон",
      company_role_description: "Роль компании",
      documents: "Документы",
    };

    if (field === "website" || normalized.includes("valid url")) {
      return "Сайт компании: введите корректную ссылку, например https://example.com.";
    }

    if (field === "inn" && normalized.includes("checksum")) {
      return "ИНН компании: некорректный ИНН, не прошла проверка контрольной суммы.";
    }

    if (field === "inn" && normalized.includes("10 or 12 digits")) {
      return "ИНН компании: укажите 10 или 12 цифр.";
    }

    if (field === "documents" && normalized.includes("at least one")) {
      return "Документы: загрузите минимум один файл.";
    }

    if (field === "documents" && normalized.includes("no more than")) {
      return "Документы: можно загрузить не более 5 файлов.";
    }

    if (field === "documents" && normalized.includes("10 mb")) {
      return "Документы: каждый файл должен быть не больше 10 МБ.";
    }

    if (field === "documents" && normalized.includes("allowed document formats")) {
      return "Документы: поддерживаются PDF, PNG, JPG и JPEG.";
    }

    const label = fieldLabels[field] ?? field;
    return `${label}: ${rawMessage}`;
  }

  private extractApiMessage(value: unknown): string {
    if (Array.isArray(value)) {
      return value.map(item => this.extractApiMessage(item)).filter(Boolean).join(" ");
    }

    if (value && typeof value === "object") {
      return Object.values(value as Record<string, unknown>)
        .map(item => this.extractApiMessage(item))
        .filter(Boolean)
        .join(" ");
    }

    return typeof value === "string" ? value : "";
  }
}
