/** @format */

import {
  ChangeDetectionStrategy,
  Component,
  ErrorHandler,
  EventEmitter,
  Input,
  OnChanges,
  OnInit,
  Output,
  SimpleChanges,
  computed,
  inject,
  signal,
} from "@angular/core";
import { NgClass, NgStyle } from "@angular/common";
import { finalize } from "rxjs";

import {
  ReadinessChecklistItem,
  ReadinessData,
  ReadinessSection,
} from "@office/program/models/readiness.model";
import { ProgramService } from "@office/program/services/program.service";

export type ReadinessWidgetSize = "small" | "medium" | "large";
export type ReadinessChecklistMode = "default" | "edit";

const DEFAULT_READINESS_LABELS: Record<string, string> = {
  basic_info: "Основная информация",
  dates: "Сроки и формат",
  registration: "Регистрация",
  legal_terms: "Правовые документы",
  legalTerms: "Правовые документы",
  materials: "Материалы",
  criteria_experts: "Критерии и эксперты",
  visual_assets: "Основная обложка",
  certificate_template: "Сертификат",
  verification: "Верификация",
};

const EDIT_READINESS_ITEMS: { key: string; label: string; sourceKeys: string[] }[] = [
  { key: "basic_info", label: "Основная информация", sourceKeys: ["basic_info"] },
  { key: "dates", label: "Сроки и формат", sourceKeys: ["dates"] },
  { key: "registration", label: "Регистрация", sourceKeys: ["registration"] },
  { key: "legal_terms", label: "Правовые документы", sourceKeys: ["legal_terms"] },
  { key: "materials", label: "Материалы", sourceKeys: ["materials"] },
  {
    key: "criteria_experts",
    label: "Критерии и эксперты",
    sourceKeys: ["criteria_experts"],
  },
  { key: "visual_assets", label: "Основная обложка", sourceKeys: ["visual_assets"] },
  { key: "verification", label: "Верификация · необязательно", sourceKeys: ["verification"] },
  {
    key: "certificate_template",
    label: "Сертификат · необязательно",
    sourceKeys: ["certificate_template"],
  },
];
const MODERATION_READINESS_KEYS = ["basic_info", "dates", "registration", "legal_terms"];

@Component({
  selector: "app-readiness-widget",
  standalone: true,
  imports: [NgClass, NgStyle],
  templateUrl: "./readiness-widget.component.html",
  styleUrl: "./readiness-widget.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReadinessWidgetComponent implements OnInit, OnChanges {
  private readonly programService = inject(ProgramService);
  private readonly errorHandler = inject(ErrorHandler);

  @Input({ required: true }) programId!: number;
  @Input() size: ReadinessWidgetSize = "medium";
  @Input() showLabels = true;
  @Input() checklistMode: ReadinessChecklistMode = "default";
  @Input() framed = true;
  @Input() initialData?: ReadinessData | null;

  @Output() blockClicked = new EventEmitter<string>();

  readonly isLoading = signal(false);
  readonly hasError = signal(false);
  readonly data = signal<ReadinessData | null>(null);

  readonly percentage = computed(() => {
    const readinessData = this.data();
    if (!readinessData) {
      return 0;
    }

    return this.normalizePercentage(
      readinessData.readinessPercent ??
        readinessData.readiness_percent ??
        readinessData.percentage ??
        0
    );
  });

  readonly checklistItems = computed<ReadinessChecklistItem[]>(() => {
    const readinessData = this.data();
    if (!readinessData) {
      return [];
    }

    const backendSections = this.backendSections(readinessData);

    if (this.checklistMode === "edit") {
      if (backendSections.length) {
        return backendSections.map(section => this.sectionToChecklistItem(section, readinessData));
      }

      return EDIT_READINESS_ITEMS.map(item => ({
        key: item.key,
        label: item.label,
        completed: item.sourceKeys.every(key =>
          this.isCompleted(this.checklistValue(readinessData, key))
        ),
        optional: item.key === "verification" || item.key === "certificate_template",
        notApplicable: item.sourceKeys.some(
          key => this.checklistValue(readinessData, key) === "not_applicable"
        ),
      }));
    }

    const backendRequiredSections = backendSections.filter(section =>
      this.isModerationBlockingSection(section, readinessData)
    );
    if (backendRequiredSections.length) {
      return backendRequiredSections.map(section =>
        this.sectionToChecklistItem(section, readinessData)
      );
    }

    const moderationReadiness =
      readinessData.readinessToModeration ?? readinessData.readiness_to_moderation;
    const labelSource = {
      ...DEFAULT_READINESS_LABELS,
      ...readinessData.labels,
      ...moderationReadiness?.labels,
    };
    const backendKeys =
      moderationReadiness?.requiredKeys ??
      moderationReadiness?.required_keys ??
      MODERATION_READINESS_KEYS;
    const keys = backendKeys.filter(key => MODERATION_READINESS_KEYS.includes(key));

    return keys.map(key => ({
      key,
      label: labelSource[key],
      completed: this.isCompleted(
        this.checklistValue(readinessData, key, moderationReadiness?.checklist)
      ),
      notApplicable:
        this.checklistValue(readinessData, key, moderationReadiness?.checklist) ===
        "not_applicable",
    }));
  });

  readonly progressStyle = computed(() => ({
    "--readiness-progress": `${this.percentage() * 3.6}deg`,
  }));

  ngOnInit(): void {
    if (this.initialData) {
      this.data.set(this.initialData);
      return;
    }

    this.refresh();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes["initialData"] && this.initialData) {
      this.data.set(this.initialData);
      this.isLoading.set(false);
      this.hasError.set(false);
      return;
    }

    if (changes["programId"] && !changes["programId"].firstChange) {
      if (this.initialData) {
        return;
      }
      this.refresh();
    }
  }

  refresh(): void {
    if (!this.programId) {
      return;
    }

    this.isLoading.set(true);
    this.hasError.set(false);

    this.programService
      .getReadiness(this.programId)
      .pipe(finalize(() => this.isLoading.set(false)))
      .subscribe({
        next: readinessData => this.data.set(readinessData),
        error: error => {
          this.hasError.set(true);
          this.errorHandler.handleError(error);
        },
      });
  }

  onBlockClick(item: ReadinessChecklistItem): void {
    if (item.completed || item.notApplicable) {
      return;
    }
    this.blockClicked.emit(item.key);
  }

  private isCompleted(value: unknown): boolean {
    return value === true || value === "not_applicable";
  }

  private backendSections(readinessData: ReadinessData): ReadinessSection[] {
    return Array.isArray(readinessData.sections) ? readinessData.sections : [];
  }

  private sectionToChecklistItem(
    section: ReadinessSection,
    readinessData: ReadinessData
  ): ReadinessChecklistItem {
    const value = this.checklistValue(readinessData, section.id);
    return {
      key: section.id,
      label: section.label || DEFAULT_READINESS_LABELS[section.id] || section.id,
      completed: section.isReady ?? section.is_ready ?? this.isCompleted(value),
      optional: !this.isModerationBlockingSection(section, readinessData),
      notApplicable: value === "not_applicable",
    };
  }

  private isModerationBlockingSection(
    section: ReadinessSection,
    readinessData: ReadinessData
  ): boolean {
    const requiredSections =
      readinessData.requiredSections ??
      readinessData.required_sections ??
      readinessData.readinessToModeration?.requiredKeys ??
      readinessData.readiness_to_moderation?.required_keys ??
      MODERATION_READINESS_KEYS;
    const blockingFlag = section.blockingForModeration ?? section.blocking_for_moderation;

    return blockingFlag ?? requiredSections.includes(section.id);
  }

  private checklistValue(
    readinessData: ReadinessData,
    key: string,
    checklist = readinessData.checklist
  ): unknown {
    return checklist[key] ?? checklist[this.camelizeKey(key)];
  }

  private camelizeKey(key: string): string {
    return key.replace(/_([a-z])/g, (_, char: string) => char.toUpperCase());
  }

  private normalizePercentage(value: number): number {
    if (!Number.isFinite(value)) {
      return 0;
    }
    return Math.min(100, Math.max(0, Math.round(value)));
  }
}
