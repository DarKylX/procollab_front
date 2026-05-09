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
import { FormBuilder, ReactiveFormsModule, Validators } from "@angular/forms";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { IconComponent } from "@ui/components";
import { WizardStateService } from "../../services/wizard-state.service";

type AccessType = "open" | "private";

interface SystemRegistrationField {
  icon: string;
  label: string;
}

@Component({
  selector: "app-registration-step",
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, IconComponent],
  templateUrl: "./registration-step.component.html",
  styleUrl: "./registration-step.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RegistrationStepComponent implements OnInit, OnDestroy {
  private readonly destroyRef = inject(DestroyRef);
  private readonly wizardState = inject(WizardStateService);

  readonly form = inject(FormBuilder).nonNullable.group({
    accessType: ["open", [Validators.required]],
    registrationType: ["internal", [Validators.required]],
    registrationLink: [""],
  });

  readonly systemFields: SystemRegistrationField[] = [
    { icon: "person", label: "ФИО" },
    { icon: "mail", label: "Email" },
    { icon: "phone", label: "Телефон" },
  ];

  ngOnInit(): void {
    const state = this.wizardState.snapshot;

    this.form.patchValue(
      {
        accessType: state.isPrivate ? "private" : "open",
        registrationType: state.registrationType ?? "internal",
        registrationLink: "",
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

  private syncState(markDirty = true): void {
    const accessType = this.form.controls.accessType.value as AccessType;

    this.wizardState.updateRegistration(
      {
        isPrivate: accessType === "private",
        registrationType: "internal",
        registrationLink: "",
      },
      markDirty
    );
  }

  private syncValidity(): void {
    this.wizardState.setStepValidity(2, this.form.valid);
  }
}
