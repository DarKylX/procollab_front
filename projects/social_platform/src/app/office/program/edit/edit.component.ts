/** @format */

import { CommonModule } from "@angular/common";
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  DestroyRef,
  OnInit,
  inject,
  signal,
} from "@angular/core";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import {
  ActivatedRoute,
  NavigationEnd,
  Router,
  RouterLink,
  RouterLinkActive,
  RouterOutlet,
} from "@angular/router";
import { catchError, filter, finalize, of, switchMap, tap, throwError } from "rxjs";
import { Program } from "@office/program/models/program.model";
import {
  OperationalReadinessItem,
  ReadinessChecklist,
  ReadinessChecklistItem,
  ReadinessData,
  ReadinessSection,
  ReadinessStageData,
} from "@office/program/models/readiness.model";
import { ProgramDataService } from "@office/program/services/program-data.service";
import { ProgramService } from "@office/program/services/program.service";
import { ProgramRole, RoleResolverService } from "@office/program/services/role-resolver.service";
import {
  ProgramStatus,
  ProgramStatusBadgeComponent,
} from "@office/program/shared/program-status-badge/program-status-badge.component";
import { ButtonComponent, IconComponent } from "@ui/components";
import { SnackbarService } from "@ui/services/snackbar.service";
import { ProgramEditStateService } from "./services/program-edit-state.service";

interface ProgramEditTab {
  key: string;
  label: string;
  route: string;
}

const READINESS_ROUTE_MAP: Record<string, string> = {
  basic_info: "main",
  basicInfo: "main",
  dates: "schedule",
  materials: "materials",
  registration: "registration",
  legal_terms: "registration",
  legalTerms: "registration",
  criteria_experts: "criteria",
  criteriaExperts: "criteria",
  visual_assets: "main",
  visualAssets: "main",
  verification: "verification",
  certificate_template: "certificate",
  certificateTemplate: "certificate",
};

const FALLBACK_READINESS_LABELS: Record<string, string> = {
  basic_info: "Основная информация",
  basicInfo: "Основная информация",
  dates: "Сроки и формат",
  registration: "Регистрация",
  legal_terms: "Правовые документы",
  legalTerms: "Правовые документы",
  materials: "Материалы",
  criteria_experts: "Критерии и эксперты",
  criteriaExperts: "Критерии и эксперты",
  visual_assets: "Обложка и визуальные материалы",
  visualAssets: "Обложка и визуальные материалы",
  verification: "Верификация",
  certificate_template: "Сертификат",
  certificateTemplate: "Сертификат",
};

const MODERATION_READINESS_KEYS = ["basic_info", "dates", "registration", "legal_terms"];

const TAB_TO_FIX_SECTION_KEYS: Record<string, string[]> = {
  main: ["basic_info", "visual_assets"],
  schedule: ["dates"],
  registration: ["registration", "legal_terms"],
  criteria: ["criteria_experts"],
  materials: ["materials"],
  verification: ["verification"],
  certificate: ["certificate_template"],
};

@Component({
  selector: "app-program-edit",
  standalone: true,
  imports: [
    CommonModule,
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    ButtonComponent,
    IconComponent,
    ProgramStatusBadgeComponent,
  ],
  providers: [ProgramEditStateService],
  templateUrl: "./edit.component.html",
  styleUrl: "./edit.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProgramEditComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly roleResolver = inject(RoleResolverService);
  private readonly programService = inject(ProgramService);
  private readonly programDataService = inject(ProgramDataService);
  private readonly snackbar = inject(SnackbarService);

  readonly editState = inject(ProgramEditStateService);

  readonly tabs: ProgramEditTab[] = [
    { key: "main", label: "Основная информация", route: "main" },
    { key: "schedule", label: "Сроки и формат", route: "schedule" },
    { key: "registration", label: "Регистрация", route: "registration" },
    { key: "criteria", label: "Критерии и эксперты", route: "criteria" },
    { key: "materials", label: "Материалы", route: "materials" },
    { key: "verification", label: "Верификация", route: "verification" },
    { key: "certificate", label: "Сертификат", route: "certificate" },
  ];

  roles: ProgramRole[] = [];
  activeRoute = "main";
  showAccessHelp = false;
  isSubmittingModeration = false;
  readonly readinessData = signal<ReadinessData | null>(null);
  readonly fixedRevisionSections = signal<string[]>([]);

  ngOnInit(): void {
    this.route.data
      .pipe(
        tap(data => this.initProgram(data["data"] as Program)),
        switchMap(data =>
          this.roleResolver.getRole((data["data"] as Program).id, data["data"] as Program)
        ),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe(roles => {
        this.roles = roles;
        this.guardEditAccess();
        this.cdr.markForCheck();
      });

    this.router.events
      .pipe(
        filter((event): event is NavigationEnd => event instanceof NavigationEnd),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe(event => {
        this.activeRoute = this.getActiveRoute(event.urlAfterRedirects);
        this.cdr.markForCheck();
      });

    this.activeRoute = this.getActiveRoute(this.router.url);
  }

  get program(): Program | null {
    return this.editState.program();
  }

  get programStatus(): ProgramStatus {
    return (this.program?.status ?? "draft") as ProgramStatus;
  }

  get isGlobalReadonly(): boolean {
    const status = this.program?.status;
    return status === "pending_moderation" || status === "frozen" || status === "archived";
  }

  get editAccessText(): string {
    if (this.program?.status === "pending_moderation") {
      return "только просмотр";
    }

    if (this.program?.status === "frozen") {
      return "только просмотр";
    }

    if (this.program?.status === "archived") {
      return "только просмотр";
    }

    if (this.program?.status === "published") {
      return "доступно с ограничениями";
    }

    return "доступно";
  }

  get verificationStatus(): string {
    return this.program?.verificationStatus ?? "not_requested";
  }

  get verificationStatusLabel(): string {
    const labels: Record<string, string> = {
      not_requested: "Не запрошена",
      pending: "На рассмотрении",
      verified: "Подтверждена",
      rejected: "Отклонена",
      revoked: "Отозвана",
    };
    return labels[this.verificationStatus] ?? this.verificationStatus;
  }

  get autosaveText(): string {
    if (this.editState.saveError()) {
      return "Не удалось сохранить изменения";
    }

    if (this.editState.isSaving()) {
      return "Сохранение…";
    }

    if (this.editState.hasChanges()) {
      return "Есть несохраненные изменения";
    }

    const lastSavedAt = this.editState.lastSavedAt();
    if (lastSavedAt) {
      return `Изменения сохранены · ${this.formatRelativeSavedTime(lastSavedAt)}`;
    }

    return "Изменений нет";
  }

  get canShowSubmitToModeration(): boolean {
    return this.program?.status === "draft" || this.program?.status === "rejected";
  }

  get canSubmitToModeration(): boolean {
    const readiness = this.readinessData();
    const backendCanSubmit =
      readiness?.canSubmitToModeration ?? readiness?.can_submit_to_moderation ?? false;

    return Boolean(
      this.canShowSubmitToModeration && backendCanSubmit && !this.hasPendingRevisionSections
    );
  }

  get missingSectionsText(): string {
    const readiness = this.readinessData();
    const moderationReadiness = this.moderationReadiness;
    const missingSections =
      moderationReadiness?.missingRequiredSections ??
      moderationReadiness?.missing_required_sections ??
      readiness?.missingRequiredSections ??
      readiness?.missing_required_sections ??
      [];

    if (!missingSections.length) {
      return "";
    }

    return missingSections
      .map(key => this.readinessLabel(key, moderationReadiness?.labels))
      .join(", ");
  }

  get activeRejection() {
    return this.program?.status === "rejected" ? this.program?.moderationResult ?? null : null;
  }

  get sectionsToFix(): string[] {
    return this.activeRejection?.sectionsToFix ?? [];
  }

  get pendingRevisionSections(): string[] {
    if (this.program?.status !== "rejected" || !this.sectionsToFix.length) {
      return [];
    }

    return this.sectionsToFix.filter(section => !this.isRevisionSectionFixed(section));
  }

  get revisionMissingText(): string {
    return this.pendingRevisionSections.map(key => this.readinessLabel(key)).join(", ");
  }

  get hasPendingRevisionSections(): boolean {
    return this.pendingRevisionSections.length > 0;
  }

  get submitButtonText(): string {
    if (this.isSubmittingModeration) {
      return "Отправляем...";
    }

    return this.program?.status === "rejected"
      ? "Повторно отправить на модерацию"
      : "Отправить на модерацию";
  }

  get moderationReadiness(): ReadinessStageData | null {
    const readiness = this.readinessData();
    return readiness?.readinessToModeration ?? readiness?.readiness_to_moderation ?? null;
  }

  get operationalReadiness(): (ReadinessStageData & { items?: OperationalReadinessItem[] }) | null {
    const readiness = this.readinessData();
    return readiness?.operationalReadiness ?? readiness?.operational_readiness ?? null;
  }

  get moderationReadinessPercentage(): number {
    const readiness = this.readinessData();
    return (
      readiness?.readinessPercent ?? readiness?.readiness_percent ?? readiness?.percentage ?? 0
    );
  }

  get moderationReadinessItems(): ReadinessChecklistItem[] {
    const readiness = this.readinessData();
    const backendSections = this.backendReadinessSections();

    if (backendSections.length) {
      return backendSections
        .filter(section => this.isModerationBlockingSection(section))
        .map(section => this.sectionToChecklistItem(section));
    }

    const moderationReadiness = this.moderationReadiness;
    const checklist = moderationReadiness?.checklist ?? readiness?.checklist ?? {};
    const backendKeys =
      moderationReadiness?.requiredKeys ??
      moderationReadiness?.required_keys ??
      MODERATION_READINESS_KEYS;
    const keys = backendKeys.filter(key => MODERATION_READINESS_KEYS.includes(key));

    return keys.map(key => ({
      key,
      label: this.readinessLabel(key, moderationReadiness?.labels),
      completed: this.checklistValue(checklist, key) === true,
    }));
  }

  get optionalReadinessItems(): ReadinessChecklistItem[] {
    const backendSections = this.backendReadinessSections();
    if (backendSections.length) {
      return backendSections
        .filter(section => !this.isModerationBlockingSection(section))
        .map(section => ({
          ...this.sectionToChecklistItem(section),
          optional: true,
        }));
    }

    const operationalReadiness = this.operationalReadiness;
    const items = operationalReadiness?.items ?? [];

    return items
      .filter(
        item =>
          item.optional &&
          (item.key === "certificate_template" || item.key === "certificateTemplate")
      )
      .map(item => ({
        key: item.key,
        label: item.label || this.readinessLabel(item.key, operationalReadiness?.labels),
        completed: item.completed,
        optional: true,
        notApplicable: item.notApplicable ?? item.not_applicable,
      }));
  }

  hasRole(role: ProgramRole): boolean {
    return this.roles.includes(role);
  }

  save(): void {
    if (!this.editState.canSave()) {
      return;
    }

    const request$ = this.editState.saveCurrent();
    if (!request$) {
      return;
    }

    const activeTabKey = this.editState.activeTabKey() ?? this.activeRoute;
    this.editState.isSaving.set(true);
    request$
      .pipe(
        tap(program => {
          this.editState.commitProgram(program, activeTabKey);
          const mergedProgram = this.editState.program();
          if (mergedProgram) {
            this.programDataService.setProgram(mergedProgram);
          }
          this.markRevisionSectionsFixed(activeTabKey);
          this.editState.lastSavedAt.set(new Date());
          this.editState.saveError.set(false);
          this.refreshReadiness();
          this.snackbar.success("Изменения сохранены");
        }),
        catchError(error => {
          this.editState.saveError.set(true);
          this.snackbar.error("Не удалось сохранить изменения");
          return throwError(() => error);
        }),
        finalize(() => {
          this.editState.isSaving.set(false);
          this.cdr.markForCheck();
        }),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe({ error: () => undefined });
  }

  reset(): void {
    this.editState.resetCurrent();
  }

  toggleAccessHelp(): void {
    this.showAccessHelp = !this.showAccessHelp;
  }

  withdrawModeration(): void {
    const programId = this.program?.id;
    if (!programId) {
      return;
    }

    this.programService
      .withdrawFromModeration(programId)
      .pipe(
        catchError(() => {
          this.snackbar.error("Не удалось отозвать модерацию");
          return of(null);
        }),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe(program => {
        if (!program) {
          return;
        }

        this.editState.updateProgram(program);
        const mergedProgram = this.editState.program();
        if (mergedProgram) {
          this.programDataService.setProgram(mergedProgram);
        }
        this.refreshReadiness();
        this.snackbar.success("Модерация отозвана");
        this.cdr.markForCheck();
      });
  }

  submitToModeration(): void {
    const programId = this.program?.id;
    const isRepeatSubmission = this.program?.status === "rejected";
    const revisionStorageKey = this.program ? this.revisionStorageKey(this.program) : "";
    if (!programId || !this.canSubmitToModeration || this.isSubmittingModeration) {
      return;
    }

    this.isSubmittingModeration = true;
    this.programService
      .submitToModeration(programId)
      .pipe(
        catchError(error => {
          const missingSections =
            error?.error?.missing_required_sections ?? error?.error?.missingRequiredSections ?? [];
          const message =
            Array.isArray(missingSections) && missingSections.length
              ? `Заполните обязательные разделы: ${missingSections
                  .map(key => this.readinessLabel(key))
                  .join(", ")}`
              : error?.error?.detail || "Не удалось отправить чемпионат на модерацию";
          this.snackbar.error(message);
          return throwError(() => error);
        }),
        finalize(() => {
          this.isSubmittingModeration = false;
          this.cdr.markForCheck();
        }),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe({
        next: program => {
          this.editState.updateProgram(program);
          const mergedProgram = this.editState.program();
          if (mergedProgram) {
            this.programDataService.setProgram(mergedProgram);
          }
          this.clearFixedRevisionSections(revisionStorageKey);
          this.refreshReadiness();
          this.snackbar.success(
            isRepeatSubmission
              ? "Чемпионат повторно отправлен на модерацию"
              : "Чемпионат отправлен на модерацию"
          );
        },
        error: () => undefined,
      });
  }

  onReadinessBlockClick(key: string): void {
    const route = READINESS_ROUTE_MAP[key] ?? "main";
    const programId = this.program?.id;
    if (!programId) {
      return;
    }

    this.router.navigate(["/office/program", programId, "edit", route]);
  }

  isSectionToFix(key: string): boolean {
    const camelKey = this.camelizeKey(key);
    return this.sectionsToFix.some(section => section === key || section === camelKey);
  }

  isRevisionSectionFixed(key: string): boolean {
    const camelKey = this.camelizeKey(key);
    return this.fixedRevisionSections().some(section => section === key || section === camelKey);
  }

  rejectionDateText(): string {
    const rawDate = this.activeRejection?.rejectedAt ?? this.activeRejection?.createdAt;
    return rawDate ? new Date(rawDate).toLocaleString("ru-RU") : "";
  }

  canDeactivate(): boolean {
    if (!this.editState.hasChanges()) {
      return true;
    }

    return window.confirm("У вас есть несохраненные изменения. Выйти без сохранения?");
  }

  private initProgram(program: Program): void {
    this.editState.setProgram(program);
    this.programDataService.setProgram(program);
    this.loadFixedRevisionSections(program);
    this.refreshReadiness();
  }

  private guardEditAccess(): void {
    const programId = this.program?.id;
    if (!programId || this.hasRole("organizer") || this.hasRole("admin")) {
      return;
    }

    this.snackbar.error("У вас нет прав на редактирование чемпионата");
    this.router.navigate(["/office/program", programId]);
  }

  private getActiveRoute(url: string): string {
    return this.tabs.find(tab => url.includes(`/edit/${tab.route}`))?.key ?? "main";
  }

  private formatRelativeSavedTime(date: Date): string {
    const diffSeconds = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));

    if (diffSeconds < 60) {
      return `${diffSeconds || 1} сек назад`;
    }

    const diffMinutes = Math.floor(diffSeconds / 60);
    return `${diffMinutes} мин назад`;
  }

  private refreshReadiness(): void {
    const programId = this.program?.id;
    if (!programId) {
      return;
    }

    this.programService
      .getReadiness(programId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(readiness => {
        this.readinessData.set(readiness);
        this.cdr.markForCheck();
      });
  }

  readinessLabel(key: string, labels?: Record<string, string>): string {
    const readiness = this.readinessData();
    const camelKey = this.camelizeKey(key);
    return (
      labels?.[key] ??
      labels?.[camelKey] ??
      readiness?.labels?.[key] ??
      readiness?.labels?.[camelKey] ??
      FALLBACK_READINESS_LABELS[key] ??
      FALLBACK_READINESS_LABELS[camelKey] ??
      key
    );
  }

  private checklistValue(
    checklist: ReadinessChecklist,
    key: string
  ): boolean | "not_applicable" | undefined {
    const camelKey = this.camelizeKey(key);
    return checklist[key] ?? checklist[camelKey];
  }

  private backendReadinessSections(): ReadinessSection[] {
    const readiness = this.readinessData();
    return readiness && Array.isArray(readiness.sections) ? readiness.sections : [];
  }

  private sectionToChecklistItem(section: ReadinessSection): ReadinessChecklistItem {
    return {
      key: section.id,
      label: section.label || this.readinessLabel(section.id),
      completed: section.isReady ?? section.is_ready ?? false,
      notApplicable:
        this.checklistValue(this.readinessData()?.checklist ?? {}, section.id) === "not_applicable",
    };
  }

  private isModerationBlockingSection(section: ReadinessSection): boolean {
    const readiness = this.readinessData();
    const requiredSections =
      readiness?.requiredSections ??
      readiness?.required_sections ??
      this.moderationReadiness?.requiredKeys ??
      this.moderationReadiness?.required_keys ??
      MODERATION_READINESS_KEYS;
    const blockingFlag = section.blockingForModeration ?? section.blocking_for_moderation;

    return blockingFlag ?? requiredSections.includes(section.id);
  }

  private camelizeKey(key: string): string {
    return key.replace(/_([a-z])/g, (_, char: string) => char.toUpperCase());
  }

  private markRevisionSectionsFixed(tabKey: string): void {
    if (this.program?.status !== "rejected" || !this.sectionsToFix.length) {
      return;
    }

    const tabSections = TAB_TO_FIX_SECTION_KEYS[tabKey] ?? [];
    const changedSections = this.sectionsToFix.filter(section =>
      tabSections.some(tabSection => this.sameSection(section, tabSection))
    );

    if (!changedSections.length) {
      return;
    }

    this.fixedRevisionSections.update(current => {
      const next = [...current];
      changedSections.forEach(section => {
        if (!next.some(item => this.sameSection(item, section))) {
          next.push(section);
        }
      });
      this.persistFixedRevisionSections(next);
      return next;
    });
  }

  private loadFixedRevisionSections(program: Program): void {
    if (program.status !== "rejected") {
      this.fixedRevisionSections.set([]);
      return;
    }

    const key = this.revisionStorageKey(program);
    if (!key) {
      this.fixedRevisionSections.set([]);
      return;
    }

    try {
      const rawValue = localStorage.getItem(key);
      const sections = rawValue ? JSON.parse(rawValue) : [];
      this.fixedRevisionSections.set(Array.isArray(sections) ? sections : []);
    } catch {
      this.fixedRevisionSections.set([]);
    }
  }

  private persistFixedRevisionSections(sections: string[]): void {
    const key = this.program ? this.revisionStorageKey(this.program) : "";
    if (!key) {
      return;
    }

    localStorage.setItem(key, JSON.stringify(sections));
  }

  private clearFixedRevisionSections(explicitKey = ""): void {
    const key = explicitKey || (this.program ? this.revisionStorageKey(this.program) : "");
    if (key) {
      localStorage.removeItem(key);
    }
    this.fixedRevisionSections.set([]);
  }

  private revisionStorageKey(program: Program): string {
    const rejectedAt = program.moderationResult?.rejectedAt ?? program.moderationResult?.createdAt;
    return rejectedAt ? `program-revision-fixed:${program.id}:${rejectedAt}` : "";
  }

  private sameSection(left: string, right: string): boolean {
    return left === right || this.camelizeKey(left) === this.camelizeKey(right);
  }
}
