/** @format */

import { Injectable, computed, signal } from "@angular/core";
import { Observable } from "rxjs";
import { Program } from "@office/program/models/program.model";

export interface ProgramEditTabController {
  tabKey: string;
  save: () => Observable<Program>;
  reset: () => void;
}

@Injectable()
export class ProgramEditStateService {
  readonly savedProgram = signal<Program | null>(null);
  readonly program = signal<Program | null>(null);
  readonly hasChanges = signal(false);
  readonly currentTabHasChanges = signal(false);
  readonly isCurrentFormValid = signal(true);
  readonly isCurrentTabReadonly = signal(false);
  readonly isSaving = signal(false);
  readonly lastSavedAt = signal<Date | null>(null);
  readonly saveError = signal(false);

  private controller: ProgramEditTabController | null = null;
  private dirtyTabs: Record<string, boolean> = {};
  private tabDrafts = new Map<string, unknown>();
  private tabProgramPatches = new Map<string, Partial<Program>>();

  readonly canSave = computed(
    () =>
      this.currentTabHasChanges() &&
      this.isCurrentFormValid() &&
      !this.isCurrentTabReadonly() &&
      !this.isSaving()
  );

  setProgram(program: Program): void {
    this.savedProgram.set(program);
    this.program.set(program);
    this.clearDrafts();
  }

  updateProgram(program: Partial<Program>): void {
    this.program.set({ ...(this.program() ?? {}), ...program } as Program);
  }

  commitProgram(program: Program, tabKey?: string | null): void {
    this.savedProgram.set(program);

    if (tabKey) {
      this.clearTabDraft(tabKey);
    }

    this.rebuildProgramDraft();
  }

  registerController(controller: ProgramEditTabController): void {
    this.controller = controller;
    this.currentTabHasChanges.set(Boolean(this.dirtyTabs[controller.tabKey]));
  }

  unregisterController(controller: ProgramEditTabController): void {
    if (this.controller === controller) {
      this.controller = null;
      this.currentTabHasChanges.set(false);
      this.isCurrentFormValid.set(true);
      this.isCurrentTabReadonly.set(false);
    }
  }

  activeTabKey(): string | null {
    return this.controller?.tabKey ?? null;
  }

  getTabDraft<T>(tabKey: string): T | null {
    return (this.tabDrafts.get(tabKey) as T | undefined) ?? null;
  }

  updateFormState(
    hasChanges: boolean,
    isValid: boolean,
    isReadonly: boolean,
    options: {
      tabKey?: string;
      draft?: unknown;
      programPatch?: Partial<Program>;
    } = {}
  ): void {
    const tabKey = options.tabKey ?? this.controller?.tabKey;

    if (tabKey) {
      this.dirtyTabs = {
        ...this.dirtyTabs,
        [tabKey]: hasChanges,
      };

      if (hasChanges) {
        if (options.draft !== undefined) {
          this.tabDrafts.set(tabKey, this.clone(options.draft));
        }

        if (options.programPatch) {
          this.tabProgramPatches.set(tabKey, this.clone(options.programPatch));
        }
      } else {
        this.clearTabDraft(tabKey);
      }

      this.currentTabHasChanges.set(
        this.controller?.tabKey === tabKey ? hasChanges : this.currentTabHasChanges()
      );
      this.rebuildProgramDraft();
    }

    this.hasChanges.set(this.hasAnyChanges());
    this.isCurrentFormValid.set(isValid);
    this.isCurrentTabReadonly.set(isReadonly);
    if (hasChanges) {
      this.saveError.set(false);
    }
  }

  saveCurrent(): Observable<Program> | null {
    return this.controller?.save() ?? null;
  }

  resetCurrent(): void {
    this.controller?.reset();
  }

  private clearTabDraft(tabKey: string): void {
    this.dirtyTabs = {
      ...this.dirtyTabs,
      [tabKey]: false,
    };
    this.tabDrafts.delete(tabKey);
    this.tabProgramPatches.delete(tabKey);
    this.hasChanges.set(this.hasAnyChanges());
    this.currentTabHasChanges.set(
      this.controller?.tabKey === tabKey ? false : this.currentTabHasChanges()
    );
  }

  private clearDrafts(): void {
    this.dirtyTabs = {};
    this.tabDrafts.clear();
    this.tabProgramPatches.clear();
    this.hasChanges.set(false);
    this.currentTabHasChanges.set(false);
    this.saveError.set(false);
  }

  private hasAnyChanges(): boolean {
    return Object.values(this.dirtyTabs).some(Boolean);
  }

  private rebuildProgramDraft(): void {
    const savedProgram = this.savedProgram();
    if (!savedProgram) {
      return;
    }

    const draft = Array.from(this.tabProgramPatches.entries()).reduce<Program>(
      (acc, [tabKey, patch]) => (this.dirtyTabs[tabKey] ? ({ ...acc, ...patch } as Program) : acc),
      { ...savedProgram } as Program
    );
    this.program.set(draft);
  }

  private clone<T>(value: T): T {
    if (value === undefined || value === null) {
      return value;
    }

    return JSON.parse(JSON.stringify(value)) as T;
  }
}
