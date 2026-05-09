/** @format */

import { CommonModule } from "@angular/common";
import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from "@angular/core";
import { WizardStep } from "../../services/wizard-state.service";

interface ProgressStep {
  step: WizardStep;
  label: string;
}

@Component({
  selector: "app-wizard-progress",
  standalone: true,
  imports: [CommonModule],
  templateUrl: "./wizard-progress.component.html",
  styleUrl: "./wizard-progress.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WizardProgressComponent {
  @Input({ required: true }) currentStep: WizardStep = 1;
  @Output() stepSelected = new EventEmitter<WizardStep>();

  readonly steps: ProgressStep[] = [
    { step: 1, label: "Основное" },
    { step: 2, label: "Доступ" },
    { step: 3, label: "Проверка и создание" },
  ];

  selectStep(step: WizardStep): void {
    if (step < this.currentStep) {
      this.stepSelected.emit(step);
    }
  }

  isCompleted(step: WizardStep): boolean {
    return step < this.currentStep;
  }
}
