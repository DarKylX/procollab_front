/** @format */

import { ComponentFixture, TestBed, fakeAsync, tick } from "@angular/core/testing";
import { ErrorHandler } from "@angular/core";
import { of, throwError } from "rxjs";

import { ReadinessData } from "@office/program/models/readiness.model";
import { ProgramService } from "@office/program/services/program.service";
import { ReadinessWidgetComponent } from "./readiness-widget.component";

describe("ReadinessWidgetComponent", () => {
  let component: ReadinessWidgetComponent;
  let fixture: ComponentFixture<ReadinessWidgetComponent>;
  let programService: jasmine.SpyObj<ProgramService>;

  const readinessData: ReadinessData = {
    percentage: 63,
    checklist: {
      basic_info: true,
      dates: false,
      registration: true,
    },
    labels: {
      basic_info: "Основная информация",
      dates: "Сроки и формат",
      registration: "Регистрация",
    },
    missingRequiredSections: ["dates"],
    canSubmitToModeration: false,
  };

  beforeEach(async () => {
    programService = jasmine.createSpyObj<ProgramService>("ProgramService", ["getReadiness"]);
    programService.getReadiness.and.returnValue(of(readinessData));

    await TestBed.configureTestingModule({
      imports: [ReadinessWidgetComponent],
      providers: [
        { provide: ProgramService, useValue: programService },
        {
          provide: ErrorHandler,
          useValue: jasmine.createSpyObj<ErrorHandler>("ErrorHandler", ["handleError"]),
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ReadinessWidgetComponent);
    component = fixture.componentInstance;
    component.programId = 42;
  });

  it("should render with valid readiness data", () => {
    fixture.detectChanges();

    expect(component).toBeTruthy();
    expect(fixture.nativeElement.textContent).toContain("63%");
  });

  it("should render checklist items from api response", () => {
    fixture.detectChanges();

    const text = fixture.nativeElement.textContent;
    expect(text).toContain("Основная информация");
    expect(text).toContain("Сроки и формат");
    expect(text).toContain("Регистрация");
  });

  it("should show check icon for completed items", () => {
    fixture.detectChanges();

    const completedItems = fixture.nativeElement.querySelectorAll(".readiness__item--done");
    expect(completedItems.length).toBe(2);
    expect(completedItems[0].textContent).toContain("✓");
  });

  it("should emit blockClicked when incomplete item is clicked", () => {
    spyOn(component.blockClicked, "emit");
    fixture.detectChanges();

    const todoButton: HTMLButtonElement = fixture.nativeElement.querySelector(
      ".readiness__item--todo .readiness__item-button"
    );
    todoButton.click();

    expect(component.blockClicked.emit).toHaveBeenCalledWith("dates");
  });

  it("should render error state and retry button", fakeAsync(() => {
    programService.getReadiness.and.returnValue(throwError(() => new Error("Network error")));

    fixture.detectChanges();
    tick();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain("Не удалось загрузить готовность");

    programService.getReadiness.and.returnValue(of(readinessData));
    const retryButton: HTMLButtonElement = fixture.nativeElement.querySelector(".readiness__retry");
    retryButton.click();
    tick();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain("63%");
    expect(programService.getReadiness).toHaveBeenCalledTimes(2);
  }));

  it("refresh should request readiness data again", () => {
    fixture.detectChanges();

    component.refresh();

    expect(programService.getReadiness).toHaveBeenCalledTimes(2);
  });
});
