/** @format */

import { CommonModule, DatePipe } from "@angular/common";
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  DestroyRef,
  inject,
  OnInit,
} from "@angular/core";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { Router } from "@angular/router";
import { IconComponent } from "@ui/components";
import { ProgramStatusBadgeComponent } from "../../../shared/program-status-badge/program-status-badge.component";
import { WizardState, WizardStateService, WizardStep } from "../../services/wizard-state.service";

@Component({
  selector: "app-publish-step",
  standalone: true,
  imports: [CommonModule, DatePipe, IconComponent, ProgramStatusBadgeComponent],
  templateUrl: "./publish-step.component.html",
  styleUrl: "./publish-step.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PublishStepComponent implements OnInit {
  private readonly destroyRef = inject(DestroyRef);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly router = inject(Router);
  private readonly wizardState = inject(WizardStateService);

  state: WizardState = this.wizardState.snapshot;
  isDescriptionExpanded = false;

  readonly nextItems = [
    "Чемпионат будет создан в статусе «Черновик»",
    "Вы сможете добавить обложку, материалы, критерии оценки и экспертов",
    "После подготовки отправьте чемпионат на модерацию",
    "После одобрения администратором чемпионат появится на витрине",
  ];

  ngOnInit(): void {
    this.wizardState
      .getState()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(state => {
        this.state = state;
        this.cdr.markForCheck();
      });
  }

  get description(): string {
    if (this.isDescriptionExpanded || this.state.description.length <= 200) {
      return this.state.description;
    }

    return `${this.state.description.slice(0, 200)}...`;
  }

  toggleDescription(): void {
    this.isDescriptionExpanded = !this.isDescriptionExpanded;
  }

  registrationLabel(): string {
    return "Встроенная форма PROCOLLAB";
  }

  accessTypeLabel(): string {
    return this.state.isPrivate ? "закрытый" : "открытый";
  }

  editStep(step: WizardStep): void {
    const stepPath = step === 1 ? "basic-info" : step === 2 ? "registration" : "publish";

    this.router.navigate(["/office/program/new", stepPath]);
  }
}
