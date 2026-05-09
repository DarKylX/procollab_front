/** @format */

import { TestBed } from "@angular/core/testing";

import { ProjectRatingService } from "./project-rating.service";
import { RouterTestingModule } from "@angular/router/testing";
import { HttpClientTestingModule, HttpTestingController } from "@angular/common/http/testing";
import { API_URL } from "projects/core";
import { HttpParams } from "@angular/common/http";

describe("ProjectRatingService", () => {
  let service: ProjectRatingService;
  let httpTestingController: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [RouterTestingModule, HttpClientTestingModule],
      providers: [{ provide: API_URL, useValue: "" }],
    });
    service = TestBed.inject(ProjectRatingService);
    httpTestingController = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpTestingController.verify();
  });

  it("should be created", () => {
    expect(service).toBeTruthy();
  });

  it("should request expert submissions with filters", () => {
    const params = new HttpParams().set("status", "draft").set("search", "risk");

    service.getSubmissions(12, params).subscribe(response => {
      expect(response.counters.assigned).toBe(2);
      expect(response.results.length).toBe(1);
    });

    const request = httpTestingController.expectOne(req => {
      return (
        req.url === "/rate-project/12/submissions/" &&
        req.params.get("status") === "draft" &&
        req.params.get("search") === "risk"
      );
    });
    expect(request.request.method).toBe("GET");
    request.flush({
      count: 1,
      next: null,
      previous: null,
      program: { id: 12, name: "Demo" },
      counters: { assigned: 2, evaluated: 1, remaining: 1 },
      results: [{ id: 7, projectName: "RiskVision" }],
    });
  });

  it("should request expert evaluation programs", () => {
    service.getExpertEvaluationPrograms().subscribe(response => {
      expect(response.length).toBe(1);
      expect(response[0].assigned).toBe(4);
    });

    const request = httpTestingController.expectOne("/rate-project/expert/evaluations/");
    expect(request.request.method).toBe("GET");
    request.flush([
      {
        id: 12,
        name: "Demo",
        evaluationDeadline: "2026-06-20T00:00:00Z",
        assigned: 4,
        evaluated: 2,
        remaining: 2,
        stage: "Экспертная оценка",
        stageStatus: "Идет оценка",
        isDistributedEvaluation: true,
      },
    ]);
  });

  it("should request an expert submission detail", () => {
    service.getSubmission(12, 7).subscribe(response => {
      expect(response.id).toBe(7);
      expect(response.criteria.length).toBe(1);
    });

    const request = httpTestingController.expectOne("/rate-project/12/submissions/7/");
    expect(request.request.method).toBe("GET");
    request.flush({
      id: 7,
      projectName: "RiskVision",
      criteria: [{ id: 1, type: "int", value: 8 }],
    });
  });

  it("should save a draft evaluation", () => {
    const payload = {
      comment: "Draft comment",
      scores: [{ criterionId: 1, value: 8 }],
    };

    service.saveDraft(12, 7, payload).subscribe(response => {
      expect(response.evaluation?.status).toBe("draft");
    });

    const request = httpTestingController.expectOne("/rate-project/12/submissions/7/draft/");
    expect(request.request.method).toBe("PUT");
    expect(request.request.body).toEqual({
      comment: "Draft comment",
      scores: [{ criterionId: 1, value: 8 }],
    });
    request.flush({
      id: 7,
      evaluation: { id: 3, status: "draft", comment: "Draft comment", totalScore: "8.00" },
    });
  });

  it("should submit a final evaluation", () => {
    const payload = {
      comment: "Final comment",
      scores: [{ criterionId: 1, value: 9 }],
    };

    service.submitEvaluation(12, 7, payload).subscribe(response => {
      expect(response.evaluation?.status).toBe("submitted");
    });

    const request = httpTestingController.expectOne("/rate-project/12/submissions/7/submit/");
    expect(request.request.method).toBe("POST");
    expect(request.request.body).toEqual({
      comment: "Final comment",
      scores: [{ criterionId: 1, value: 9 }],
    });
    request.flush({
      id: 7,
      evaluation: { id: 3, status: "submitted", comment: "Final comment", totalScore: "9.00" },
    });
  });
});
