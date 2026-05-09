/** @format */

import { ComponentFixture, TestBed } from "@angular/core/testing";

import { ProgramStatus, ProgramStatusBadgeComponent } from "./program-status-badge.component";

describe("ProgramStatusBadgeComponent", () => {
  let component: ProgramStatusBadgeComponent;
  let fixture: ComponentFixture<ProgramStatusBadgeComponent>;

  const cases: Array<{ status: ProgramStatus; label: string }> = [
    { status: "draft", label: "Черновик" },
    { status: "pending_moderation", label: "На модерации" },
    { status: "published", label: "Опубликован" },
    { status: "rejected", label: "Отклонен" },
    { status: "completed", label: "Завершен" },
    { status: "frozen", label: "Заморожен" },
    { status: "archived", label: "Архивирован" },
  ];

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ProgramStatusBadgeComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(ProgramStatusBadgeComponent);
    component = fixture.componentInstance;
  });

  for (const item of cases) {
    it(`should render ${item.status} status`, () => {
      component.status = item.status;
      fixture.detectChanges();

      const badge: HTMLElement = fixture.nativeElement.querySelector(
        "[data-testid='program-status-badge']"
      );

      expect(badge.textContent?.trim()).toBe(item.label);
      expect(badge.classList).toContain(`program-status--${item.status}`);
    });
  }

  it("should apply selected size class", () => {
    component.status = "published";
    component.size = "small";
    fixture.detectChanges();

    const badge: HTMLElement = fixture.nativeElement.querySelector(
      "[data-testid='program-status-badge']"
    );

    expect(badge.classList).toContain("program-status--small");
  });
});
