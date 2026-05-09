/** @format */

import { Injectable } from "@angular/core";
import { BehaviorSubject, Observable } from "rxjs";

export type WizardStep = 1 | 2 | 3;
export type RegistrationType = "internal" | "external";
export type AutosaveStatus = "idle" | "saving" | "saved" | "error";

export interface WizardBasicInfo {
  name: string;
  description: string;
  datetimeStarted: string;
  datetimeRegistrationEnds: string;
  datetimeProjectSubmissionEnds: string;
  datetimeFinished: string;
  city: string;
}

export interface WizardRegistration {
  isPrivate: boolean;
  registrationType: RegistrationType | null;
  registrationLink: string;
}

export interface WizardState extends WizardBasicInfo, WizardRegistration {
  draftId: number | null;
  currentStep: WizardStep;
  isDirty: boolean;
}

export type WizardStepValidity = Record<WizardStep, boolean>;

const INITIAL_STATE: WizardState = {
  name: "",
  description: "",
  datetimeStarted: "",
  datetimeRegistrationEnds: "",
  datetimeProjectSubmissionEnds: "",
  datetimeFinished: "",
  city: "",
  isPrivate: false,
  registrationType: "internal",
  registrationLink: "",
  draftId: null,
  currentStep: 1,
  isDirty: false,
};

@Injectable()
export class WizardStateService {
  private readonly stateSubject = new BehaviorSubject<WizardState>({ ...INITIAL_STATE });
  private readonly validitySubject = new BehaviorSubject<WizardStepValidity>({
    1: false,
    2: true,
    3: true,
  });

  getState(): Observable<WizardState> {
    return this.stateSubject.asObservable();
  }

  getValidity(): Observable<WizardStepValidity> {
    return this.validitySubject.asObservable();
  }

  get snapshot(): WizardState {
    return this.stateSubject.value;
  }

  get validitySnapshot(): WizardStepValidity {
    return this.validitySubject.value;
  }

  updateBasicInfo(data: Partial<WizardBasicInfo>, markDirty = true): void {
    this.patchState(data, markDirty);
  }

  updateRegistration(data: Partial<WizardRegistration>, markDirty = true): void {
    this.patchState(data, markDirty);
  }

  setDraftId(id: number): void {
    this.patchState({ draftId: id }, false);
  }

  setCurrentStep(step: WizardStep): void {
    this.patchState({ currentStep: step }, false);
  }

  setStepValidity(step: WizardStep, isValid: boolean): void {
    this.validitySubject.next({
      ...this.validitySubject.value,
      [step]: isValid,
    });
  }

  markSaved(): void {
    this.patchState({ isDirty: false }, false);
  }

  markDirty(): void {
    this.patchState({ isDirty: true }, false);
  }

  reset(): void {
    this.stateSubject.next({ ...INITIAL_STATE });
    this.validitySubject.next({ 1: false, 2: true, 3: true });
  }

  hasBasicInfo(): boolean {
    const state = this.snapshot;

    return Boolean(
      state.name &&
        state.description &&
        state.datetimeStarted &&
        state.datetimeRegistrationEnds &&
        state.datetimeProjectSubmissionEnds &&
        state.datetimeFinished &&
        state.city
    );
  }

  hasRegistration(): boolean {
    const state = this.snapshot;

    return state.registrationType === "internal";
  }

  canSubmitToModeration(): boolean {
    return this.hasBasicInfo() && this.hasRegistration();
  }

  private patchState(data: Partial<WizardState>, markDirty: boolean): void {
    this.stateSubject.next({
      ...this.stateSubject.value,
      ...data,
      isDirty: markDirty ? true : data.isDirty ?? this.stateSubject.value.isDirty,
    });
  }
}
