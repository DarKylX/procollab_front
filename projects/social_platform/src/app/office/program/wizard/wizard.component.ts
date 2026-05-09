/** @format */

import { CommonModule } from "@angular/common";
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  DestroyRef,
  HostListener,
  inject,
  OnDestroy,
  OnInit,
} from "@angular/core";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { NavigationEnd, Router, RouterOutlet } from "@angular/router";
import { ModalComponent } from "@ui/components/modal/modal.component";
import { IconComponent } from "@ui/components";
import { SnackbarService } from "@ui/services/snackbar.service";
import {
  catchError,
  debounceTime,
  EMPTY,
  exhaustMap,
  filter,
  finalize,
  interval,
  Observable,
  tap,
  throwError,
} from "rxjs";
import { Program } from "../models/program.model";
import { ProgramDraftPayload } from "../models/program-draft.model";
import { ProgramService } from "../services/program.service";
import { WizardProgressComponent } from "./components/wizard-progress/wizard-progress.component";
import {
  AutosaveStatus,
  WizardState,
  WizardStateService,
  WizardStep,
} from "./services/wizard-state.service";

type ChecklistStatus = "done" | "partial" | "empty";

interface CreatedChecklistItem {
  label: string;
  status: ChecklistStatus;
}

@Component({
  selector: "app-program-wizard",
  standalone: true,
  imports: [CommonModule, RouterOutlet, ModalComponent, IconComponent, WizardProgressComponent],
  providers: [WizardStateService],
  templateUrl: "./wizard.component.html",
  styleUrl: "./wizard.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WizardComponent implements OnInit, OnDestroy {
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly destroyRef = inject(DestroyRef);
  private readonly programService = inject(ProgramService);
  private readonly router = inject(Router);
  private readonly snackbar = inject(SnackbarService);
  readonly wizardState = inject(WizardStateService);

  readonly createdChecklist: CreatedChecklistItem[] = [
    { label: "Основная информация", status: "done" },
    { label: "Регистрация", status: "done" },
    { label: "Сроки и формат", status: "done" },
    { label: "Материалы", status: "empty" },
    { label: "Критерии и эксперты", status: "empty" },
    { label: "Обложка и визуальные материалы", status: "empty" },
  ];

  state: WizardState = this.wizardState.snapshot;
  validity = this.wizardState.validitySnapshot;
  saveStatus: AutosaveStatus = "idle";
  lastSavedAt: Date | null = null;
  createdProgram: Program | null = null;
  createdPopupOpen = false;
  moderationError = "";
  moderationSubmitting = false;

  ngOnInit(): void {
    this.wizardState
      .getState()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(state => {
        this.state = state;
        this.cdr.markForCheck();
      });

    this.wizardState
      .getValidity()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(validity => {
        this.validity = validity;
        this.cdr.markForCheck();
      });

    this.router.events
      .pipe(
        filter((event): event is NavigationEnd => event instanceof NavigationEnd),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe(event => this.syncStepFromUrl(event.urlAfterRedirects));

    interval(30_000)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        if (this.lastSavedAt) {
          this.cdr.markForCheck();
        }
      });

    this.syncStepFromUrl(this.router.url);
    this.setupAutosave();
  }

  ngOnDestroy(): void {
    this.wizardState.reset();
  }

  @HostListener("window:beforeunload", ["$event"])
  beforeUnload(event: BeforeUnloadEvent): void {
    if (this.wizardState.snapshot.isDirty) {
      event.preventDefault();
      event.returnValue = "";
    }
  }

  get isSaving(): boolean {
    return this.saveStatus === "saving";
  }

  get nextLabel(): string {
    return this.state.currentStep === 3 ? "Создать чемпионат" : "Далее";
  }

  get isNextDisabled(): boolean {
    if (this.isSaving) {
      return true;
    }

    if (this.state.currentStep === 3) {
      return !this.validity[1] || !this.validity[2];
    }

    return !this.validity[this.state.currentStep];
  }

  get isDraftSaveDisabled(): boolean {
    return this.isSaving || !this.validity[1];
  }

  get autosaveText(): string {
    if (this.saveStatus === "saving") {
      return "Сохранение…";
    }

    if (this.saveStatus === "error") {
      return "Не удалось сохранить черновик";
    }

    if (this.lastSavedAt) {
      return `Черновик сохранен · ${this.formatRelativeSavedTime(this.lastSavedAt)}`;
    }

    return "Черновик еще не сохранен";
  }

  get completedChecklistCount(): number {
    return this.createdChecklist.filter(item => item.status === "done").length;
  }

  get readinessText(): string {
    return `${this.completedChecklistCount} из ${this.createdChecklist.length} заполнено`;
  }

  get canSubmitCreatedToModeration(): boolean {
    return this.createdChecklist.every(item => item.status === "done");
  }

  get moderationDisabledHint(): string {
    return "Заполните разделы: материалы, критерии и эксперты, обложка и визуальные материалы.";
  }

  goBack(): void {
    const step = this.state.currentStep;

    if (step === 1) {
      this.handleExit();
      return;
    }

    this.navigateToStep((step - 1) as WizardStep);
  }

  goNext(): void {
    if (this.isNextDisabled) {
      return;
    }

    if (this.state.currentStep === 3) {
      this.createChampion();
      return;
    }

    const nextStep = (this.state.currentStep + 1) as WizardStep;

    this.persistDraft$()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => this.navigateToStep(nextStep),
        error: () => undefined,
      });
  }

  saveDraft(): void {
    if (this.isDraftSaveDisabled) {
      return;
    }

    this.persistDraft$()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({ error: () => undefined });
  }

  retryAutosave(): void {
    this.saveDraft();
  }

  navigateToStep(step: WizardStep): void {
    if (step > 1 && !this.validity[1]) {
      this.router.navigate(["/office/program/new/basic-info"]);
      return;
    }

    if (step === 3 && !this.wizardState.hasRegistration()) {
      this.router.navigate(["/office/program/new/registration"]);
      return;
    }

    this.router.navigate(["/office/program/new", this.stepPath(step)]);
  }

  canDeactivate(): boolean {
    if (!this.wizardState.snapshot.isDirty) {
      return true;
    }

    const shouldLeave = window.confirm(
      "У вас есть несохраненные изменения. Выйти из мастера без сохранения?"
    );

    if (shouldLeave) {
      this.wizardState.reset();
    }

    return shouldLeave;
  }

  closeCreatedPopup(): void {
    this.createdPopupOpen = false;
    this.wizardState.reset();
    this.router.navigate(["/office/program/my"]);
  }

  goToCreatedEdit(): void {
    const programId = this.createdProgram?.id ?? this.wizardState.snapshot.draftId;
    if (!programId) {
      return;
    }

    this.createdPopupOpen = false;
    this.wizardState.reset();
    this.router.navigate(["/office/program", programId, "edit", "main"]);
  }

  goToCreatedPreview(): void {
    const programId = this.createdProgram?.id ?? this.wizardState.snapshot.draftId;
    if (!programId) {
      return;
    }

    this.createdPopupOpen = false;
    this.wizardState.reset();
    this.router.navigate(["/office/program", programId]);
  }

  submitCreatedToModeration(): void {
    const programId = this.createdProgram?.id ?? this.wizardState.snapshot.draftId;
    if (!programId || !this.canSubmitCreatedToModeration || this.moderationSubmitting) {
      return;
    }

    this.moderationSubmitting = true;
    this.moderationError = "";
    this.programService
      .submitToModeration(programId)
      .pipe(
        catchError(error => {
          this.moderationError =
            error?.error?.detail || "Не удалось отправить чемпионат на модерацию";
          return throwError(() => error);
        }),
        finalize(() => {
          this.moderationSubmitting = false;
          this.cdr.markForCheck();
        }),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe({
        next: () => {
          this.createdPopupOpen = false;
          this.wizardState.reset();
          this.snackbar.success("Чемпионат отправлен на модерацию");
          this.router.navigate(["/office/program", programId]);
        },
        error: () => undefined,
      });
  }

  checklistStatusLabel(status: ChecklistStatus): string {
    if (status === "done") {
      return "выполнено";
    }

    if (status === "partial") {
      return "частично";
    }

    return "не заполнено";
  }

  private setupAutosave(): void {
    this.wizardState
      .getState()
      .pipe(
        debounceTime(3000),
        filter(state => state.isDirty && this.validity[1] && this.hasDraftableData(state)),
        exhaustMap(() => this.persistDraft$(false).pipe(catchError(() => EMPTY))),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe();
  }

  private createChampion(): void {
    this.persistDraft$()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: program => {
          this.createdProgram = program;
          this.createdPopupOpen = true;
          this.moderationError = "";
          this.cdr.markForCheck();
        },
        error: () => undefined,
      });
  }

  private handleExit(): void {
    if (!this.state.isDirty) {
      this.router.navigate(["/office/program/all"]);
      return;
    }

    const shouldLeave = window.confirm("Выйти из мастера без сохранения?");

    if (shouldLeave) {
      this.wizardState.reset();
      this.router.navigate(["/office/program/all"]);
    }
  }

  private persistDraft$(showToast = true): Observable<Program> {
    if (this.saveStatus === "saving" || !this.validity[1]) {
      return EMPTY;
    }

    const state = this.wizardState.snapshot;
    const payload = this.buildPayload(state);
    const request$ = state.draftId
      ? this.programService.update(state.draftId, payload)
      : this.programService.create(payload);

    this.saveStatus = "saving";
    this.cdr.markForCheck();

    return request$.pipe(
      tap(program => {
        if (program.id) {
          this.wizardState.setDraftId(program.id);
        }

        this.lastSavedAt = new Date();
        this.saveStatus = "saved";
        this.wizardState.markSaved();

        if (showToast) {
          this.snackbar.success("Черновик сохранен");
        }
      }),
      catchError(error => {
        this.saveStatus = "error";
        this.snackbar.error("Не удалось сохранить черновик");

        return throwError(() => error);
      }),
      finalize(() => {
        this.cdr.markForCheck();
      })
    );
  }

  private buildPayload(state: WizardState): ProgramDraftPayload {
    return {
      name: state.name.trim(),
      description: state.description.trim(),
      city: state.city.trim(),
      datetimeStarted: this.toDateTime(state.datetimeStarted, "00:00"),
      datetimeRegistrationEnds: this.toDateTime(state.datetimeRegistrationEnds, "23:59"),
      datetimeProjectSubmissionEnds: this.toDateTime(state.datetimeProjectSubmissionEnds, "23:59"),
      datetimeFinished: this.toDateTime(state.datetimeFinished, "23:59"),
      isPrivate: state.isPrivate,
      registrationType: "internal",
      registrationLink: null,
    };
  }

  private hasDraftableData(state: WizardState): boolean {
    return Boolean(
      state.name ||
        state.description ||
        state.city ||
        state.datetimeStarted ||
        state.datetimeRegistrationEnds ||
        state.datetimeProjectSubmissionEnds ||
        state.datetimeFinished
    );
  }

  private syncStepFromUrl(url: string): void {
    const step = this.stepFromUrl(url);

    if (step > 1 && !this.validity[1]) {
      this.router.navigate(["/office/program/new/basic-info"]);
      return;
    }

    if (step === 3 && !this.wizardState.hasRegistration()) {
      this.router.navigate(["/office/program/new/registration"]);
      return;
    }

    this.wizardState.setCurrentStep(step);
  }

  private stepFromUrl(url: string): WizardStep {
    if (url.includes("/registration")) {
      return 2;
    }

    if (url.includes("/publish")) {
      return 3;
    }

    return 1;
  }

  private stepPath(step: WizardStep): string {
    if (step === 2) {
      return "registration";
    }

    if (step === 3) {
      return "publish";
    }

    return "basic-info";
  }

  private toDateTime(date: string, time: string): string {
    return `${date}T${time}:00`;
  }

  private formatRelativeSavedTime(date: Date): string {
    const diffMs = Math.max(0, Date.now() - date.getTime());
    const diffMinutes = Math.floor(diffMs / 60_000);

    if (diffMinutes < 1) {
      return "менее минуты";
    }

    if (diffMinutes < 5) {
      return "менее 5 минут";
    }

    const formattedTime = new Intl.DateTimeFormat("ru-RU", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "Europe/Moscow",
    }).format(date);

    return `последнее изменение в ${formattedTime}`;
  }
}
