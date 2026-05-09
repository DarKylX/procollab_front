/** @format */

import { ChangeDetectionStrategy, Component, Input, OnChanges } from "@angular/core";
import { RouterLink } from "@angular/router";
import { Program } from "@office/program/models/program.model";
import { ProgramCardComponent } from "../../../shared/program-card/program-card.component";
import { VerificationBannerComponent } from "../../components/verification-banner/verification-banner.component";

interface ProgramSection {
  title: string;
  programs: Program[];
  showReadiness: boolean;
}

@Component({
  selector: "app-my-programs",
  standalone: true,
  imports: [RouterLink, ProgramCardComponent, VerificationBannerComponent],
  templateUrl: "./my-programs.component.html",
  styleUrl: "./my-programs.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MyProgramsComponent implements OnChanges {
  @Input() programs: Program[] = [];
  showArchive = false;
  activeSections: ProgramSection[] = [];
  archivePrograms: Program[] = [];
  isEmpty = true;

  ngOnChanges(): void {
    this.rebuildSections();
  }

  private rebuildSections(): void {
    const sections: ProgramSection[] = [
      {
        title: "Черновики и на модерации",
        programs: this.programs.filter(
          program =>
            program.isUserManager &&
            ["draft", "pending_moderation", "rejected"].includes(program.status ?? "")
        ),
        showReadiness: true,
      },
      {
        title: "Опубликованные",
        programs: this.programs.filter(
          program =>
            program.isUserManager && ["published", "frozen"].includes(program.status ?? "published")
        ),
        showReadiness: true,
      },
      {
        title: "Где я эксперт",
        programs: this.programs.filter(program => program.isUserExpert),
        showReadiness: false,
      },
      {
        title: "Где я участвую",
        programs: this.programs.filter(program => program.isUserMember),
        showReadiness: false,
      },
    ];

    this.activeSections = sections.filter(section => section.programs.length);
    this.archivePrograms = this.programs.filter(program =>
      ["completed", "archived"].includes(program.status ?? "")
    );
    this.isEmpty = !this.activeSections.length && !this.archivePrograms.length;
  }
}
