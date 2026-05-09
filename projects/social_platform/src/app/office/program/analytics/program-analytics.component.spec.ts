/** @format */

import { ComponentFixture, TestBed } from "@angular/core/testing";
import { ActivatedRoute, Router } from "@angular/router";
import { RouterTestingModule } from "@angular/router/testing";
import { HttpErrorResponse } from "@angular/common/http";
import { of, throwError } from "rxjs";
import { ProgramAnalyticsComponent } from "./program-analytics.component";
import {
  ProgramAnalytics,
  ProgramAnalyticsSubmission,
} from "@office/program/models/program-analytics.model";
import { ProgramService } from "@office/program/services/program.service";

describe("ProgramAnalyticsComponent", () => {
  let fixture: ComponentFixture<ProgramAnalyticsComponent>;
  let component: ProgramAnalyticsComponent;
  let programService: jasmine.SpyObj<ProgramService>;

  const submitted: ProgramAnalyticsSubmission = {
    programProjectId: 10,
    projectId: 100,
    projectTitle: "Risk Model",
    projectDescription: "Description",
    participantsPreview: "Leader User, Collaborator User",
    participantsCount: 2,
    authorName: "Leader User",
    participantLabel: "2 участника",
    submittedAt: "2026-06-10T18:20:00Z",
    submissionStatus: "submitted",
    evaluationStatus: "evaluated",
    evaluationsReceived: 2,
    evaluationsRequired: 2,
    averageScore: 9,
    finalScore: 9,
    projectMaterials: [],
  };

  const analytics: ProgramAnalytics = {
    programId: 1,
    title: "Финансовый форсайт 2026",
    status: "published",
    currentStage: "Экспертная оценка",
    evaluationDeadline: "2026-06-20T00:00:00Z",
    participantsCount: 2,
    submittedProjectsCount: 1,
    evaluatedProjectsCount: 1,
    averageScore: 9,
    submissions: [submitted],
  };

  beforeEach(async () => {
    programService = jasmine.createSpyObj<ProgramService>("ProgramService", [
      "getAnalytics",
      "exportAnalytics",
    ]);
    programService.getAnalytics.and.returnValue(of(analytics));
    programService.exportAnalytics.and.returnValue(of(new Blob()));

    await TestBed.configureTestingModule({
      imports: [ProgramAnalyticsComponent, RouterTestingModule],
      providers: [
        { provide: ProgramService, useValue: programService },
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: { params: { programId: "1" } },
            parent: null,
          },
        },
      ],
    }).compileComponents();
  });

  function createComponent(): void {
    fixture = TestBed.createComponent(ProgramAnalyticsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }

  it("loads analytics and renders participants instead of team name", () => {
    createComponent();

    const text = fixture.nativeElement.textContent as string;

    expect(programService.getAnalytics).toHaveBeenCalledWith(1);
    expect(text).toContain("Risk Model");
    expect(text).toContain("2 участника");
    expect(text).toContain("Leader User, Collaborator User");
    expect(text).not.toContain("Команда / автор");
  });

  it("selects empty states in the required order", () => {
    createComponent();

    component.analytics = { ...analytics, submissions: [] };
    expect(component.emptyState?.title).toBe("Проекты еще не привязаны");

    component.analytics = {
      ...analytics,
      submittedProjectsCount: 0,
      submissions: [{ ...submitted, submissionStatus: "not_submitted", submittedAt: null }],
    };
    expect(component.emptyState?.title).toBe("Проекты еще не сданы");

    component.analytics = {
      ...analytics,
      submittedProjectsCount: 1,
      submissions: [
        {
          ...submitted,
          evaluationStatus: "not_evaluated",
          evaluationsReceived: 0,
          averageScore: null,
          finalScore: null,
        },
      ],
    };
    expect(component.emptyState?.title).toBe("Оценки еще не выставлены");
  });

  it("filters by participant preview and sorts by backend average score", () => {
    createComponent();
    component.analytics = {
      ...analytics,
      submissions: [
        submitted,
        {
          ...submitted,
          programProjectId: 11,
          projectId: 101,
          projectTitle: "FinTech Assistant",
          participantsPreview: "Alice Researcher",
          participantLabel: "1 участник",
          averageScore: 7.5,
        },
      ],
    };

    component.searchValue = "alice";
    expect(component.displayedSubmissions.map(item => item.projectTitle)).toEqual([
      "FinTech Assistant",
    ]);

    component.searchValue = "";
    expect(component.displayedSubmissions.map(item => item.projectTitle)).toEqual([
      "Risk Model",
      "FinTech Assistant",
    ]);
  });

  it("shows forbidden state after backend 403", () => {
    programService.getAnalytics.and.returnValue(
      throwError(() => new HttpErrorResponse({ status: 403 }))
    );
    createComponent();

    expect(component.forbidden).toBeTrue();
  });

  it("opens the existing project page", () => {
    createComponent();
    const router = TestBed.inject(Router);
    const navigateSpy = spyOn(router, "navigate").and.resolveTo(true);

    component.openProject(submitted);

    expect(navigateSpy).toHaveBeenCalledWith(["/office/projects", 100]);
  });
});
