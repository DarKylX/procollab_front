/** @format */

import { ChangeDetectionStrategy, Component, EventEmitter, Input, OnChanges, Output } from "@angular/core";
import { RouterLink } from "@angular/router";
import { Program } from "@office/program/models/program.model";

const STORAGE_KEY = "verification_banner_closed_at";
const HIDE_DAYS = 7;

@Component({
  selector: "app-verification-banner",
  standalone: true,
  imports: [RouterLink],
  templateUrl: "./verification-banner.component.html",
  styleUrl: "./verification-banner.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VerificationBannerComponent implements OnChanges {
  @Input() programs: Program[] = [];
  @Output() closed = new EventEmitter<void>();

  showDetails = false;
  private targetProgram: Program | null = null;
  private temporarilyClosed = false;

  ngOnChanges(): void {
    this.temporarilyClosed = this.isTemporarilyClosed();
    this.targetProgram =
      [...this.programs]
        .filter(
          program =>
            program.isUserManager &&
            program.verificationStatus !== "verified" &&
            program.status !== "archived"
        )
        .sort((a, b) => b.id - a.id)[0] ?? null;
  }

  get shouldShow(): boolean {
    return Boolean(!this.temporarilyClosed && this.targetProgram);
  }

  get verificationLink(): string[] {
    const program = this.targetProgram;
    return program
      ? ["/office/program", String(program.id), "edit", "verification"]
      : ["/office/program"];
  }

  close(): void {
    localStorage.setItem(STORAGE_KEY, new Date().toISOString());
    this.temporarilyClosed = true;
    this.closed.emit();
  }

  toggleDetails(): void {
    this.showDetails = !this.showDetails;
  }

  private isTemporarilyClosed(): boolean {
    const closedAt = localStorage.getItem(STORAGE_KEY);

    if (!closedAt) {
      return false;
    }

    const closedTime = Date.parse(closedAt);
    const hideMs = HIDE_DAYS * 24 * 60 * 60 * 1000;

    return Number.isFinite(closedTime) && Date.now() - closedTime < hideMs;
  }
}
