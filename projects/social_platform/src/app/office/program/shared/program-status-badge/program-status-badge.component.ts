/** @format */

import { ChangeDetectionStrategy, Component, Input } from "@angular/core";
import { NgClass } from "@angular/common";

export type ProgramStatus =
  | "draft"
  | "pending_moderation"
  | "published"
  | "rejected"
  | "completed"
  | "frozen"
  | "archived";

export type ProgramStatusBadgeSize = "small" | "medium";

const STATUS_LABELS: Record<ProgramStatus, string> = {
  draft: "Черновик",
  pending_moderation: "На модерации",
  published: "Опубликован",
  rejected: "На доработке",
  completed: "Завершен",
  frozen: "Заморожен",
  archived: "Архивирован",
};

@Component({
  selector: "app-program-status-badge",
  standalone: true,
  imports: [NgClass],
  templateUrl: "./program-status-badge.component.html",
  styleUrl: "./program-status-badge.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProgramStatusBadgeComponent {
  @Input({ required: true }) status!: ProgramStatus;
  @Input() size: ProgramStatusBadgeSize = "medium";

  get label(): string {
    return STATUS_LABELS[this.status];
  }
}
