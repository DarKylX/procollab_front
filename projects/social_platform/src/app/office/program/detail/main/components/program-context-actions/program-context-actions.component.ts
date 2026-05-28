/** @format */

import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  DestroyRef,
  EventEmitter,
  Input,
  OnChanges,
  OnInit,
  Output,
  SimpleChanges,
  inject,
} from "@angular/core";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { DatePipe } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { RouterModule } from "@angular/router";
import { catchError, finalize, of } from "rxjs";
import { AuthService } from "@auth/services";
import { Project } from "@models/project.model";
import { Program } from "@office/program/models/program.model";
import { ProgramService } from "@office/program/services/program.service";
import { ProgramRole } from "@office/program/services/role-resolver.service";
import { ProjectService } from "@office/services/project.service";
import { ReadinessWidgetComponent } from "@office/program/readiness-widget/readiness-widget.component";
import { ProgramStatus } from "@office/program/shared/program-status-badge/program-status-badge.component";
import { SnackbarService } from "@ui/services/snackbar.service";
import { IconComponent } from "@ui/components";

interface ParticipantFileLink {
  title: string;
  caption: string;
  url: string;
}

interface ModerationFixSectionOption {
  key: string;
  label: string;
}

export interface ProgramRejectPayload {
  comment: string;
  sectionsToFix: string[];
}

const MODERATION_FIX_SECTION_OPTIONS: ModerationFixSectionOption[] = [
  { key: "basic_info", label: "Основная информация" },
  { key: "visual_assets", label: "Обложка и визуальные материалы" },
  { key: "dates", label: "Сроки и формат" },
  { key: "registration", label: "Регистрация" },
  { key: "legal_terms", label: "Правовые документы" },
  { key: "materials", label: "Материалы" },
  { key: "criteria_experts", label: "Критерии и эксперты" },
];

@Component({
  selector: "app-program-context-actions",
  standalone: true,
  imports: [DatePipe, FormsModule, RouterModule, ReadinessWidgetComponent, IconComponent],
  templateUrl: "./program-context-actions.component.html",
  styleUrl: "./program-context-actions.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProgramContextActionsComponent implements OnInit, OnChanges {
  private readonly authService = inject(AuthService);
  private readonly projectService = inject(ProjectService);
  private readonly programService = inject(ProgramService);
  private readonly snackbar = inject(SnackbarService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly cdr = inject(ChangeDetectorRef);

  @Input({ required: true }) program!: Program;
  @Input() roles: ProgramRole[] = [];
  @Input() canViewLists = false;
  @Input() managementOnly = false;

  @Output() submitModeration = new EventEmitter<void>();
  @Output() withdrawModeration = new EventEmitter<void>();
  @Output() approve = new EventEmitter<void>();
  @Output() reject = new EventEmitter<ProgramRejectPayload>();
  @Output() freeze = new EventEmitter<string>();
  @Output() restore = new EventEmitter<void>();
  @Output() archive = new EventEmitter<void>();
  @Output() support = new EventEmitter<void>();

  rejectComment = "";
  freezeComment = "";
  selectedSectionsToFix: string[] = [];
  readonly moderationFixSectionOptions = MODERATION_FIX_SECTION_OPTIONS;
  participantProject: Project | null = null;
  participantProjectLoading = false;
  participantProjectSubmitting = false;
  profileId: number | null = null;

  ngOnInit(): void {
    this.authService.profile.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(profile => {
      this.profileId = profile.id;
      this.loadParticipantProject();
    });
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes["program"] || changes["roles"]) {
      this.loadParticipantProject();
    }
  }

  get status(): ProgramStatus {
    return (this.program.status ?? "published") as ProgramStatus;
  }

  get registrationOpen(): boolean {
    return (
      this.status === "published" &&
      Boolean(this.program.datetimeRegistrationEnds) &&
      Date.now() <= Date.parse(this.program.datetimeRegistrationEnds)
    );
  }

  get projectSubmissionOpen(): boolean {
    return (
      Boolean(this.program.datetimeProjectSubmissionEnds) &&
      Date.now() <= Date.parse(this.program.datetimeProjectSubmissionEnds)
    );
  }

  get participantTeamName(): string {
    if (!this.participantProject?.name) {
      return "Проектная команда";
    }

    return `Проектная команда «${this.participantProject.name}»`;
  }

  get participantInviteCode(): string {
    const inviteId = this.participantProject?.inviteId;
    if (inviteId) {
      return `INV-${inviteId}`;
    }

    return `PC-${this.program.id}-${this.participantProject?.id ?? "TEAM"}`;
  }

  get participantRole(): string {
    const project = this.participantProject;
    if (!project || !this.profileId) {
      return "Участник";
    }

    if (project.leader === this.profileId) {
      return "Лидер проекта";
    }

    return (
      project.collaborators?.find(collaborator => collaborator.userId === this.profileId)?.role ||
      "Участник"
    );
  }

  get participantMembers() {
    return this.participantProject?.collaborators ?? [];
  }

  get participantProjectSubmitted(): boolean {
    return Boolean(
      this.program.participantProjectStatus === "submitted" ||
        this.participantProject?.partnerProgram?.submitted ||
        this.participantProject?.partnerProgram?.isSubmitted
    );
  }

  get participantProjectStatusLabel(): string {
    return this.participantProjectSubmitted ? "Сдан" : "Не сдан";
  }

  get participantProjectRelationId(): number | null {
    return this.participantProject?.partnerProgram?.programLinkId ?? null;
  }

  get participantProjectFiles(): ParticipantFileLink[] {
    const project = this.participantProject;
    if (!project) {
      return [];
    }

    const files: ParticipantFileLink[] = [];

    if (project.presentationAddress) {
      files.push({
        title: "Презентация проекта",
        caption: this.fileCaption(project.presentationAddress),
        url: project.presentationAddress,
      });
    }

    (project.links ?? []).slice(0, 2).forEach((link, index) => {
      files.push({
        title: index === 0 ? "Ссылка на решение" : `Ссылка ${index + 1}`,
        caption: "Ссылка",
        url: link,
      });
    });

    if (project.coverImageAddress) {
      files.push({
        title: "Обложка проекта",
        caption: this.fileCaption(project.coverImageAddress),
        url: project.coverImageAddress,
      });
    }

    return files;
  }

  get participantSubmissionDisabled(): boolean {
    return (
      this.participantProjectSubmitting ||
      this.participantProjectSubmitted ||
      this.projectSubmissionClosed ||
      !this.participantProjectRelationId
    );
  }

  get projectSubmissionClosed(): boolean {
    return Boolean(
      this.status === "frozen" ||
        this.status === "completed" ||
        this.status === "archived" ||
        (this.program.datetimeProjectSubmissionEnds &&
          Date.now() > Date.parse(this.program.datetimeProjectSubmissionEnds))
    );
  }

  hasRole(role: ProgramRole): boolean {
    return this.roles.includes(role);
  }

  participantMemberInitial(member: { firstName?: string; lastName?: string }): string {
    return (member.firstName || member.lastName || "У").slice(0, 1);
  }

  submitParticipantProject(): void {
    const relationId = this.participantProjectRelationId;

    if (!relationId || this.participantSubmissionDisabled) {
      return;
    }

    const confirmed = window.confirm(
      "После сдачи проекта редактирование будет заблокировано. Сдать проект на проверку?"
    );

    if (!confirmed) {
      return;
    }

    this.participantProjectSubmitting = true;
    this.programService
      .submitCompettetiveProject(relationId)
      .pipe(
        catchError(() => {
          this.snackbar.error("Не удалось сдать проект на проверку");
          return of(null);
        }),
        finalize(() => {
          this.participantProjectSubmitting = false;
          this.cdr.markForCheck();
        }),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe(project => {
        if (!project) {
          return;
        }

        this.participantProject = {
          ...(this.participantProject ?? project),
          partnerProgram: this.participantProject?.partnerProgram
            ? {
                ...this.participantProject.partnerProgram,
                isSubmitted: true,
                submitted: true,
                submittedAt: new Date().toISOString(),
                submitted_at: new Date().toISOString(),
              }
            : project.partnerProgram,
        } as Project;
        this.program = {
          ...this.program,
          participantProjectStatus: "submitted",
          participantProjectSubmittedAt: new Date().toISOString(),
        };
        this.snackbar.success("Проект сдан на проверку");
        this.cdr.markForCheck();
      });
  }

  emitReject(): void {
    this.reject.emit({
      comment: this.rejectComment.trim(),
      sectionsToFix: this.selectedSectionsToFix,
    });
  }

  emitFreeze(): void {
    this.freeze.emit(this.freezeComment.trim());
  }

  toggleSectionToFix(sectionKey: string): void {
    this.selectedSectionsToFix = this.selectedSectionsToFix.includes(sectionKey)
      ? this.selectedSectionsToFix.filter(key => key !== sectionKey)
      : [...this.selectedSectionsToFix, sectionKey];
  }

  private loadParticipantProject(): void {
    if (!this.program?.id || !this.shouldLoadParticipantProject()) {
      this.participantProject = null;
      return;
    }

    this.participantProjectLoading = true;
    this.projectService
      .getMy()
      .pipe(
        catchError(() => of({ count: 0, results: [] as Project[], next: "", previous: "" })),
        finalize(() => {
          this.participantProjectLoading = false;
          this.cdr.markForCheck();
        }),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe(projects => {
        this.participantProject =
          projects.results.find(project => this.isProjectLinkedToCurrentProgram(project)) ?? null;
        this.cdr.markForCheck();
      });
  }

  private shouldLoadParticipantProject(): boolean {
    return Boolean(
      (this.hasRole("participant") || this.program.isUserMember) &&
        !this.hasRole("organizer") &&
        !this.hasRole("expert")
    );
  }

  private isProjectLinkedToCurrentProgram(project: Project): boolean {
    const relation = project.partnerProgram;

    return Boolean(
      relation &&
        (relation.programId === this.program.id ||
          relation.id === this.program.id ||
          relation.programLinkId === this.program.id)
    );
  }

  private fileCaption(url: string): string {
    const extension = url.split("?")[0].split(".").pop();

    return extension ? extension.toUpperCase() : "Файл";
  }
}
