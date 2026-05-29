/** @format */

import { ChangeDetectionStrategy, Component, Input, OnChanges, OnInit } from "@angular/core";
import { Program } from "@office/program/models/program.model";
import { AvatarComponent } from "@ui/components/avatar/avatar.component";
import { DatePipe } from "@angular/common";
import { ReadinessWidgetComponent } from "../../readiness-widget/readiness-widget.component";
import { ReadinessChecklist, ReadinessData } from "../../models/readiness.model";
import {
  ProgramStatus,
  ProgramStatusBadgeComponent,
} from "../program-status-badge/program-status-badge.component";

type ProgramWithParticipantCounters = Program & {
  is_verified?: boolean;
  verification_status?: string;
  participants_count?: number;
  participantCount?: number;
  participantTotal?: number;
  participantsTotal?: number;
  registrationsCount?: number;
  registeredParticipantsCount?: number;
  registeredUsersCount?: number;
  membersCount?: number;
  members_count?: number;
  members?: unknown[];
  registrations?: unknown[];
};

/**
 * Компонент карточки программы
 *
 * Отображает краткую информацию о программе в виде карточки для списков.
 * Используется на главной странице программ и в других местах, где нужно
 * показать превью программы.
 *
 * Принимает:
 * @Input program?: Program - Объект программы для отображения
 *
 * Отображает:
 * - Изображение программы (аватар)
 * - Название программы
 * - Краткое описание
 * - Даты проведения (отформатированные)
 * - Иконки и дополнительную информацию
 *
 * Использует:
 * - AvatarComponent для отображения изображения
 * - IconComponent для иконок
 * - DatePipe как альтернативный форматтер дат
 *
 * Возвращает:
 * HTML шаблон карточки программы с базовой информацией
 */
@Component({
  selector: "app-program-card",
  templateUrl: "./program-card.component.html",
  styleUrl: "./program-card.component.scss",
  standalone: true,
  imports: [AvatarComponent, DatePipe, ReadinessWidgetComponent, ProgramStatusBadgeComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProgramCardComponent implements OnInit, OnChanges {
  constructor() {}

  @Input({ required: true }) program?: Program;
  @Input() showReadiness = false;
  @Input() showRegistrationDeadline = false;
  @Input() showProjectsAndExperts = true;
  @Input() showStatus = true;
  readinessData: ReadinessData | null = null;

  ngOnInit(): void {
    this.updateDerivedState();
  }

  ngOnChanges(): void {
    this.updateDerivedState();
  }

  private updateDerivedState(): void {
    if (this.program) {
      this.registerDateExpired = Date.now() > Date.parse(this.program.datetimeRegistrationEnds);
    }
    this.readinessData = this.buildReadinessData();
  }

  registerDateExpired?: boolean;

  get isVerified(): boolean {
    const program = this.program as ProgramWithParticipantCounters | undefined;

    return program?.isVerified === true || program?.is_verified === true;
  }

  get showVerificationStatus(): boolean {
    return Boolean(this.program && !this.isVerified);
  }

  get verificationStatusLabel(): string {
    const program = this.program as ProgramWithParticipantCounters | undefined;
    if (!program?.isUserManager) {
      return "Компания не верифицирована";
    }

    const status = program?.verificationStatus ?? program?.verification_status ?? "not_requested";
    const labels: Record<string, string> = {
      not_requested: "Компания не верифицирована",
      pending: "Верификация на рассмотрении",
      rejected: "Верификация отклонена",
      revoked: "Верификация отозвана",
      verified: "Официальная компания",
    };

    return labels[status] ?? "Компания не верифицирована";
  }

  get showStatusBadge(): boolean {
    return Boolean(
      this.showStatus &&
        this.program?.isUserManager &&
        ["draft", "pending_moderation", "rejected", "published", "frozen"].includes(
          this.program.status ?? ""
        )
    );
  }

  get programStatus(): ProgramStatus {
    return (this.program?.status ?? "draft") as ProgramStatus;
  }

  get programFormatLabel(): string {
    const value = (this.program?.city || "").trim().toLowerCase();
    if (!value) {
      return "";
    }
    return value === "онлайн" || value === "online" ? "Онлайн" : "Оффлайн";
  }

  get participantsCount(): string {
    return this.formatCount(this.resolvedParticipantsCount);
  }

  get participantsLabel(): string {
    return this.pluralize(this.resolvedParticipantsCount, ["участник", "участника", "участников"]);
  }

  private get resolvedParticipantsCount(): number {
    const program = this.program as ProgramWithParticipantCounters | undefined;

    return this.resolveFirstActualCount([
      program?.participantsCount,
      program?.participants_count,
      program?.participantCount,
      program?.participantTotal,
      program?.participantsTotal,
      program?.registrationsCount,
      program?.registeredParticipantsCount,
      program?.registeredUsersCount,
      program?.membersCount,
      program?.members_count,
      program?.participants?.length,
      program?.members?.length,
      program?.registrations?.length,
    ]);
  }

  get projectsCount(): string {
    return this.formatCount(this.program?.projectsCount);
  }

  get expertsCount(): string {
    return this.formatCount(this.program?.expertsCount ?? this.program?.experts?.length);
  }

  private buildReadinessData(): ReadinessData | null {
    const checklist = this.program?.readiness;

    if (!checklist) {
      return null;
    }

    const requiredKeys = ["basic_info", "dates", "registration", "legal_terms"];
    const percentage = this.weightedReadinessPercentage(checklist);
    const moderationPercentage = this.readinessPercentage(checklist, requiredKeys);
    const missingRequiredSections = requiredKeys.filter(key => checklist[key] !== true);

    return {
      readinessPercent: percentage,
      readiness_percent: percentage,
      percentage,
      checklist,
      labels: {},
      missingRequiredSections,
      missing_required_sections: missingRequiredSections,
      canSubmitToModeration: false,
      can_submit_to_moderation: false,
      readinessToModeration: {
        percentage: moderationPercentage,
        checklist,
        requiredKeys,
        missingRequiredSections,
        missing_required_sections: missingRequiredSections,
        isReady: requiredKeys.every(key => checklist[key] === true),
      },
    };
  }

  private formatCount(value?: number): string {
    return String(value ?? 0);
  }

  private pluralize(value: number, forms: [string, string, string]): string {
    const absoluteValue = Math.abs(value);
    const lastTwoDigits = absoluteValue % 100;
    const lastDigit = absoluteValue % 10;

    if (lastTwoDigits >= 11 && lastTwoDigits <= 14) {
      return forms[2];
    }

    if (lastDigit === 1) {
      return forms[0];
    }

    if (lastDigit >= 2 && lastDigit <= 4) {
      return forms[1];
    }

    return forms[2];
  }

  private resolveFirstActualCount(values: (number | undefined)[]): number {
    const numericValues = values.filter((value): value is number => typeof value === "number");

    return numericValues.find(value => value > 0) ?? numericValues[0] ?? 0;
  }

  private readinessPercentage(checklist: ReadinessChecklist, requiredKeys: string[]): number {
    const completed = requiredKeys.filter(key => checklist[key] === true).length;

    return Math.round((completed / requiredKeys.length) * 100);
  }

  private weightedReadinessPercentage(checklist: ReadinessChecklist): number {
    const weights: Record<string, number> = {
      basic_info: 20,
      dates: 15,
      registration: 15,
      legal_terms: 15,
      materials: 10,
      criteria_experts: 10,
      visual_assets: 5,
      verification: 5,
      certificate_template: 5,
    };

    return Object.entries(weights).reduce((sum, [key, weight]) => {
      const value = checklist[key];
      return value === true || value === "not_applicable" ? sum + weight : sum;
    }, 0);
  }
}
