/** @format */

import { CommonModule } from "@angular/common";
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  Input,
  OnChanges,
  OnDestroy,
  SimpleChanges,
} from "@angular/core";
import { FormBuilder, ReactiveFormsModule, Validators } from "@angular/forms";
import { catchError, finalize, forkJoin, of, Subscription, tap } from "rxjs";
import { FileService } from "@core/services/file.service";
import { Program } from "@office/program/models/program.model";
import {
  ProgramVerificationRequest,
  ProgramVerificationState,
  VerificationDocument,
  VerificationStatus,
} from "@office/program/models/program-verification.model";
import { ProgramService } from "@office/program/services/program.service";
import { SnackbarService } from "@ui/services/snackbar.service";

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
  selector: "app-program-verification-panel",
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: "./program-verification-panel.component.html",
  styleUrl: "./program-verification-panel.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProgramVerificationPanelComponent implements OnChanges, OnDestroy {
  @Input() program?: Program;

  readonly maxFiles = MAX_FILES;
  readonly maxFileSizeMb = 10;

  readonly form = this.fb.nonNullable.group({
    companyName: ["", [Validators.required, Validators.maxLength(255)]],
    inn: ["", [Validators.required, Validators.pattern(/^\d{10}(\d{2})?$/)]],
    legalName: ["", [Validators.maxLength(255)]],
    ogrn: ["", [Validators.maxLength(32)]],
    website: ["", [Validators.maxLength(255), Validators.pattern(WEBSITE_URL_PATTERN)]],
    region: ["", [Validators.maxLength(255)]],
    contactFullName: ["", [Validators.required, Validators.maxLength(255)]],
    contactPosition: ["", [Validators.required, Validators.maxLength(255)]],
    contactEmail: ["", [Validators.required, Validators.email]],
    contactPhone: ["", [Validators.required, Validators.maxLength(64)]],
    companyRoleDescription: ["", [Validators.required, Validators.maxLength(1000)]],
    confirmed: [false, [Validators.requiredTrue]],
  });

  state: ProgramVerificationState | null = null;
  selectedDocuments: SelectedVerificationDocument[] = [];
  isLoading = false;
  isSubmitting = false;
  isDragActive = false;
  errorMessage = "";

  private readonly subscriptions = new Subscription();

  constructor(
    private readonly fb: FormBuilder,
    private readonly programService: ProgramService,
    private readonly fileService: FileService,
    private readonly snackbar: SnackbarService,
    private readonly cdr: ChangeDetectorRef
  ) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (changes["program"] && this.program?.id) {
      this.loadState();
    }
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
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

  get uploadedDocumentUrls(): string[] {
    return this.selectedDocuments
      .map(document => document.url)
      .filter((url): url is string => Boolean(url));
  }

  get hasUploadingDocuments(): boolean {
    return this.selectedDocuments.some(document => document.uploading);
  }

  get hasDocumentErrors(): boolean {
    return this.selectedDocuments.some(document => Boolean(document.error));
  }

  get canSubmit(): boolean {
    return Boolean(
      this.canShowForm &&
        this.form.valid &&
        this.uploadedDocumentUrls.length > 0 &&
        !this.hasUploadingDocuments &&
        !this.hasDocumentErrors &&
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
      approved: "Подтверждена",
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
        return "Введите ссылку в формате https://example.com";
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

    if (!this.canSubmit || !this.program?.id) {
      return;
    }

    const value = this.form.getRawValue();
    this.isSubmitting = true;
    const submitSubscription = this.programService
      .submitVerification(this.program.id, {
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
          this.snackbar.error(this.formatApiError(error?.error));
          return of(null);
        }),
        finalize(() => {
          this.isSubmitting = false;
          this.cdr.markForCheck();
        })
      )
      .subscribe(state => {
        if (state) {
          this.snackbar.success("Заявка отправлена на рассмотрение");
        }
      });

    this.subscriptions.add(submitSubscription);
  }

  resetToLatestTextData(): void {
    this.prefillFromLatestRequest();
    this.selectedDocuments = [];
    this.form.controls.confirmed.setValue(false);
    this.cdr.markForCheck();
  }

  private loadState(): void {
    if (!this.program?.id) {
      return;
    }

    this.isLoading = true;
    this.errorMessage = "";

    const stateSubscription = this.programService
      .getVerification(this.program.id)
      .pipe(
        catchError(error => {
          this.errorMessage =
            error?.error?.detail || "Не удалось загрузить данные верификации компании.";
          return of(null);
        }),
        finalize(() => {
          this.isLoading = false;
          this.cdr.markForCheck();
        })
      )
      .subscribe(state => {
        if (state) {
          this.applyState(state);
        }
      });

    this.subscriptions.add(stateSubscription);
  }

  private applyState(
    state: ProgramVerificationState,
    options: { resetDocuments?: boolean } = {}
  ): void {
    this.state = state;

    if (this.program) {
      this.program = {
        ...this.program,
        verificationStatus: state.verificationStatus ?? state.currentStatus ?? "not_requested",
        isVerified: state.isVerified,
        verifiedCompanyName: state.verifiedCompanyName ?? "",
      };
    }

    if (options.resetDocuments) {
      this.selectedDocuments = [];
      this.form.controls.confirmed.setValue(false);
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
      accepted.push({
        file,
        name: file.name,
        size: file.size,
        uploading: !error,
        error,
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

    const uploadSubscription = forkJoin(
      documents.map(document =>
        this.fileService.uploadFile(document.file).pipe(
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
    ).subscribe(() => this.cdr.markForCheck());

    this.subscriptions.add(uploadSubscription);
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
      companyName: "companyName",
      inn: "inn",
      legal_name: "legalName",
      legalName: "legalName",
      ogrn: "ogrn",
      website: "website",
      region: "region",
      contact_full_name: "contactFullName",
      contactFullName: "contactFullName",
      contact_position: "contactPosition",
      contactPosition: "contactPosition",
      contact_email: "contactEmail",
      contactEmail: "contactEmail",
      contact_phone: "contactPhone",
      contactPhone: "contactPhone",
      company_role_description: "companyRoleDescription",
      companyRoleDescription: "companyRoleDescription",
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
      "company",
      "company_name",
      "companyName",
      "contact_email",
      "contactEmail",
      "company_role_description",
      "companyRoleDescription",
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
      company: "Компания",
      company_name: "Название компании",
      companyName: "Название компании",
      inn: "ИНН компании",
      legal_name: "Юридическое наименование",
      legalName: "Юридическое наименование",
      ogrn: "ОГРН / ОГРНИП",
      website: "Сайт компании",
      region: "Город / регион",
      contact_full_name: "ФИО контактного лица",
      contactFullName: "ФИО контактного лица",
      contact_position: "Должность",
      contactPosition: "Должность",
      contact_email: "Email",
      contactEmail: "Email",
      contact_phone: "Телефон",
      contactPhone: "Телефон",
      company_role_description: "Роль компании",
      companyRoleDescription: "Роль компании",
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
