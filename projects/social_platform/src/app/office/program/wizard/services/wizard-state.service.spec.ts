/** @format */

import { WizardStateService } from "./wizard-state.service";

describe("WizardStateService", () => {
  let service: WizardStateService;

  beforeEach(() => {
    service = new WizardStateService();
  });

  it("should keep basic info and mark state as dirty", () => {
    service.updateBasicInfo({
      name: "Case championship",
      description: "Description long enough for moderation",
      datetimeStarted: "2026-06-01",
      datetimeRegistrationEnds: "2026-05-25",
      datetimeProjectSubmissionEnds: "2026-06-05",
      datetimeFinished: "2026-06-20",
      city: "Онлайн",
    });

    expect(service.snapshot.name).toBe("Case championship");
    expect(service.snapshot.isDirty).toBeTrue();
    expect(service.hasBasicInfo()).toBeTrue();
  });

  it("should keep access type and registration internal only in the wizard", () => {
    service.updateRegistration({
      isPrivate: true,
      registrationType: "external",
      registrationLink: "",
    });

    expect(service.snapshot.isPrivate).toBeTrue();
    expect(service.hasRegistration()).toBeFalse();

    service.updateRegistration({
      isPrivate: false,
      registrationType: "internal",
      registrationLink: "",
    });

    expect(service.snapshot.isPrivate).toBeFalse();
    expect(service.hasRegistration()).toBeTrue();
  });

  it("should reset state", () => {
    service.updateBasicInfo({ name: "Draft" });
    service.setDraftId(7);
    service.reset();

    expect(service.snapshot.name).toBe("");
    expect(service.snapshot.draftId).toBeNull();
    expect(service.snapshot.currentStep).toBe(1);
  });
});
