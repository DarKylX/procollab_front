/** @format */

import { ChangeDetectionStrategy, Component, Input } from "@angular/core";
import { Program } from "@office/program/models/program.model";
import { ProgramStats } from "@office/program/services/program.service";
import { IconComponent } from "@ui/components";

interface StatCard {
  title: string;
  value: string;
  subtitle: string;
  icon: string;
  tone: "accent" | "green" | "gold" | "pink";
}

@Component({
  selector: "app-program-stat-cards",
  standalone: true,
  imports: [IconComponent],
  templateUrl: "./program-stat-cards.component.html",
  styleUrl: "./program-stat-cards.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProgramStatCardsComponent {
  @Input({ required: true }) program!: Program;
  @Input() stats?: ProgramStats | null;
  @Input() publicOnly = false;

  get cards(): StatCard[] {
    const participantsCount = this.resolveNumber(
      this.stats?.participantsCount,
      this.program.participantsCount,
      this.program.participants?.length
    );
    const projectsCount = this.resolveNumber(this.stats?.projectsCount, this.program.projectsCount);
    const expertsCount = this.resolveNumber(
      this.stats?.expertsCount,
      this.program.expertsCount,
      this.program.experts?.length
    );
    const cards: StatCard[] = [
      {
        title: "Участники",
        value: this.publicOnly ? "" : String(participantsCount),
        subtitle: this.publicOnly
          ? `${participantsCount} участников`
          : this.deltaSubtitle(
              this.stats?.participantsDeltaWeek ?? this.program.participantsDeltaWeek
            ),
        icon: "people-bold",
        tone: "accent",
      },
      {
        title: "Проекты",
        value: String(projectsCount),
        subtitle: this.projectsSubtitle,
        icon: "projects",
        tone: "green",
      },
      {
        title: "Эксперты",
        value: String(expertsCount),
        subtitle: `назначено ${expertsCount}`,
        icon: "medal",
        tone: "gold",
      },
      {
        title: this.publicOnly ? "Текущий этап" : "Статус",
        value: this.publicOnly ? "" : this.stageValue,
        subtitle: this.publicOnly ? this.stageValue : this.stageSubtitle,
        icon: "program",
        tone: "pink",
      },
    ];

    return this.publicOnly ? [cards[0], cards[3]] : cards;
  }

  private get projectsSubtitle(): string {
    const activeProjects = this.resolveNumber(
      this.stats?.activeProjectsCount,
      this.program.activeProjectsCount
    );

    return activeProjects > 0 ? `${activeProjects} активных` : "";
  }

  private get stageValue(): string {
    if (this.isFinished) {
      return "Завершен";
    }

    if (this.registrationOpen) {
      return "Регистрация";
    }

    if (this.projectSubmissionOpen) {
      return "Прием проектов";
    }

    return "оценка проектов";
  }

  private get stageSubtitle(): string {
    if (this.isFinished) {
      return this.program.datetimeFinished
        ? new Date(this.program.datetimeFinished).toLocaleDateString("ru-RU")
        : "";
    }

    if (this.registrationOpen) {
      return "открыта";
    }

    if (this.projectSubmissionOpen) {
      return "идет";
    }

    return "в процессе";
  }

  private get isFinished(): boolean {
    return this.program.datetimeFinished
      ? Date.now() > Date.parse(this.program.datetimeFinished)
      : false;
  }

  private get registrationOpen(): boolean {
    return (
      this.program.status === "published" &&
      Boolean(this.program.datetimeRegistrationEnds) &&
      Date.now() <= Date.parse(this.program.datetimeRegistrationEnds)
    );
  }

  private get projectSubmissionOpen(): boolean {
    return (
      Boolean(this.program.datetimeProjectSubmissionEnds) &&
      Date.now() <= Date.parse(this.program.datetimeProjectSubmissionEnds)
    );
  }

  private resolveNumber(...values: Array<number | undefined>): number {
    const numericValues = values.filter((item): item is number => typeof item === "number");

    return numericValues.find(value => value > 0) ?? numericValues[0] ?? 0;
  }

  private deltaSubtitle(value?: number): string {
    if (!value || value <= 0) {
      return "";
    }

    return `+${value} за неделю`;
  }
}
