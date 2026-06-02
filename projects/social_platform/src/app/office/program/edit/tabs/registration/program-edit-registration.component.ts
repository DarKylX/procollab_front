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
import { FormBuilder, ReactiveFormsModule, Validators } from "@angular/forms";
import { finalize, map, Observable, switchMap, tap, throwError } from "rxjs";
import { ProgramDraftPayload } from "@office/program/models/program-draft.model";
import {
  LegalDocument,
  Program,
  ProgramDataSchema,
  ProgramDataSchemaField,
  ProgramLegalSettings,
} from "@office/program/models/program.model";
import { ProgramInvite, ProgramService } from "@office/program/services/program.service";
import { ButtonComponent, IconComponent } from "@ui/components";
import { SnackbarService } from "@ui/services/snackbar.service";
import {
  ProgramEditStateService,
  ProgramEditTabController,
} from "../../services/program-edit-state.service";

type RegistrationType = "internal" | "external";
type RegistrationFieldType =
  | "text"
  | "email"
  | "phone"
  | "textarea"
  | "select"
  | "radio"
  | "checkbox"
  | "file";

interface RegistrationField {
  id: string;
  label: string;
  type: RegistrationFieldType;
  required: boolean;
  asFilter: boolean;
  hint: string;
  options: string[];
  system?: boolean;
}

interface RegistrationSnapshot {
  settings: {
    registrationType: RegistrationType;
    registrationLink: string;
    isPrivate: boolean;
  };
  fields: RegistrationField[];
  legal: {
    participationRulesLink: string;
    additionalTermsText: string;
  };
}

@Component({
  selector: "app-program-edit-registration",
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, ButtonComponent, IconComponent],
  templateUrl: "./program-edit-registration.component.html",
  styleUrl: "./program-edit-registration.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProgramEditRegistrationComponent implements OnInit, OnDestroy {
  private readonly fb = inject(FormBuilder);
  private readonly destroyRef = inject(DestroyRef);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly editState = inject(ProgramEditStateService);
  private readonly programService = inject(ProgramService);
  private readonly snackbar = inject(SnackbarService);
  private readonly tabKey = "registration";

  readonly settingsForm = this.fb.nonNullable.group(
    {
      registrationType: ["internal" as RegistrationType, [Validators.required]],
      registrationLink: [""],
      isPrivate: [false],
    }
  );

  readonly fieldForm = this.fb.nonNullable.group({
    label: ["", [Validators.required, Validators.maxLength(80)]],
    type: ["text" as RegistrationFieldType, [Validators.required]],
    hint: ["", [Validators.maxLength(140)]],
    required: [false],
    asFilter: [false],
    optionsText: [""],
  });

  readonly legalForm = this.fb.nonNullable.group({
    participationRulesLink: [""],
    additionalTermsText: [""],
  });

  readonly inviteForm = this.fb.nonNullable.group({
    email: ["", [Validators.required, Validators.email]],
    customMessage: ["", [Validators.maxLength(2000)]],
  });

  readonly fieldTypes: Array<{ value: RegistrationFieldType; label: string }> = [
    { value: "text", label: "Текст" },
    { value: "email", label: "Email" },
    { value: "phone", label: "Телефон" },
    { value: "textarea", label: "Большой текст" },
    { value: "select", label: "Выпадающий список" },
    { value: "radio", label: "Один вариант" },
    { value: "checkbox", label: "Чекбокс" },
    { value: "file", label: "Файл" },
  ];

  readonly controller: ProgramEditTabController = {
    tabKey: this.tabKey,
    save: () => this.save(),
    reset: () => this.reset(),
  };

  fields: RegistrationField[] = [];
  editorOpen = false;
  editingFieldId: string | null = null;
  fieldFormSubmitted = false;
  invites: ProgramInvite[] = [];
  invitesLoading = false;
  inviteSubmitting = false;
  inviteError = "";

  private initialSnapshot = "";
  private fieldSeed = 0;
  private invitesLoadedForProgramId: number | null = null;

  ngOnInit(): void {
    const snapshot =
      this.editState.getTabDraft<RegistrationSnapshot>(this.tabKey) ??
      this.createSnapshotFromProgram(this.program);
    const savedSnapshot = this.createSnapshotFromProgram(this.editState.savedProgram());
    this.applySnapshot(snapshot);
    this.initialSnapshot = this.serializeSnapshot(savedSnapshot);
    this.applyReadonly();

    this.editState.registerController(this.controller);
    this.syncState();

    this.settingsForm.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      this.syncState();
      this.ensureInvitesLoaded();
      this.cdr.markForCheck();
    });

    this.settingsForm.statusChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      this.syncState();
      this.cdr.markForCheck();
    });

    this.legalForm.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      this.syncState();
      this.cdr.markForCheck();
    });

    this.legalForm.statusChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      this.syncState();
      this.cdr.markForCheck();
    });

    this.fieldForm.controls.type.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(type => {
        if (!this.fieldTypeNeedsOptions(type)) {
          this.fieldForm.controls.optionsText.setValue("", { emitEvent: false });
        }

        this.cdr.markForCheck();
      });
  }

  ngOnDestroy(): void {
    this.editState.unregisterController(this.controller);
  }

  get program(): Program | null {
    return this.editState.program();
  }

  get isReadonly(): boolean {
    return this.computeReadonly();
  }

  get isInternal(): boolean {
    return this.settingsForm.controls.registrationType.value === "internal";
  }

  get isEditingField(): boolean {
    return Boolean(this.editingFieldId);
  }

  get fieldEditorTitle(): string {
    return this.isEditingField ? "Редактирование поля" : "Новое поле";
  }

  get fieldEditorActionText(): string {
    return this.isEditingField ? "Сохранить поле" : "Добавить поле";
  }

  get optionErrorVisible(): boolean {
    return this.fieldFormSubmitted && this.hasOptionsError();
  }

  get fieldPrivacyWarning(): string {
    const value = this.fieldForm.getRawValue();

    return this.getFieldPrivacyWarning({
      id: this.editingFieldId ?? "new-field",
      label: value.label,
      type: value.type,
      required: value.required,
      asFilter: value.asFilter,
      hint: value.hint,
      options: this.parseOptions(value.optionsText),
    });
  }

  get currentLegalSettings(): ProgramLegalSettings | null {
    return this.program?.legalSettings ?? null;
  }

  get organizerTermsAccepted(): boolean {
    return Boolean(this.currentLegalSettings?.organizerTermsAcceptedAt);
  }

  get canManageInvites(): boolean {
    const status = this.program?.status;

    return Boolean(
      this.program?.id &&
        status !== "pending_moderation" &&
        status !== "frozen" &&
        status !== "archived"
    );
  }

  getFieldPrivacyWarning(field: RegistrationField): string {
    if (field.system) {
      return "";
    }

    const normalized = `${field.id} ${field.label} ${field.hint}`
      .toLowerCase()
      .replace(/ё/g, "е")
      .replace(/\s+/g, " ");
    const forbiddenTerms = [
      "паспорт",
      "серия паспорта",
      "номер паспорта",
      "снилс",
      "инн физлица",
      "адрес проживания",
      "здоровье",
      "диагноз",
      "религия",
      "политические взгляды",
      "банковская карта",
      "номер карты",
      "cvv",
    ];

    return forbiddenTerms.some(term => normalized.includes(term))
      ? "Поле может содержать избыточные или чувствительные персональные данные. Удалите его или обратитесь к администратору платформы."
      : "";
  }

  legalDocument(type: LegalDocument["type"]): LegalDocument | null {
    return this.program?.legalDocuments?.find(document => document.type === type) ?? null;
  }

  legalDocumentHref(type: LegalDocument["type"]): string {
    return this.legalDocument(type)?.contentUrl ?? "";
  }

  legalDocumentTitle(type: LegalDocument["type"], fallback: string): string {
    const document = this.legalDocument(type);

    return document?.version ? `${document.title} (${document.version})` : document?.title ?? fallback;
  }

  acceptOrganizerTerms(): void {
    const programId = this.program?.id;
    if (!programId || this.isReadonly) {
      return;
    }

    this.programService.acceptOrganizerTerms(programId).subscribe(settings => {
      this.editState.updateProgram({ legalSettings: settings });
      this.cdr.markForCheck();
    });
  }

  loadInvites(force = false): void {
    const programId = this.program?.id;
    if (!programId || !this.settingsForm.controls.isPrivate.value) {
      return;
    }

    if (!force && this.invitesLoadedForProgramId === programId) {
      return;
    }

    this.invitesLoading = true;
    this.inviteError = "";
    this.programService
      .getInvites(programId)
      .pipe(
        finalize(() => {
          this.invitesLoading = false;
          this.cdr.markForCheck();
        })
      )
      .subscribe({
        next: invites => {
          this.invites = invites;
          this.invitesLoadedForProgramId = programId;
        },
        error: () => {
          this.inviteError = "Не удалось загрузить приглашения";
        },
      });
  }

  createInvite(): void {
    const programId = this.program?.id;
    if (!programId || !this.canManageInvites || this.inviteForm.invalid) {
      this.inviteForm.markAllAsTouched();
      this.cdr.markForCheck();
      return;
    }

    const value = this.inviteForm.getRawValue();
    this.inviteSubmitting = true;
    this.inviteError = "";
    this.programService
      .createInvites(programId, {
        emails: [value.email.trim()],
        customMessage: value.customMessage.trim() || undefined,
      })
      .pipe(
        finalize(() => {
          this.inviteSubmitting = false;
          this.cdr.markForCheck();
        })
      )
      .subscribe({
        next: invites => {
          this.upsertInvites(invites);
          this.inviteForm.reset({ email: "", customMessage: "" });
          this.snackbar.success("Приглашение создано");
        },
        error: error => {
          this.inviteError = this.formatInviteError(error, "Не удалось создать приглашение");
        },
      });
  }

  copyInvite(invite: ProgramInvite): void {
    const value = invite.acceptUrl || String(invite.token);
    if (!navigator.clipboard) {
      return;
    }

    navigator.clipboard.writeText(value).then(() => {
      this.snackbar.success("Ссылка приглашения скопирована");
    });
  }

  resendInvite(invite: ProgramInvite): void {
    const programId = this.program?.id;
    if (!programId || !this.canManageInvites) {
      return;
    }

    this.inviteError = "";
    this.programService.resendInvite(programId, invite.id).subscribe({
      next: updated => {
        this.upsertInvites([updated]);
        this.snackbar.success("Приглашение отправлено повторно");
      },
      error: error => {
        this.inviteError = this.formatInviteError(error, "Не удалось отправить приглашение");
      },
    });
  }

  revokeInvite(invite: ProgramInvite): void {
    const programId = this.program?.id;
    if (!programId || !this.canManageInvites) {
      return;
    }

    this.inviteError = "";
    this.programService.revokeInvite(programId, invite.id).subscribe({
      next: updated => {
        this.upsertInvites([updated]);
        this.snackbar.success("Приглашение отозвано");
      },
      error: error => {
        this.inviteError = this.formatInviteError(error, "Не удалось отозвать приглашение");
      },
    });
  }

  inviteStatusLabel(status: ProgramInvite["status"]): string {
    const labels: Record<ProgramInvite["status"], string> = {
      pending: "Ожидает",
      used: "Принято",
      expired: "Истекло",
      revoked: "Отозвано",
    };

    return labels[status] ?? status;
  }

  selectRegistrationType(type: RegistrationType): void {
    if (this.isReadonly || type !== "internal") {
      return;
    }

    this.settingsForm.patchValue(
      {
        registrationType: "internal",
        registrationLink: "",
      },
      { emitEvent: true }
    );
  }

  hasExternalLinkError(): boolean {
    return false;
  }

  fieldTypeLabel(type: RegistrationFieldType): string {
    return this.fieldTypes.find(fieldType => fieldType.value === type)?.label ?? type;
  }

  openCreateField(): void {
    if (this.isReadonly) {
      return;
    }

    this.editorOpen = true;
    this.editingFieldId = null;
    this.fieldFormSubmitted = false;
    this.fieldForm.reset({
      label: "",
      type: "text",
      hint: "",
      required: false,
      asFilter: false,
      optionsText: "",
    });
    this.cdr.markForCheck();
  }

  openEditField(field: RegistrationField): void {
    if (this.isReadonly || field.system) {
      return;
    }

    this.editorOpen = true;
    this.editingFieldId = field.id;
    this.fieldFormSubmitted = false;
    this.fieldForm.reset({
      label: field.label,
      type: field.type,
      hint: field.hint,
      required: field.required,
      asFilter: field.asFilter,
      optionsText: field.options.join(", "),
    });
    this.cdr.markForCheck();
  }

  cancelFieldEditor(): void {
    this.editorOpen = false;
    this.editingFieldId = null;
    this.fieldFormSubmitted = false;
    this.fieldForm.reset({
      label: "",
      type: "text",
      hint: "",
      required: false,
      asFilter: false,
      optionsText: "",
    });
    this.cdr.markForCheck();
  }

  saveFieldEditor(): void {
    this.fieldFormSubmitted = true;

    if (this.fieldForm.invalid || this.hasOptionsError() || this.isReadonly) {
      this.fieldForm.markAllAsTouched();
      this.cdr.markForCheck();
      return;
    }

    const value = this.fieldForm.getRawValue();
    const field: RegistrationField = {
      id: this.editingFieldId ?? this.createFieldId(value.label),
      label: value.label.trim(),
      type: value.type,
      required: value.required,
      asFilter: value.asFilter,
      hint: value.hint.trim(),
      options: this.fieldTypeNeedsOptions(value.type)
        ? this.parseOptions(value.optionsText)
        : [],
    };

    if (this.editingFieldId) {
      this.fields = this.fields.map(item => (item.id === this.editingFieldId ? field : item));
    } else {
      this.fields = [...this.fields, field];
    }

    this.cancelFieldEditor();
    this.syncState();
    this.cdr.markForCheck();
  }

  toggleFieldRequired(field: RegistrationField): void {
    if (this.isReadonly || field.system) {
      return;
    }

    this.fields = this.fields.map(item =>
      item.id === field.id ? { ...item, required: !item.required } : item
    );
    this.syncState();
  }

  toggleFieldFilter(field: RegistrationField): void {
    if (this.isReadonly || field.system) {
      return;
    }

    this.fields = this.fields.map(item =>
      item.id === field.id ? { ...item, asFilter: !item.asFilter } : item
    );
    this.syncState();
  }

  moveField(index: number, direction: -1 | 1): void {
    if (!this.canMoveField(index, direction)) {
      return;
    }

    const fields = [...this.fields];
    const targetIndex = index + direction;
    const field = fields[index];
    fields[index] = fields[targetIndex];
    fields[targetIndex] = field;
    this.fields = fields;
    this.syncState();
    this.cdr.markForCheck();
  }

  canMoveField(index: number, direction: -1 | 1): boolean {
    const field = this.fields[index];
    const targetIndex = index + direction;
    const firstAdditionalIndex = this.fields.findIndex(item => !item.system);

    return Boolean(
      !this.isReadonly &&
        field &&
        !field.system &&
        targetIndex >= firstAdditionalIndex &&
        targetIndex >= 0 &&
        targetIndex < this.fields.length
    );
  }

  removeField(field: RegistrationField): void {
    if (this.isReadonly || field.system) {
      return;
    }

    this.fields = this.fields.filter(item => item.id !== field.id);

    if (this.editingFieldId === field.id) {
      this.cancelFieldEditor();
    }

    this.syncState();
    this.cdr.markForCheck();
  }

  fieldTypeNeedsOptions(type = this.fieldForm.controls.type.value): boolean {
    return type === "select" || type === "radio";
  }

  private save(): Observable<Program> {
    this.settingsForm.markAllAsTouched();
    this.legalForm.markAllAsTouched();
    this.syncState();

    const programId = this.program?.id;
    if (!programId || this.settingsForm.invalid || this.legalForm.invalid || this.isReadonly) {
      return throwError(() => new Error("Invalid registration form"));
    }

    const snapshot = this.createCurrentSnapshot();
    const payload: ProgramDraftPayload = {
      registrationType: "internal",
      registrationLink: null,
      isPrivate: snapshot.settings.isPrivate,
      dataSchema: this.createDataSchema(snapshot.fields),
    };
    const legalPayload: Partial<ProgramLegalSettings> = {
      participationRulesLink: snapshot.legal.participationRulesLink || "",
      additionalTermsText: snapshot.legal.additionalTermsText || "",
    };

    return this.programService.update(programId, payload).pipe(
      switchMap(program =>
        this.programService.updateLegalSettings(programId, legalPayload).pipe(
          map(legalSettings => ({
            program,
            legalSettings,
          }))
        )
      ),
      tap(({ program, legalSettings }) => {
        const savedSnapshot: RegistrationSnapshot = {
          ...snapshot,
          settings: {
            ...snapshot.settings,
            registrationType: "internal",
            registrationLink: "",
          },
        };

        this.applySnapshot(savedSnapshot);
        this.initialSnapshot = this.serializeSnapshot(savedSnapshot);
        const mergedProgram = this.mergeSavedProgramAfterRegistrationSave(
          program,
          legalSettings,
          payload,
          savedSnapshot
        );
        this.editState.updateFormState(
          false,
          this.settingsForm.valid && this.legalForm.valid,
          this.isReadonly
        );
        this.editState.updateProgram(mergedProgram);
      }),
      map(({ program, legalSettings }) =>
        this.mergeSavedProgramAfterRegistrationSave(program, legalSettings, payload, {
          ...snapshot,
          settings: {
            ...snapshot.settings,
            registrationType: "internal",
            registrationLink: "",
          },
        })
      )
    );
  }

  private mergeSavedProgramAfterRegistrationSave(
    program: Program,
    legalSettings: ProgramLegalSettings,
    payload: ProgramDraftPayload,
    savedSnapshot: RegistrationSnapshot
  ): Program {
    const currentProgram = this.editState.savedProgram() ?? this.program ?? Program.default();

    return {
      ...currentProgram,
      ...program,
      registrationType: savedSnapshot.settings.registrationType,
      registrationLink: payload.registrationLink,
      isPrivate: savedSnapshot.settings.isPrivate,
      dataSchema: payload.dataSchema,
      legalDocuments:
        program.legalDocuments ?? currentProgram.legalDocuments ?? this.program?.legalDocuments ?? [],
      legalSettings,
    } as Program;
  }

  private reset(): void {
    this.applySnapshot(this.createSnapshotFromProgram(this.editState.savedProgram()));
    this.cancelFieldEditor();
    this.syncState();
  }

  private applySnapshot(snapshot: RegistrationSnapshot): void {
    const legal = snapshot.legal ?? {
      participationRulesLink: "",
      additionalTermsText: "",
    };

    this.settingsForm.patchValue(snapshot.settings, { emitEvent: false });
    this.legalForm.patchValue(legal, { emitEvent: false });
    this.settingsForm.markAsPristine();
    this.legalForm.markAsPristine();
    this.fields = this.cloneFields(snapshot.fields);
    this.ensureInvitesLoaded();
  }

  private createSnapshotFromProgram(program: Program | null): RegistrationSnapshot {
    const schemaFields = this.createFieldsFromDataSchema(program?.dataSchema);

    return {
      settings: {
        registrationType: "internal",
        registrationLink: "",
        isPrivate: Boolean(program?.isPrivate),
      },
      fields: schemaFields.length
        ? [...this.createSystemFields(), ...schemaFields]
        : this.createDefaultFields(),
      legal: {
        participationRulesLink: program?.legalSettings?.participationRulesLink ?? "",
        additionalTermsText: program?.legalSettings?.additionalTermsText ?? "",
      },
    };
  }

  private createCurrentSnapshot(): RegistrationSnapshot {
    const value = this.settingsForm.getRawValue();
    const legal = this.legalForm.getRawValue();

    return {
      settings: {
        registrationType: "internal",
        registrationLink: "",
        isPrivate: value.isPrivate,
      },
      fields: this.cloneFields(this.fields),
      legal: {
        participationRulesLink: legal.participationRulesLink.trim(),
        additionalTermsText: legal.additionalTermsText.trim(),
      },
    };
  }

  private serializeSnapshot(snapshot: RegistrationSnapshot): string {
    return JSON.stringify({
      settings: snapshot.settings,
      legal: snapshot.legal,
      fields: snapshot.fields.map(field => ({
        id: field.id,
        label: field.label,
        type: field.type,
        required: field.required,
        asFilter: field.asFilter,
        hint: field.hint,
        options: field.options,
        system: Boolean(field.system),
      })),
    });
  }

  private cloneFields(fields: RegistrationField[]): RegistrationField[] {
    return fields.map(field => ({
      ...field,
      options: [...field.options],
    }));
  }

  private createDataSchema(fields: RegistrationField[]): ProgramDataSchema {
    return fields
      .filter(field => !field.system)
      .reduce<ProgramDataSchema>((schema, field, index) => {
        schema[field.id] = {
          type: field.type,
          name: field.label,
          label: field.label,
          placeholder: field.hint,
          required: field.required,
          isRequired: field.required,
          helpText: field.hint,
          hint: field.hint,
          description: field.hint,
          options: field.options,
          order: index,
          asFilter: field.asFilter,
          showFilter: field.asFilter,
        };

        return schema;
      }, {});
  }

  private createFieldsFromDataSchema(dataSchema?: ProgramDataSchema): RegistrationField[] {
    if (!dataSchema) {
      return [];
    }

    return Object.entries(dataSchema)
      .map(([id, field], index) => ({ id, field, index }))
      .filter(({ field }) => this.isPersistedField(field))
      .sort((a, b) => (a.field.order ?? a.index) - (b.field.order ?? b.index))
      .map(({ id, field }) => ({
        id,
        label: field.label || field.name || id,
        type: this.normalizePersistedFieldType(field.type),
        required: Boolean(field.isRequired ?? field.is_required ?? field.required),
        asFilter: Boolean(field.asFilter ?? field.showFilter ?? field.show_filter),
        hint: field.hint || field.helpText || field.help_text || field.placeholder || "",
        options: Array.isArray(field.options) ? field.options : [],
      }))
      .filter(field => !this.isOrganizerControlledConsentField(field));
  }

  private isPersistedField(field: ProgramDataSchemaField): boolean {
    return Boolean(field.label || field.name);
  }

  private normalizePersistedFieldType(type: ProgramDataSchemaField["type"]): RegistrationFieldType {
    const allowedTypes = this.fieldTypes.map(item => item.value);

    return type && allowedTypes.includes(type) ? type : "text";
  }

  private isOrganizerControlledConsentField(field: RegistrationField): boolean {
    const value = `${field.id} ${field.label} ${field.hint}`.toLowerCase();

    return (
      field.id === "field-consent" ||
      value.includes("consent") ||
      value.includes("personaldata") ||
      value.includes("personal-data") ||
      value.includes("соглас") ||
      value.includes("персональн")
    );
  }

  private createSystemFields(): RegistrationField[] {
    return [
      {
        id: "system-name",
        label: "ФИО",
        type: "text",
        required: true,
        asFilter: false,
        hint: "Фамилия, имя и отчество участника",
        options: [],
        system: true,
      },
      {
        id: "system-email",
        label: "Email",
        type: "email",
        required: true,
        asFilter: false,
        hint: "Адрес для уведомлений",
        options: [],
        system: true,
      },
      {
        id: "system-phone",
        label: "Телефон",
        type: "phone",
        required: true,
        asFilter: false,
        hint: "Контактный номер участника",
        options: [],
        system: true,
      },
    ];
  }

  private createDefaultFields(): RegistrationField[] {
    const fields: RegistrationField[] = [
      ...this.createSystemFields(),
      {
        id: "field-organization",
        label: "Вуз / организация",
        type: "text",
        required: false,
        asFilter: true,
        hint: "Например: название университета или компании",
        options: [],
      },
      {
        id: "field-course",
        label: "Курс обучения",
        type: "select",
        required: true,
        asFilter: true,
        hint: "Выберите уровень или курс",
        options: ["Бакалавриат", "Магистратура", "Аспирантура"],
      },
      {
        id: "field-direction",
        label: "Направление подготовки",
        type: "text",
        required: false,
        asFilter: true,
        hint: "Специальность или профиль",
        options: [],
      },
      {
        id: "field-motivation",
        label: "Почему хотите участвовать?",
        type: "textarea",
        required: false,
        asFilter: false,
        hint: "Коротко о мотивации участника",
        options: [],
      },
      {
        id: "field-consent",
        label: "Согласие на обработку данных",
        type: "checkbox",
        required: true,
        asFilter: false,
        hint: "Подтверждение согласия",
        options: [],
      },
    ];

    return fields.filter(field => field.id !== "field-consent");
  }

  private hasOptionsError(): boolean {
    const value = this.fieldForm.getRawValue();

    return this.fieldTypeNeedsOptions(value.type) && this.parseOptions(value.optionsText).length < 2;
  }

  private parseOptions(value: string): string[] {
    return value
      .split(/[\n,]/)
      .map(option => option.trim())
      .filter(Boolean);
  }

  private createFieldId(label: string): string {
    this.fieldSeed += 1;

    return `field-${label
      .trim()
      .toLowerCase()
      .replace(/[^a-zа-я0-9]+/gi, "-")
      .replace(/^-|-$/g, "")}-${Date.now()}-${this.fieldSeed}`;
  }

  private applyReadonly(): void {
    if (this.isReadonly) {
      this.settingsForm.disable({ emitEvent: false });
      this.fieldForm.disable({ emitEvent: false });
      this.legalForm.disable({ emitEvent: false });
      return;
    }

    this.settingsForm.enable({ emitEvent: false });
    this.fieldForm.enable({ emitEvent: false });
    this.legalForm.enable({ emitEvent: false });
  }

  private computeReadonly(): boolean {
    const program = this.program;
    const status = program?.status;
    const hasParticipants = Boolean(
      (program?.participantsCount ?? program?.participants?.length ?? 0) > 0
    );

    return (
      status === "pending_moderation" ||
      status === "frozen" ||
      status === "archived" ||
      (status === "published" && hasParticipants)
    );
  }

  private syncState(): void {
    const snapshot = this.createCurrentSnapshot();
    const dirty = this.serializeSnapshot(snapshot) !== this.initialSnapshot;

    this.editState.updateFormState(dirty, this.settingsForm.valid && this.legalForm.valid, this.isReadonly, {
      tabKey: this.tabKey,
      draft: snapshot,
      programPatch: {
        registrationType: "internal",
        registrationLink: null,
        isPrivate: snapshot.settings.isPrivate,
        dataSchema: this.createDataSchema(snapshot.fields),
        legalSettings: {
          ...(this.program?.legalSettings ?? {}),
          participationRulesLink: snapshot.legal.participationRulesLink,
          additionalTermsText: snapshot.legal.additionalTermsText,
        },
      },
    });
  }

  private ensureInvitesLoaded(): void {
    if (this.settingsForm.controls.isPrivate.value) {
      this.loadInvites();
    }
  }

  private upsertInvites(invites: ProgramInvite[]): void {
    const byId = new Map(this.invites.map(invite => [invite.id, invite]));
    invites.forEach(invite => byId.set(invite.id, invite));
    this.invites = Array.from(byId.values()).sort((a, b) => {
      return Date.parse(b.datetimeCreated || "") - Date.parse(a.datetimeCreated || "");
    });
  }

  private formatInviteError(error: unknown, fallback: string): string {
    const detail = (error as { error?: { detail?: unknown } })?.error?.detail;
    if (typeof detail === "string") {
      return detail;
    }

    return fallback;
  }
}
