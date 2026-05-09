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
import {
  AbstractControl,
  FormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  ValidatorFn,
  Validators,
} from "@angular/forms";
import { Observable, tap, throwError } from "rxjs";
import { Program } from "@office/program/models/program.model";
import { ProgramDraftPayload } from "@office/program/models/program-draft.model";
import { ProgramService } from "@office/program/services/program.service";
import { IconComponent } from "@ui/components";
import {
  ProgramEditStateService,
  ProgramEditTabController,
} from "../../services/program-edit-state.service";

type ScheduleDateControlName =
  | "datetimeStarted"
  | "datetimeRegistrationEnds"
  | "datetimeProjectSubmissionEnds"
  | "datetimeEvaluationEnds"
  | "datetimeFinished";

type TimelineState = "completed" | "active" | "pending";
type ParticipationFormat = "individual" | "team";

interface ScheduleDateField {
  control: ScheduleDateControlName;
  label: string;
  required?: boolean;
}

interface TimelineItem {
  control: ScheduleDateControlName;
  label: string;
}

interface ScheduleFormValue {
  datetimeStarted: string;
  datetimeRegistrationEnds: string;
  datetimeProjectSubmissionEnds: string;
  datetimeEvaluationEnds: string;
  datetimeFinished: string;
  isCompetitive: boolean;
  isDistributedEvaluation: boolean;
  maxProjectRates: number;
  projectsAvailability: string;
  publishProjectsAfterFinish: boolean;
  participationFormat: ParticipationFormat;
  projectTeamMinSize: number;
  projectTeamMaxSize: number | null;
}

interface ScheduleDraft {
  value: ScheduleFormValue;
}

@Component({
  selector: "app-program-edit-schedule",
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, IconComponent],
  templateUrl: "./program-edit-schedule.component.html",
  styleUrl: "./program-edit-schedule.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProgramEditScheduleComponent implements OnInit, OnDestroy {
  private readonly fb = inject(FormBuilder);
  private readonly destroyRef = inject(DestroyRef);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly editState = inject(ProgramEditStateService);
  private readonly programService = inject(ProgramService);
  private readonly tabKey = "schedule";

  readonly form = this.fb.nonNullable.group(
    {
      datetimeStarted: ["", [Validators.required]],
      datetimeRegistrationEnds: ["", [Validators.required]],
      datetimeProjectSubmissionEnds: [""],
      datetimeEvaluationEnds: [""],
      datetimeFinished: ["", [Validators.required]],
      isCompetitive: [false],
      isDistributedEvaluation: [false],
      maxProjectRates: [1, [Validators.min(1), Validators.max(99)]],
      projectsAvailability: ["all_users"],
      publishProjectsAfterFinish: [false],
      participationFormat: ["team" as ParticipationFormat, [Validators.required]],
      projectTeamMinSize: [1, [Validators.min(1), Validators.max(99)]],
      projectTeamMaxSize: [null as number | null, [Validators.min(1), Validators.max(99)]],
    },
    { validators: [this.dateFlowValidator()] }
  );

  readonly dateFields: ScheduleDateField[] = [
    {
      control: "datetimeStarted",
      label: "Дата начала чемпионата",
      required: true,
    },
    {
      control: "datetimeRegistrationEnds",
      label: "Окончание регистрации",
      required: true,
    },
    {
      control: "datetimeProjectSubmissionEnds",
      label: "Окончание подачи проектов",
    },
    {
      control: "datetimeEvaluationEnds",
      label: "Окончание оценки",
    },
    {
      control: "datetimeFinished",
      label: "Завершение чемпионата",
      required: true,
    },
  ];

  readonly timelineItems: TimelineItem[] = [
    {
      control: "datetimeRegistrationEnds",
      label: "Регистрация",
    },
    {
      control: "datetimeStarted",
      label: "Старт",
    },
    {
      control: "datetimeProjectSubmissionEnds",
      label: "Подача",
    },
    {
      control: "datetimeEvaluationEnds",
      label: "Оценка",
    },
    {
      control: "datetimeFinished",
      label: "Завершение",
    },
  ];

  readonly today = this.getTodayDateInput();

  readonly controller: ProgramEditTabController = {
    tabKey: this.tabKey,
    save: () => this.save(),
    reset: () => this.reset(),
  };

  ngOnInit(): void {
    const draft = this.editState.getTabDraft<ScheduleDraft>(this.tabKey);
    if (draft) {
      this.form.patchValue(draft.value, { emitEvent: false });
    } else {
      this.patchFromProgram(this.editState.savedProgram() ?? this.program);
    }
    this.applyReadonly();
    this.editState.registerController(this.controller);
    this.syncState();

    this.form.controls.isCompetitive.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(isCompetitive => {
        if (!isCompetitive) {
          this.form.controls.isDistributedEvaluation.setValue(false);
          this.form.controls.maxProjectRates.setValue(1);
        }

        this.syncState();
        this.cdr.markForCheck();
      });

    this.form.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      this.syncState();
      this.cdr.markForCheck();
    });

    this.form.statusChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      this.syncState();
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

  get isDistributedVisible(): boolean {
    return this.form.controls.isCompetitive.value;
  }

  get isTeamFormat(): boolean {
    return this.form.controls.participationFormat.value === "team";
  }

  get dateErrorText(): string {
    if (this.hasDateError("startAfterFinish")) {
      return "Дата начала не может быть позже даты завершения";
    }

    if (this.hasDateError("projectSubmissionBeforeRegistration")) {
      return "Подача проектов должна быть после регистрации";
    }

    if (this.hasDateError("evaluationBeforeSubmission")) {
      return "Оценка начинается после подачи проектов";
    }

    if (this.hasDateError("finishBeforeEvaluation")) {
      return "Завершение должно быть после оценки";
    }

    if (this.hasDateError("projectSubmissionAfterFinish")) {
      return "Подача проектов должна завершиться не позже чемпионата";
    }

    return "";
  }

  selectParticipationFormat(format: ParticipationFormat): void {
    if (this.isReadonly) {
      return;
    }

    this.form.controls.participationFormat.setValue(format);
    if (format === "individual") {
      this.form.patchValue(
        {
          projectTeamMinSize: 1,
          projectTeamMaxSize: null,
        },
        { emitEvent: false }
      );
    }
    this.syncState();
  }

  hasDateError(error: string): boolean {
    return Boolean(this.form.errors?.[error] && (this.form.dirty || this.form.touched));
  }

  isInvalid(controlName: keyof typeof this.form.controls): boolean {
    const control = this.form.controls[controlName];
    return control.invalid && (control.dirty || control.touched);
  }

  fieldControl(controlName: ScheduleDateControlName) {
    return this.form.controls[controlName];
  }

  timelineDate(controlName: ScheduleDateControlName): string {
    return this.formatDisplayDate(this.fieldControl(controlName).value);
  }

  timelineState(item: TimelineItem): TimelineState {
    const firstFutureIndex = this.timelineItems.findIndex(timelineItem => {
      const value = this.fieldControl(timelineItem.control).value;

      return Boolean(value && value >= this.today);
    });
    const itemIndex = this.timelineItems.indexOf(item);
    const itemValue = this.fieldControl(item.control).value;

    if (!itemValue) {
      return "pending";
    }

    if (firstFutureIndex === -1) {
      return "completed";
    }

    if (itemIndex < firstFutureIndex) {
      return "completed";
    }

    if (itemIndex === firstFutureIndex) {
      return "active";
    }

    return "pending";
  }

  private save(): Observable<Program> {
    this.form.markAllAsTouched();
    this.syncState();

    const programId = this.program?.id;
    if (!programId || this.form.invalid || this.isReadonly) {
      return throwError(() => new Error("Invalid schedule form"));
    }

    const value = this.form.getRawValue();
    const payload: ProgramDraftPayload = {
      datetimeStarted: this.toDateTime(value.datetimeStarted, "00:00"),
      datetimeRegistrationEnds: this.toDateTime(value.datetimeRegistrationEnds, "23:59"),
      datetimeProjectSubmissionEnds: value.datetimeProjectSubmissionEnds
        ? this.toDateTime(value.datetimeProjectSubmissionEnds, "23:59")
        : null,
      datetimeEvaluationEnds: value.datetimeEvaluationEnds
        ? this.toDateTime(value.datetimeEvaluationEnds, "23:59")
        : null,
      datetimeFinished: this.toDateTime(value.datetimeFinished, "23:59"),
      isCompetitive: value.isCompetitive,
      isDistributedEvaluation: value.isCompetitive ? value.isDistributedEvaluation : false,
      maxProjectRates:
        value.isCompetitive && value.isDistributedEvaluation ? value.maxProjectRates : 1,
      projectsAvailability: value.projectsAvailability as "all_users" | "experts_only",
      publishProjectsAfterFinish: value.publishProjectsAfterFinish,
      participationFormat: value.participationFormat,
      projectTeamMinSize: value.participationFormat === "team" ? value.projectTeamMinSize : 1,
      projectTeamMaxSize:
        value.participationFormat === "team" ? value.projectTeamMaxSize || null : null,
    };

    return this.programService.update(programId, payload).pipe(
      tap(program => {
        this.form.markAsPristine();
        this.editState.updateFormState(false, this.form.valid, this.isReadonly);
        this.editState.updateProgram(program);
      })
    );
  }

  private reset(): void {
    this.patchFromProgram(this.editState.savedProgram() ?? this.program);
    this.form.markAsPristine();
    this.syncState();
  }

  private patchFromProgram(program: Program | null): void {
    if (!program) {
      return;
    }

    this.form.patchValue(
      {
        datetimeStarted: this.toDateInput(program.datetimeStarted),
        datetimeRegistrationEnds: this.toDateInput(program.datetimeRegistrationEnds),
        datetimeProjectSubmissionEnds: this.toDateInput(program.datetimeProjectSubmissionEnds),
        datetimeEvaluationEnds: this.toDateInput(program.datetimeEvaluationEnds),
        datetimeFinished: this.toDateInput(program.datetimeFinished),
        isCompetitive: Boolean(program.isCompetitive),
        isDistributedEvaluation: Boolean(program.isDistributedEvaluation),
        maxProjectRates: program.maxProjectRates ?? 1,
        projectsAvailability:
          program.projectsAvailability === "experts_only" ? "experts_only" : "all_users",
        publishProjectsAfterFinish: Boolean(program.publishProjectsAfterFinish),
        participationFormat: program.participationFormat ?? "team",
        projectTeamMinSize: program.projectTeamMinSize ?? 1,
        projectTeamMaxSize: program.projectTeamMaxSize ?? null,
      },
      { emitEvent: false }
    );
  }

  private applyReadonly(): void {
    if (this.isReadonly) {
      this.form.disable({ emitEvent: false });
      return;
    }

    this.form.enable({ emitEvent: false });
  }

  private computeReadonly(): boolean {
    const program = this.program;
    const status = program?.status;
    const hasParticipants = Boolean(
      (program?.participantsCount ?? program?.participants?.length ?? 0) > 0
    );
    const hasProjects = Boolean(
      (program?.projectsCount ?? 0) > 0 || (program?.activeProjectsCount ?? 0) > 0
    );

    return (
      status === "pending_moderation" ||
      status === "frozen" ||
      status === "archived" ||
      (status === "published" && (hasParticipants || hasProjects))
    );
  }

  private syncState(): void {
    const value = this.form.getRawValue();
    const dirty = JSON.stringify(value) !== JSON.stringify(this.createValueFromProgram(this.editState.savedProgram()));

    this.editState.updateFormState(dirty, this.form.valid, this.isReadonly, {
      tabKey: this.tabKey,
      draft: { value } satisfies ScheduleDraft,
      programPatch: this.createProgramPatch(value),
    });
  }

  private createProgramPatch(value: ScheduleFormValue): Partial<Program> {
    return {
      datetimeStarted: this.toDateTime(value.datetimeStarted, "00:00"),
      datetimeRegistrationEnds: this.toDateTime(value.datetimeRegistrationEnds, "23:59"),
      datetimeProjectSubmissionEnds: value.datetimeProjectSubmissionEnds
        ? this.toDateTime(value.datetimeProjectSubmissionEnds, "23:59")
        : "",
      datetimeEvaluationEnds: value.datetimeEvaluationEnds
        ? this.toDateTime(value.datetimeEvaluationEnds, "23:59")
        : "",
      datetimeFinished: this.toDateTime(value.datetimeFinished, "23:59"),
      isCompetitive: value.isCompetitive,
      isDistributedEvaluation: value.isCompetitive ? value.isDistributedEvaluation : false,
      maxProjectRates:
        value.isCompetitive && value.isDistributedEvaluation ? value.maxProjectRates : 1,
      projectsAvailability: value.projectsAvailability as "all_users" | "experts_only",
      publishProjectsAfterFinish: value.publishProjectsAfterFinish,
      participationFormat: value.participationFormat,
      projectTeamMinSize: value.participationFormat === "team" ? value.projectTeamMinSize : 1,
      projectTeamMaxSize:
        value.participationFormat === "team" ? value.projectTeamMaxSize || null : null,
    };
  }

  private createValueFromProgram(program: Program | null): ScheduleFormValue {
    return {
      datetimeStarted: this.toDateInput(program?.datetimeStarted),
      datetimeRegistrationEnds: this.toDateInput(program?.datetimeRegistrationEnds),
      datetimeProjectSubmissionEnds: this.toDateInput(program?.datetimeProjectSubmissionEnds),
      datetimeEvaluationEnds: this.toDateInput(program?.datetimeEvaluationEnds),
      datetimeFinished: this.toDateInput(program?.datetimeFinished),
      isCompetitive: Boolean(program?.isCompetitive),
      isDistributedEvaluation: Boolean(program?.isDistributedEvaluation),
      maxProjectRates: program?.maxProjectRates ?? 1,
      projectsAvailability:
        program?.projectsAvailability === "experts_only" ? "experts_only" : "all_users",
      publishProjectsAfterFinish: Boolean(program?.publishProjectsAfterFinish),
      participationFormat: program?.participationFormat ?? "team",
      projectTeamMinSize: program?.projectTeamMinSize ?? 1,
      projectTeamMaxSize: program?.projectTeamMaxSize ?? null,
    };
  }

  private dateFlowValidator(): ValidatorFn {
    return (control: AbstractControl): ValidationErrors | null => {
      const started = control.get("datetimeStarted")?.value;
      const registrationEnds = control.get("datetimeRegistrationEnds")?.value;
      const projectSubmissionEnds = control.get("datetimeProjectSubmissionEnds")?.value;
      const evaluationEnds = control.get("datetimeEvaluationEnds")?.value;
      const finished = control.get("datetimeFinished")?.value;
      const errors: ValidationErrors = {};

      if (started && finished && started > finished) {
        errors["startAfterFinish"] = true;
      }

      if (registrationEnds && projectSubmissionEnds && projectSubmissionEnds < registrationEnds) {
        errors["projectSubmissionBeforeRegistration"] = true;
      }

      if (projectSubmissionEnds && evaluationEnds && evaluationEnds < projectSubmissionEnds) {
        errors["evaluationBeforeSubmission"] = true;
      }

      if (evaluationEnds && finished && finished < evaluationEnds) {
        errors["finishBeforeEvaluation"] = true;
      }

      if (projectSubmissionEnds && finished && projectSubmissionEnds > finished) {
        errors["projectSubmissionAfterFinish"] = true;
      }

      const minSize = control.get("projectTeamMinSize")?.value;
      const maxSize = control.get("projectTeamMaxSize")?.value;
      if (minSize && maxSize && maxSize < minSize) {
        errors["teamSizeRange"] = true;
      }

      return Object.keys(errors).length ? errors : null;
    };
  }

  private toDateInput(value?: string): string {
    return value ? value.slice(0, 10) : "";
  }

  private toDateTime(date: string, time: string): string {
    return date ? `${date}T${time}:00` : "";
  }

  private formatDisplayDate(value: string): string {
    if (!value) {
      return "Не указано";
    }

    const [year, month, day] = value.slice(0, 10).split("-");

    return day && month && year ? `${day}.${month}.${year}` : value;
  }

  private getTodayDateInput(): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
  }
}
