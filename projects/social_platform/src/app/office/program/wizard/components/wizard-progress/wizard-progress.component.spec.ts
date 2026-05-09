/** @format */

import { ComponentFixture, TestBed } from "@angular/core/testing";
import { By } from "@angular/platform-browser";
import { WizardProgressComponent } from "./wizard-progress.component";

describe("WizardProgressComponent", () => {
  let fixture: ComponentFixture<WizardProgressComponent>;
  let component: WizardProgressComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [WizardProgressComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(WizardProgressComponent);
    component = fixture.componentInstance;
    component.currentStep = 2;
    fixture.detectChanges();
  });

  it("should render current step", () => {
    const activeStep = fixture.debugElement.query(By.css(".wizard-progress__step--active"));

    expect(activeStep.nativeElement.textContent).toContain("Регистрация");
  });

  it("should emit only completed step clicks", () => {
    spyOn(component.stepSelected, "emit");

    const buttons = fixture.debugElement.queryAll(By.css(".wizard-progress__step"));
    buttons[0].nativeElement.click();
    buttons[1].nativeElement.click();

    expect(component.stepSelected.emit).toHaveBeenCalledOnceWith(1);
  });
});
