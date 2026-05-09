/** @format */

import { CommonModule } from "@angular/common";
import { HttpErrorResponse } from "@angular/common/http";
import { Component, OnDestroy, OnInit, inject } from "@angular/core";
import { RouterModule } from "@angular/router";
import { finalize, Subscription } from "rxjs";
import { ExpertEvaluationProgramSummary } from "@office/program/models/project-evaluation.model";
import { ProjectRatingService } from "@office/program/services/project-rating.service";

@Component({
  selector: "app-expert-evaluations",
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: "./expert-evaluations.component.html",
  styleUrl: "./expert-evaluations.component.scss",
})
export class ExpertEvaluationsComponent implements OnInit, OnDestroy {
  private readonly projectRatingService = inject(ProjectRatingService);
  private readonly subscriptions = new Subscription();

  programs: ExpertEvaluationProgramSummary[] = [];
  loading = false;
  errorMessage = "";

  ngOnInit(): void {
    this.loadPrograms();
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  trackByProgram(_: number, program: ExpertEvaluationProgramSummary): number {
    return program.id;
  }

  private loadPrograms(): void {
    this.loading = true;
    this.errorMessage = "";

    const request$ = this.projectRatingService
      .getExpertEvaluationPrograms()
      .pipe(finalize(() => (this.loading = false)))
      .subscribe({
        next: programs => {
          this.programs = programs;
        },
        error: error => {
          this.errorMessage =
            error instanceof HttpErrorResponse && typeof error.error?.detail === "string"
              ? error.error.detail
              : "Не удалось загрузить список чемпионатов для экспертизы.";
        },
      });

    this.subscriptions.add(request$);
  }
}
