/** @format */

import { CommonModule } from "@angular/common";
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  DestroyRef,
  OnDestroy,
  OnInit,
  inject,
} from "@angular/core";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { FormBuilder, ReactiveFormsModule, Validators } from "@angular/forms";
import { Observable, forkJoin, map, of, switchMap, tap, throwError } from "rxjs";
import { ProgramDraftPayload } from "@office/program/models/program-draft.model";
import { Program } from "@office/program/models/program.model";
import {
  ProgramCriterion,
  ProgramExpert,
  ProgramService,
} from "@office/program/services/program.service";
import { IconComponent } from "@ui/components";
import {
  ProgramEditStateService,
  ProgramEditTabController,
} from "../../services/program-edit-state.service";

type CriterionType = "scale_1_10" | "scale_1_5" | "boolean";
type ProjectsAvailability = "all_users" | "experts_only";

interface EvaluationCriterion {
  id: string;
  sourceId?: number;
  name: string;
  type: CriterionType;
  minValue: number;
  maxValue: number;
  weight: number;
  description: string;
}

interface ExpertItem {
  id: string;
  userId?: number;
  name: string;
  company: string;
  email: string;
  avatar?: string;
}

interface CriteriaSnapshot {
  settings: {
    isCompetitive: boolean;
    isDistributedEvaluation: boolean;
    maxProjectRates: number;
    projectsAvailability: ProjectsAvailability;
    autoDistribution: boolean;
  };
  criteria: EvaluationCriterion[];
  experts: ExpertItem[];
}

interface CriteriaDraft {
  snapshot: CriteriaSnapshot;
  initialSnapshot: string;
}

@Component({
  selector: "app-program-edit-criteria",
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, IconComponent],
  templateUrl: "./program-edit-criteria.component.html",
  styleUrl: "./program-edit-criteria.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProgramEditCriteriaComponent implements OnInit, OnDestroy {
  private readonly fb = inject(FormBuilder);
  private readonly destroyRef = inject(DestroyRef);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly editState = inject(ProgramEditStateService);
  private readonly programService = inject(ProgramService);
  private readonly tabKey = "criteria";

  readonly settingsForm = this.fb.nonNullable.group({
    isCompetitive: [true],
    isDistributedEvaluation: [true],
    maxProjectRates: [3, [Validators.required, Validators.min(1), Validators.max(99)]],
    projectsAvailability: ["all_users" as ProjectsAvailability, [Validators.required]],
    autoDistribution: [true],
  });

  readonly criterionForm = this.fb.nonNullable.group({
    name: ["", [Validators.required, Validators.maxLength(120)]],
    description: ["", [Validators.required, Validators.maxLength(240)]],
    type: ["scale_1_10" as CriterionType, [Validators.required]],
    minValue: [1, [Validators.required, Validators.min(0), Validators.max(999)]],
    maxValue: [10, [Validators.required, Validators.min(1), Validators.max(999)]],
    weight: [10, [Validators.required, Validators.min(1), Validators.max(100)]],
  });

  readonly criterionTypes: Array<{ value: CriterionType; label: string }> = [
    { value: "scale_1_10", label: "Шкала 1-10" },
    { value: "scale_1_5", label: "Шкала 1-5" },
    { value: "boolean", label: "Да / нет" },
  ];

  readonly controller: ProgramEditTabController = {
    tabKey: this.tabKey,
    save: () => this.save(),
    reset: () => this.reset(),
  };

  criteria: EvaluationCriterion[] = [];
  experts: ExpertItem[] = [];
  expertCandidates: ExpertItem[] = [];
  expertSearch = "";
  expertSearchOpen = false;
  criterionEditorOpen = false;
  editingCriterionId: string | null = null;
  criterionFormSubmitted = false;
  selectedCandidateId: string | null = null;

  private initialSnapshot = "";
  private criterionSeed = 0;

  ngOnInit(): void {
    const draft = this.editState.getTabDraft<CriteriaDraft>(this.tabKey);
    const snapshot = draft?.snapshot ?? this.createSnapshotFromProgram(this.program);
    this.applySnapshot(snapshot);
    this.initialSnapshot = draft?.initialSnapshot ?? this.serializeSnapshot(snapshot);
    this.applyReadonly();

    this.editState.registerController(this.controller);
    this.syncState();
    if (!draft) {
      this.loadApiState();
    }

    this.settingsForm.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(value => {
      if (
        this.program?.status === "published" &&
        this.hasSubmittedProjects &&
        this.editState.savedProgram()?.isCompetitive &&
        !value.isCompetitive
      ) {
        this.settingsForm.controls.isCompetitive.setValue(true, { emitEvent: false });
        value = { ...value, isCompetitive: true };
      }

      if (!value.isCompetitive) {
        this.settingsForm.patchValue(
          { isDistributedEvaluation: false, autoDistribution: false, maxProjectRates: 1 },
          { emitEvent: false }
        );
      }
      this.syncState();
      this.cdr.markForCheck();
    });

    this.settingsForm.statusChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      this.syncState();
      this.cdr.markForCheck();
    });

    this.criterionForm.controls.type.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(type => {
        if (type === "boolean") {
          this.criterionForm.patchValue({ minValue: 0, maxValue: 1 }, { emitEvent: false });
        }

        if (type === "scale_1_10") {
          this.criterionForm.patchValue({ minValue: 1, maxValue: 10 }, { emitEvent: false });
        }

        if (type === "scale_1_5") {
          this.criterionForm.patchValue({ minValue: 1, maxValue: 5 }, { emitEvent: false });
        }

        this.cdr.markForCheck();
      });
  }

  ngOnDestroy(): void {
    this.editState.unregisterController(this.controller);
  }

  get program(): Program | null {
    return this.editState.program();
  }

  get isReadonly(): boolean {
    const status = this.program?.status;
    return status === "pending_moderation" || status === "frozen" || status === "archived";
  }

  get isCompetitiveEnabled(): boolean {
    return this.settingsForm.controls.isCompetitive.value;
  }

  get hasSubmittedProjects(): boolean {
    const program = this.program;
    return Boolean((program?.activeProjectsCount ?? 0) > 0 || (program?.projectsCount ?? 0) > 0);
  }

  get criterionEditorTitle(): string {
    return this.editingCriterionId ? "Редактирование критерия" : "Новый критерий";
  }

  get criterionActionText(): string {
    return this.editingCriterionId ? "Сохранить критерий" : "Добавить критерий";
  }

  get totalWeight(): number {
    return this.criteria.reduce((sum, criterion) => sum + Number(criterion.weight || 0), 0);
  }

  get visibleExpertCandidates(): ExpertItem[] {
    const assigned = new Set(this.experts.map(expert => this.expertKey(expert)));
    return this.expertCandidates.filter(candidate => !assigned.has(this.expertKey(candidate)));
  }

  get selectedExpertCandidate(): ExpertItem | null {
    return (
      this.visibleExpertCandidates.find(candidate => candidate.id === this.selectedCandidateId) ??
      this.visibleExpertCandidates[0] ??
      null
    );
  }

  criterionTypeLabel(type: CriterionType): string {
    return this.criterionTypes.find(criterionType => criterionType.value === type)?.label ?? type;
  }

  openCreateCriterion(): void {
    if (this.isReadonly || !this.isCompetitiveEnabled) {
      return;
    }

    this.criterionEditorOpen = true;
    this.editingCriterionId = null;
    this.criterionFormSubmitted = false;
    this.criterionForm.reset({
      name: "",
      description: "",
      type: "scale_1_10",
      minValue: 1,
      maxValue: 10,
      weight: 10,
    });
    this.cdr.markForCheck();
  }

  openEditCriterion(criterion: EvaluationCriterion): void {
    if (this.isReadonly || !this.isCompetitiveEnabled) {
      return;
    }

    this.criterionEditorOpen = true;
    this.editingCriterionId = criterion.id;
    this.criterionFormSubmitted = false;
    this.criterionForm.reset({
      name: criterion.name,
      description: criterion.description,
      type: criterion.type,
      minValue: criterion.minValue,
      maxValue: criterion.maxValue,
      weight: criterion.weight,
    });
    this.cdr.markForCheck();
  }

  cancelCriterionEditor(): void {
    this.criterionEditorOpen = false;
    this.editingCriterionId = null;
    this.criterionFormSubmitted = false;
    this.cdr.markForCheck();
  }

  saveCriterion(): void {
    this.criterionFormSubmitted = true;

    if (this.criterionForm.invalid || this.hasRangeError() || this.isReadonly) {
      this.criterionForm.markAllAsTouched();
      this.cdr.markForCheck();
      return;
    }

    const value = this.criterionForm.getRawValue();
    const existing = this.criteria.find(item => item.id === this.editingCriterionId);
    const criterion: EvaluationCriterion = {
      id: this.editingCriterionId ?? this.createCriterionId(value.name),
      sourceId: existing?.sourceId,
      name: value.name.trim(),
      description: value.description.trim(),
      type: value.type,
      minValue: value.minValue,
      maxValue: value.maxValue,
      weight: value.weight,
    };

    this.criteria = existing
      ? this.criteria.map(item => (item.id === existing.id ? criterion : item))
      : [...this.criteria, criterion];

    this.cancelCriterionEditor();
    this.syncState();
    this.cdr.markForCheck();
  }

  removeCriterion(criterion: EvaluationCriterion): void {
    if (this.isReadonly) {
      return;
    }

    this.criteria = this.criteria.filter(item => item.id !== criterion.id);
    this.cancelCriterionEditor();
    this.syncState();
    this.cdr.markForCheck();
  }

  updateExpertSearch(value: string): void {
    this.expertSearch = value;
    this.selectedCandidateId = null;
    this.loadExpertCandidates(value);
  }

  openExpertSearch(): void {
    if (this.isReadonly || !this.isCompetitiveEnabled) {
      return;
    }

    this.expertSearchOpen = true;
    this.loadExpertCandidates(this.expertSearch);
  }

  closeExpertSearch(): void {
    this.expertSearchOpen = false;
    this.expertSearch = "";
    this.selectedCandidateId = null;
    this.expertCandidates = [];
    this.cdr.markForCheck();
  }

  selectExpertCandidate(candidate: ExpertItem): void {
    if (this.isReadonly) {
      return;
    }

    this.selectedCandidateId = candidate.id;
    this.cdr.markForCheck();
  }

  addSelectedExpert(): void {
    const candidate = this.selectedExpertCandidate;
    if (!candidate || this.isReadonly || !this.isCompetitiveEnabled) {
      return;
    }

    this.experts = [...this.experts, { ...candidate }];
    this.closeExpertSearch();
    this.syncState();
    this.cdr.markForCheck();
  }

  removeExpert(expert: ExpertItem): void {
    if (this.isReadonly) {
      return;
    }

    this.experts = this.experts.filter(item => item.id !== expert.id);
    this.syncState();
    this.cdr.markForCheck();
  }

  hasCriterionError(controlName: keyof typeof this.criterionForm.controls): boolean {
    const control = this.criterionForm.controls[controlName];
    return control.invalid && (control.dirty || control.touched || this.criterionFormSubmitted);
  }

  hasRangeError(): boolean {
    const value = this.criterionForm.getRawValue();
    return value.maxValue <= value.minValue;
  }

  private save(): Observable<Program> {
    this.settingsForm.markAllAsTouched();
    this.syncState();

    const programId = this.program?.id;
    if (!programId || this.settingsForm.invalid || this.isReadonly) {
      return throwError(() => new Error("Invalid criteria form"));
    }

    const snapshot = this.createCurrentSnapshot();
    const payload: ProgramDraftPayload = {
      isCompetitive: snapshot.settings.isCompetitive,
      isDistributedEvaluation:
        snapshot.settings.isCompetitive && snapshot.settings.isDistributedEvaluation,
      maxProjectRates: snapshot.settings.isCompetitive ? snapshot.settings.maxProjectRates : 1,
      projectsAvailability: snapshot.settings.projectsAvailability,
    };

    return this.programService.update(programId, payload).pipe(
      switchMap(program => this.syncApiChanges(programId).pipe(map(() => program))),
      switchMap(program =>
        forkJoin({
          criteria: this.programService.getCriteria(programId),
          experts: this.programService.getProgramExperts(programId),
        }).pipe(
          map(({ criteria, experts }) => {
            this.criteria = criteria.map(item => this.mapCriterionFromApi(item));
            this.experts = experts.map(item => this.mapExpertFromApi(item));
            return program;
          })
        )
      ),
      tap(program => {
        const savedSnapshot = this.createCurrentSnapshot();
        this.initialSnapshot = this.serializeSnapshot(savedSnapshot);
        this.editState.updateFormState(false, this.settingsForm.valid, this.isReadonly);
        this.editState.updateProgram({
          ...program,
          isCompetitive: payload.isCompetitive,
          isDistributedEvaluation: payload.isDistributedEvaluation,
          maxProjectRates: payload.maxProjectRates,
          projectsAvailability: payload.projectsAvailability,
          expertsCount: this.experts.length,
          experts: this.experts
            .filter(expert => expert.userId)
            .map(expert => ({ id: expert.userId ?? 0 })),
        });
      })
    );
  }

  private reset(): void {
    this.applySnapshot(JSON.parse(this.initialSnapshot) as CriteriaSnapshot);
    this.cancelCriterionEditor();
    this.closeExpertSearch();
    this.syncState();
    this.cdr.markForCheck();
  }

  private loadApiState(): void {
    const programId = this.program?.id;
    if (!programId) {
      return;
    }

    forkJoin({
      criteria: this.programService.getCriteria(programId),
      experts: this.programService.getProgramExperts(programId),
    })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(({ criteria, experts }) => {
        this.criteria = criteria.map(item => this.mapCriterionFromApi(item));
        this.experts = experts.map(item => this.mapExpertFromApi(item));
        const snapshot = this.createCurrentSnapshot();
        this.initialSnapshot = this.serializeSnapshot(snapshot);
        this.syncState();
        this.cdr.markForCheck();
      });
  }

  private loadExpertCandidates(query = ""): void {
    const programId = this.program?.id;
    if (!programId) {
      return;
    }

    this.programService
      .searchProgramExperts(programId, query)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(candidates => {
        this.expertCandidates = candidates.map(item => this.mapExpertFromApi(item));
        this.cdr.markForCheck();
      });
  }

  private syncApiChanges(programId: number): Observable<unknown[]> {
    const initial = JSON.parse(this.initialSnapshot) as CriteriaSnapshot;
    const initialCriteriaById = new Map(
      initial.criteria.filter(item => item.sourceId).map(item => [item.sourceId, item])
    );
    const currentCriteriaById = new Map(
      this.criteria.filter(item => item.sourceId).map(item => [item.sourceId, item])
    );
    const operations: Observable<unknown>[] = [];

    this.criteria.forEach(criterion => {
      const payload = this.mapCriterionToApi(criterion);
      if (!criterion.sourceId) {
        operations.push(this.programService.createCriterion(programId, payload));
        return;
      }

      const initialCriterion = initialCriteriaById.get(criterion.sourceId);
      if (
        initialCriterion &&
        JSON.stringify(this.mapCriterionToApi(initialCriterion)) !== JSON.stringify(payload)
      ) {
        operations.push(
          this.programService.updateCriterion(programId, criterion.sourceId, payload)
        );
      }
    });

    initial.criteria.forEach(criterion => {
      if (criterion.sourceId && !currentCriteriaById.has(criterion.sourceId)) {
        operations.push(this.programService.deleteCriterion(programId, criterion.sourceId));
      }
    });

    const initialExpertIds = new Set(
      initial.experts.map(expert => expert.userId).filter((id): id is number => Boolean(id))
    );
    const currentExpertIds = new Set(
      this.experts.map(expert => expert.userId).filter((id): id is number => Boolean(id))
    );

    currentExpertIds.forEach(userId => {
      if (!initialExpertIds.has(userId)) {
        operations.push(this.programService.addProgramExpert(programId, userId));
      }
    });

    initialExpertIds.forEach(userId => {
      if (!currentExpertIds.has(userId)) {
        operations.push(this.programService.deleteProgramExpert(programId, userId));
      }
    });

    return operations.length ? forkJoin(operations) : of([]);
  }

  private applySnapshot(snapshot: CriteriaSnapshot): void {
    this.settingsForm.patchValue(snapshot.settings, { emitEvent: false });
    this.settingsForm.markAsPristine();
    this.criteria = snapshot.criteria.map(criterion => ({ ...criterion }));
    this.experts = snapshot.experts.map(expert => ({ ...expert }));
  }

  private createSnapshotFromProgram(program: Program | null): CriteriaSnapshot {
    return {
      settings: {
        isCompetitive: program?.isCompetitive ?? true,
        isDistributedEvaluation: program?.isDistributedEvaluation ?? true,
        maxProjectRates: program?.maxProjectRates ?? 3,
        projectsAvailability:
          program?.projectsAvailability === "experts_only" ? "experts_only" : "all_users",
        autoDistribution: program?.isDistributedEvaluation ?? true,
      },
      criteria: [],
      experts: [],
    };
  }

  private createCurrentSnapshot(): CriteriaSnapshot {
    const value = this.settingsForm.getRawValue();

    return {
      settings: {
        isCompetitive: value.isCompetitive,
        isDistributedEvaluation: value.isDistributedEvaluation,
        maxProjectRates: value.maxProjectRates,
        projectsAvailability: value.projectsAvailability,
        autoDistribution: value.autoDistribution,
      },
      criteria: this.criteria.map(criterion => ({ ...criterion })),
      experts: this.experts.map(expert => ({ ...expert })),
    };
  }

  private serializeSnapshot(snapshot: CriteriaSnapshot): string {
    return JSON.stringify(snapshot);
  }

  private syncState(): void {
    const snapshot = this.createCurrentSnapshot();
    const dirty = this.serializeSnapshot(snapshot) !== this.initialSnapshot;

    this.editState.updateFormState(dirty, this.settingsForm.valid, this.isReadonly, {
      tabKey: this.tabKey,
      draft: {
        snapshot,
        initialSnapshot: this.initialSnapshot,
      } satisfies CriteriaDraft,
      programPatch: {
        isCompetitive: snapshot.settings.isCompetitive,
        isDistributedEvaluation:
          snapshot.settings.isCompetitive && snapshot.settings.isDistributedEvaluation,
        maxProjectRates: snapshot.settings.isCompetitive ? snapshot.settings.maxProjectRates : 1,
        projectsAvailability: snapshot.settings.projectsAvailability,
        expertsCount: snapshot.experts.length,
        experts: snapshot.experts
          .filter(expert => expert.userId)
          .map(expert => ({ id: expert.userId ?? 0 })),
      },
    });
  }

  private applyReadonly(): void {
    if (this.isReadonly) {
      this.settingsForm.disable({ emitEvent: false });
      this.criterionForm.disable({ emitEvent: false });
      return;
    }

    this.settingsForm.enable({ emitEvent: false });
    this.criterionForm.enable({ emitEvent: false });
  }

  private mapCriterionFromApi(criterion: ProgramCriterion): EvaluationCriterion {
    const type =
      criterion.type === "bool"
        ? "boolean"
        : criterion.minValue === 1 && criterion.maxValue === 5
          ? "scale_1_5"
          : "scale_1_10";

    return {
      id: `criterion-${criterion.id}`,
      sourceId: criterion.id,
      name: criterion.name,
      description: criterion.description ?? "",
      type,
      minValue: criterion.minValue ?? (type === "boolean" ? 0 : 1),
      maxValue: criterion.maxValue ?? (type === "scale_1_5" ? 5 : 10),
      weight: criterion.weight,
    };
  }

  private mapCriterionToApi(criterion: EvaluationCriterion): ProgramCriterion {
    if (criterion.type === "boolean") {
      return {
        name: criterion.name,
        description: criterion.description,
        type: "bool",
        minValue: null,
        maxValue: null,
        weight: criterion.weight,
      };
    }

    return {
      name: criterion.name,
      description: criterion.description,
      type: "int",
      minValue: criterion.type === "scale_1_5" ? 1 : criterion.minValue,
      maxValue: criterion.type === "scale_1_5" ? 5 : criterion.maxValue,
      weight: criterion.weight,
    };
  }

  private mapExpertFromApi(expert: ProgramExpert): ExpertItem {
    return {
      id: `expert-${expert.userId}`,
      userId: expert.userId,
      name: expert.fullName,
      company: expert.organization || "PROCOLLAB",
      email: expert.email,
      avatar: expert.avatar,
    };
  }

  private expertKey(expert: ExpertItem): string {
    return expert.userId ? `user-${expert.userId}` : expert.email.toLowerCase() || expert.id;
  }

  private createCriterionId(name: string): string {
    this.criterionSeed += 1;

    return `criterion-${name
      .trim()
      .toLowerCase()
      .replace(/[^a-zа-я0-9]+/gi, "-")
      .replace(/^-|-$/g, "")}-${Date.now()}-${this.criterionSeed}`;
  }
}
