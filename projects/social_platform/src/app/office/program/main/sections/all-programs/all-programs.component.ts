/** @format */

import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { RouterLink } from "@angular/router";
import { Program } from "@office/program/models/program.model";
import { ProgramCardComponent } from "../../../shared/program-card/program-card.component";
import { ModalComponent } from "@ui/components/modal/modal.component";

type RegistrationSort = "asc" | "desc" | "";
type ProgramFilterShape = Program & {
  datetime_registration_ends?: string;
  is_private?: boolean;
  is_verified?: boolean;
  verification_status?: string;
};

@Component({
  selector: "app-all-programs",
  standalone: true,
  imports: [FormsModule, RouterLink, ProgramCardComponent, ModalComponent],
  templateUrl: "./all-programs.component.html",
  styleUrl: "./all-programs.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AllProgramsComponent {
  @Input() programs: Program[] = [];
  @Input() verifiedOnly = false;
  @Input() registrationOpenOnly = false;
  @Input() registrationSort: RegistrationSort = "";
  @Input() loading = false;
  @Input() hasLoaded = false;
  @Output() verifiedOnlyChange = new EventEmitter<boolean>();
  @Output() registrationOpenOnlyChange = new EventEmitter<boolean>();
  @Output() registrationSortChange = new EventEmitter<RegistrationSort>();

  inviteCodeModalOpen = false;
  inviteCode = "";
  inviteCodeError = "";

  get filteredPrograms(): Program[] {
    const filtered = this.programs.filter(program => {
      const publicMatch = this.isPublicProgram(program);
      const verifiedMatch = !this.verifiedOnly || this.isVerifiedProgram(program);
      const registrationMatch = !this.registrationOpenOnly || this.isRegistrationOpen(program);

      return publicMatch && verifiedMatch && registrationMatch;
    });

    return this.sortByRegistrationEnd(filtered);
  }

  get registrationSortLabel(): string {
    if (this.registrationSort === "asc") {
      return "Регистрация раньше";
    }

    if (this.registrationSort === "desc") {
      return "Регистрация позже";
    }

    return "По дате регистрации";
  }

  toggleRegistrationSort(): void {
    const nextSort: RegistrationSort =
      this.registrationSort === "" ? "asc" : this.registrationSort === "asc" ? "desc" : "";
    this.registrationSort = nextSort;
    this.registrationSortChange.emit(nextSort);
  }

  onVerifiedOnlyToggle(checked: boolean): void {
    this.verifiedOnly = checked;
    this.verifiedOnlyChange.emit(checked);
  }

  onRegistrationOpenOnlyToggle(checked: boolean): void {
    this.registrationOpenOnly = checked;
    this.registrationOpenOnlyChange.emit(checked);
  }

  openInviteCodeModal(): void {
    this.inviteCode = "";
    this.inviteCodeError = "";
    this.inviteCodeModalOpen = true;
  }

  closeInviteCodeModal(): void {
    this.inviteCodeModalOpen = false;
    this.inviteCodeError = "";
  }

  continueInviteCode(): void {
    if (!this.inviteCode.trim()) {
      this.inviteCodeError = "Введите код приглашения";
      return;
    }

    this.closeInviteCodeModal();
  }

  private isPublicProgram(program: Program): boolean {
    const item = program as ProgramFilterShape;

    return (program.status ?? "published") === "published" && !(program.isPrivate ?? item.is_private);
  }

  private isVerifiedProgram(program: Program): boolean {
    const item = program as ProgramFilterShape;

    return program.isVerified === true || item.is_verified === true;
  }

  private isRegistrationOpen(program: Program): boolean {
    const registrationEndTime = this.getRegistrationEndTime(program);

    return Number.isFinite(registrationEndTime) && Date.now() <= registrationEndTime;
  }

  private sortByRegistrationEnd(programs: Program[]): Program[] {
    if (!this.registrationSort) {
      return programs;
    }

    const sortDirection = this.registrationSort === "asc" ? 1 : -1;

    return [...programs].sort(
      (a, b) => (this.getRegistrationEndTime(a) - this.getRegistrationEndTime(b)) * sortDirection
    );
  }

  private getRegistrationEndTime(program: Program): number {
    const item = program as ProgramFilterShape;
    const registrationEndTime = Date.parse(
      program.datetimeRegistrationEnds || item.datetime_registration_ends || ""
    );

    return Number.isFinite(registrationEndTime) ? registrationEndTime : Number.MAX_SAFE_INTEGER;
  }
}
