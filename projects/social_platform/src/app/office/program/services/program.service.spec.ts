/** @format */

import { TestBed } from "@angular/core/testing";

import { ProgramService } from "./program.service";
import { RouterTestingModule } from "@angular/router/testing";
import { HttpClientTestingModule, HttpTestingController } from "@angular/common/http/testing";
import { API_URL } from "projects/core";

describe("ProgramService", () => {
  let service: ProgramService;
  let httpTestingController: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [RouterTestingModule, HttpClientTestingModule],
      providers: [{ provide: API_URL, useValue: "" }],
    });
    service = TestBed.inject(ProgramService);
    httpTestingController = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpTestingController.verify();
  });

  it("should be created", () => {
    expect(service).toBeTruthy();
  });

  it("should request program readiness", () => {
    service.getReadiness(12).subscribe(data => {
      expect(data.percentage).toBe(75);
      expect(data.checklist["basic_info"]).toBeTrue();
    });

    const request = httpTestingController.expectOne("/programs/12/readiness/");
    expect(request.request.method).toBe("GET");
    request.flush({
      percentage: 75,
      checklist: { basic_info: true },
      labels: { basic_info: "Основная информация" },
    });
  });

  it("should request program analytics", () => {
    service.getAnalytics(12).subscribe(data => {
      expect(data.programId).toBe(12);
      expect(data.submissions.length).toBe(0);
    });

    const request = httpTestingController.expectOne("/programs/12/analytics/");
    expect(request.request.method).toBe("GET");
    request.flush({ programId: 12, submissions: [] });
  });

  it("should export program analytics xlsx", () => {
    service.exportAnalytics(12).subscribe(blob => {
      expect(blob.size).toBe(4);
    });

    const request = httpTestingController.expectOne("/programs/12/analytics/export/");
    expect(request.request.method).toBe("GET");
    expect(request.request.responseType).toBe("blob");
    request.flush(new Blob(["test"]));
  });

  it("should patch program draft", () => {
    service.update(42, { name: "Draft name" }).subscribe(program => {
      expect(program.id).toBe(42);
      expect(program.name).toBe("Draft name");
    });

    const request = httpTestingController.expectOne("/programs/42/");
    expect(request.request.method).toBe("PATCH");
    expect(request.request.body).toEqual({ name: "Draft name" });
    request.flush({ id: 42, name: "Draft name" });
  });

  it("should submit program to moderation", () => {
    service.submitToModeration(42).subscribe(program => {
      expect(program.id).toBe(42);
    });

    const request = httpTestingController.expectOne("/programs/42/submit-to-moderation/");
    expect(request.request.method).toBe("POST");
    expect(request.request.body).toEqual({});
    request.flush({ id: 42 });
  });

  it("should request my programs", () => {
    service.getMyPrograms().subscribe(programs => {
      expect(programs.length).toBe(1);
      expect(programs[0].id).toBe(1);
    });

    const request = httpTestingController.expectOne(req => {
      return req.url === "/programs/" && req.params.get("my") === "true";
    });
    expect(request.request.method).toBe("GET");
    request.flush({ count: 1, results: [{ id: 1 }] });
  });

  it("should approve program", () => {
    service.approve(42).subscribe(program => {
      expect(program.id).toBe(42);
    });

    const request = httpTestingController.expectOne("/programs/42/approve/");
    expect(request.request.method).toBe("POST");
    request.flush({ id: 42 });
  });
});
