/** @format */

import { Component, OnDestroy, OnInit } from "@angular/core";
import { HttpErrorResponse } from "@angular/common/http";
import { ActivatedRoute, Router } from "@angular/router";
import { map, Subscription } from "rxjs";
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from "@angular/forms";
import { LegalDocument, ProgramDataSchema } from "@office/program/models/program.model";
import { ControlErrorPipe, ValidationService } from "projects/core";
import { ProgramService } from "@office/program/services/program.service";
import { BarComponent, ButtonComponent, InputComponent } from "@ui/components";
import { KeyValuePipe } from "@angular/common";

/**
 * Компонент регистрации в программе
 *
 * Предоставляет форму для регистрации пользователя в программе.
 * Динамически генерирует поля формы на основе схемы данных программы.
 *
 * Принимает:
 * @param {Router} router - Для навигации после успешной регистрации
 * @param {ActivatedRoute} route - Для получения данных из резолвера
 * @param {FormBuilder} fb - Для создания реактивных форм
 * @param {ValidationService} validationService - Для валидации форм
 * @param {ProgramService} programService - Для отправки данных регистрации
 *
 * Данные из резолвера:
 * @property {ProgramDataSchema} schema - Схема дополнительных полей программы
 *
 * Форма:
 * @property {FormGroup} registerForm - Динамически генерируемая форма регистрации
 *
 * Жизненный цикл:
 * - OnInit: Получает схему из резолвера и создает форму с валидаторами
 * - OnDestroy: Отписывается от всех подписок
 *
 * Методы:
 * @method onSubmit() - Обработчик отправки формы
 *   - Валидирует форму
 *   - Отправляет данные через ProgramService
 *   - Перенаправляет на страницу программы при успехе
 *
 * Возвращает:
 * HTML шаблон с динамической формой регистрации
 */
@Component({
  selector: "app-register",
  templateUrl: "./register.component.html",
  styleUrl: "./register.component.scss",
  standalone: true,
  imports: [
    ReactiveFormsModule,
    InputComponent,
    ButtonComponent,
    KeyValuePipe,
    ControlErrorPipe,
    BarComponent,
  ],
})
export class ProgramRegisterComponent implements OnInit, OnDestroy {
  constructor(
    private readonly router: Router,
    private readonly route: ActivatedRoute,
    private readonly fb: FormBuilder,
    private readonly validationService: ValidationService,
    private readonly programService: ProgramService
  ) {}

  ngOnInit(): void {
    const route$ = this.route.data.pipe(map(r => r["data"])).subscribe(schema => {
      this.schema = schema;
      this.registrationSchema = this.filterRegistrationSchema(schema);

      const group: Record<string, any> = {};
      for (const cKey in this.registrationSchema) {
        group[cKey] = ["", [Validators.required]];
      }
      group[this.consentControlName] = [false, [Validators.requiredTrue]];

      this.registerForm = this.fb.group(group);
    });
    this.subscriptions$.push(route$);

    const legalDocuments$ = this.programService.getActiveLegalDocuments().subscribe({
      next: documents => {
        this.legalDocuments = documents;
      },
      error: () => {
        this.legalDocuments = [];
      },
    });
    this.subscriptions$.push(legalDocuments$);
  }

  ngOnDestroy(): void {
    this.subscriptions$.forEach($ => $.unsubscribe());
  }

  subscriptions$: Subscription[] = [];

  registerForm?: FormGroup;

  schema?: ProgramDataSchema;

  registrationSchema?: ProgramDataSchema;

  legalDocuments: LegalDocument[] = [];

  isSubmitting = false;

  serverError = "";

  readonly consentControlName = "personalDataConsent";

  readonly registrationConsentKeys = new Set([
    "personal_data_consent",
    "personalDataConsent",
    "legal_consent",
    "legalConsent",
    "participant_consent",
    "participantConsent",
  ]);

  legalDocument(type: LegalDocument["type"]): LegalDocument | null {
    return this.legalDocuments.find(document => document.type === type) ?? null;
  }

  legalDocumentHref(type: LegalDocument["type"]): string {
    return this.legalDocument(type)?.contentUrl ?? "";
  }

  legalDocumentTitle(type: LegalDocument["type"], fallback: string): string {
    const document = this.legalDocument(type);

    return document?.version ? `${document.title} (${document.version})` : document?.title ?? fallback;
  }

  onSubmit(): void {
    this.serverError = "";

    if (this.registerForm && !this.validationService.getFormValidation(this.registerForm)) {
      return;
    }
    if (!this.registerForm) {
      return;
    }

    const formValue = this.registerForm.getRawValue();
    const { [this.consentControlName]: personalDataConsent, ...registrationData } = formValue;
    if (personalDataConsent !== true) {
      this.registerForm.get(this.consentControlName)?.setErrors({ required: true });
      this.serverError = "Необходимо согласиться на обработку персональных данных.";
      return;
    }

    this.isSubmitting = true;

    this.programService
      .register(this.route.snapshot.params["programId"], {
        ...registrationData,
        personalDataConsent: true,
      })
      .subscribe({
        next: () => {
          this.router.navigateByUrl(`/office/program/${this.route.snapshot.params["programId"]}`);
        },
        error: (error: HttpErrorResponse) => {
          this.isSubmitting = false;
          this.serverError = this.getRegistrationError(error);
          this.registerForm?.get(this.consentControlName)?.setErrors({ server: true });
        },
      });
  }

  private filterRegistrationSchema(schema: ProgramDataSchema): ProgramDataSchema {
    const filteredSchema = new ProgramDataSchema();
    for (const key in schema) {
      if (!this.registrationConsentKeys.has(key)) {
        filteredSchema[key] = schema[key];
      }
    }

    return filteredSchema;
  }

  private getRegistrationError(error: HttpErrorResponse): string {
    const errorBody = error.error;
    if (errorBody?.personal_data_consent) {
      return String(errorBody.personal_data_consent);
    }
    if (errorBody?.personalDataConsent) {
      return String(errorBody.personalDataConsent);
    }
    if (errorBody?.detail) {
      return String(errorBody.detail);
    }

    return "Не удалось зарегистрироваться в чемпионате. Проверьте данные и попробуйте еще раз.";
  }
}
