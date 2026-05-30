/** @format */

import { CommonModule } from "@angular/common";
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  inject,
  OnDestroy,
  OnInit,
} from "@angular/core";
import {
  AbstractControl,
  FormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  ValidatorFn,
  Validators,
} from "@angular/forms";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { WizardStateService } from "../../services/wizard-state.service";

@Component({
  selector: "app-basic-info-step",
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: "./basic-info-step.component.html",
  styleUrl: "./basic-info-step.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BasicInfoStepComponent implements OnInit, OnDestroy {
  private readonly destroyRef = inject(DestroyRef);
  private readonly wizardState = inject(WizardStateService);

  readonly descriptionMaxLength = 1000;
  readonly formatOptions = ["Онлайн", "Оффлайн"];

  readonly form = inject(FormBuilder).nonNullable.group(
    {
      name: ["", [Validators.required, Validators.minLength(5), Validators.maxLength(200)]],
      description: [
        "",
        [
          Validators.required,
          Validators.maxLength(this.descriptionMaxLength),
        ],
      ],
      datetimeStarted: ["", [Validators.required]],
      datetimeFinished: ["", [Validators.required]],
      city: ["", [Validators.required]],
    },
    { validators: [this.dateFlowValidator()] }
  );

  get descriptionLength(): number {
    return this.form.controls.description.value.length;
  }

  ngOnInit(): void {
    const state = this.wizardState.snapshot;

    this.form.patchValue(
      {
        name: state.name,
        description: state.description,
        datetimeStarted: state.datetimeStarted,
        datetimeFinished: state.datetimeFinished,
        city: this.normalizeProgramFormat(state.city),
      },
      { emitEvent: false }
    );

    this.syncState(false);
    this.syncValidity();

    this.form.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      this.syncState();
      this.syncValidity();
    });

    this.form.statusChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      this.syncValidity();
    });
  }

  ngOnDestroy(): void {
    this.syncState(false);
    this.syncValidity();
  }

  isInvalid(controlName: keyof typeof this.form.controls): boolean {
    const control = this.form.controls[controlName];

    return control.invalid && (control.dirty || control.touched);
  }

  errorText(controlName: keyof typeof this.form.controls): string {
    const control = this.form.controls[controlName];

    if (control.hasError("required")) {
      return "Поле обязательно";
    }

    if (control.hasError("minlength")) {
      return `Минимум ${control.getError("minlength").requiredLength} символов`;
    }

    if (control.hasError("maxlength")) {
      return `Максимум ${control.getError("maxlength").requiredLength} символов`;
    }

    return "";
  }

  hasDateError(error: string): boolean {
    return Boolean(this.form.errors?.[error] && (this.form.dirty || this.form.touched));
  }

  private syncState(markDirty = true): void {
    const value = this.form.getRawValue();

    this.wizardState.updateBasicInfo(
      {
        ...value,
        datetimeRegistrationEnds: value.datetimeFinished,
        datetimeProjectSubmissionEnds: value.datetimeFinished,
      },
      markDirty
    );
  }

  private syncValidity(): void {
    this.wizardState.setStepValidity(1, this.form.valid);
  }

  private dateFlowValidator(): ValidatorFn {
    return (control: AbstractControl): ValidationErrors | null => {
      const started = control.get("datetimeStarted")?.value;
      const finished = control.get("datetimeFinished")?.value;
      const errors: ValidationErrors = {};

      if (started && finished && started > finished) {
        errors["startAfterFinish"] = true;
      }

      return Object.keys(errors).length ? errors : null;
    };
  }

  private normalizeProgramFormat(value: string): string {
    const normalized = (value || "").trim().toLowerCase();
    if (!normalized) {
      return "";
    }
    return normalized === "онлайн" || normalized === "online" ? "Онлайн" : "Оффлайн";
  }
}
