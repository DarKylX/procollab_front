/** @format */

import { CommonModule, Location } from "@angular/common";
import {
  ChangeDetectorRef,
  Component,
  HostListener,
  inject,
  OnDestroy,
  OnInit,
  signal,
} from "@angular/core";
import { ButtonComponent, InputComponent } from "@ui/components";
import { IconComponent } from "@uilib";
import { ModalComponent } from "@ui/components/modal/modal.component";
import { ActivatedRoute, Router, RouterModule } from "@angular/router";
import { AuthService } from "@auth/services";
import { AvatarComponent } from "@ui/components/avatar/avatar.component";
import { TooltipComponent } from "@ui/components/tooltip/tooltip.component";
import { catchError, concatMap, filter, finalize, map, of, Subscription, tap } from "rxjs";
import { User } from "@auth/models/user.model";
import { Collaborator } from "@office/models/collaborator.model";
import { ProjectService } from "@office/services/project.service";
import { Project } from "@office/models/project.model";
import { ProjectAdditionalService } from "@office/projects/edit/services/project-additional.service";
import { ProjectDataService } from "@office/projects/detail/services/project-data.service";
import { ProgramDataService } from "@office/program/services/program-data.service";
import { ChatService } from "@office/services/chat.service";
import { calculateProfileProgress } from "@utils/calculateProgress";
import { ProfileDataService } from "@office/profile/detail/services/profile-date.service";
import { SnackbarService } from "@ui/services/snackbar.service";
import { ApproveSkillComponent } from "../approve-skill/approve-skill.component";
import { ProgramService } from "@office/program/services/program.service";
import { ProjectFormService } from "@office/projects/edit/services/project-form.service";
import {
  PartnerProgramFields,
  projectNewAdditionalProgramVields,
} from "@office/models/partner-program-fields.model";
import { saveFile } from "@utils/helpers/export-file";
import {
  FormBuilder,
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  ValidatorFn,
  Validators,
} from "@angular/forms";
import { TruncatePipe } from "projects/core/src/lib/pipes/truncate.pipe";
import { ControlErrorPipe, ValidationService } from "@corelib";
import { ErrorMessage } from "@error/models/error-message";
import { InviteService } from "@office/services/invite.service";
import { ApiPagination } from "@office/models/api-pagination.model";
import { ProgramLinksComponent } from "../program-links/program-links.component";
import {
  ProgramStatus,
  ProgramStatusBadgeComponent,
} from "@office/program/shared/program-status-badge/program-status-badge.component";
import {
  LegalDocument,
  Program,
  ProgramDataSchema,
  ProgramDataSchemaField,
} from "@office/program/models/program.model";
import { FileService } from "@core/services/file.service";
import {
  formatRussianPhone,
  normalizeRussianPhone,
  RUSSIAN_PHONE_PATTERN,
} from "@utils/phone-format";

type RegistrationFieldType =
  | "text"
  | "email"
  | "phone"
  | "textarea"
  | "select"
  | "radio"
  | "checkbox"
  | "file";
type RegistrationFormValue = boolean | string | null;

interface RegistrationField {
  key: string;
  label: string;
  type: RegistrationFieldType;
  placeholder: string;
  hint: string;
  required: boolean;
  options: string[];
  system: boolean;
}

@Component({
  selector: "app-detail",
  templateUrl: "./detail.component.html",
  styleUrl: "./detail.component.scss",
  imports: [
    CommonModule,
    RouterModule,
    ReactiveFormsModule,
    IconComponent,
    ButtonComponent,
    ModalComponent,
    AvatarComponent,
    TooltipComponent,
    ApproveSkillComponent,
    InputComponent,
    TruncatePipe,
    ControlErrorPipe,
    ProgramLinksComponent,
    ProgramStatusBadgeComponent,
  ],
  standalone: true,
})
export class DeatilComponent implements OnInit, OnDestroy {
  private readonly authService = inject(AuthService);
  private readonly fb = inject(FormBuilder);
  private readonly route = inject(ActivatedRoute);
  private readonly projectService = inject(ProjectService);
  private readonly programDataService = inject(ProgramDataService);
  private readonly projectDataService = inject(ProjectDataService);
  private readonly projectAdditionalService = inject(ProjectAdditionalService);
  private readonly snackbarService = inject(SnackbarService);
  protected readonly router = inject(Router);
  private readonly location = inject(Location);
  private readonly profileDataService = inject(ProfileDataService);
  public readonly chatService = inject(ChatService);
  private readonly cdRef = inject(ChangeDetectorRef);
  private readonly programService = inject(ProgramService);
  private readonly fileService = inject(FileService);
  private readonly inviteService = inject(InviteService);
  private readonly validationService = inject(ValidationService);
  private readonly projectFormService = inject(ProjectFormService);

  // Основные данные(типы данных, данные)
  info = signal<any | undefined>(undefined);
  profile?: User;
  profileProjects = signal<User["projects"]>([]);
  listType: "project" | "program" | "profile" = "project";

  appWidth = window.innerWidth;

  @HostListener("window:resize")
  onResize() {
    this.appWidth = window.innerWidth;
  }

  @HostListener("window:program-registration-requested", ["$event"])
  onProgramRegistrationRequested(event: Event): void {
    this.openRegistrationModal(event);
  }

  @HostListener("window:program-create-project-requested")
  onProgramCreateProjectRequested(): void {
    this.addNewProject();
  }

  @HostListener("window:program-bind-project-requested")
  onProgramBindProjectRequested(): void {
    this.openProjectPickerModal();
  }

  @HostListener("window:program-invite-project-requested")
  onProgramInviteProjectRequested(): void {
    this.openProjectInviteCodeModal();
  }

  // Переменная для подсказок
  isTooltipVisible = false;

  tooltipText = "Заполни до конца — и открой весь функционал платформы!";

  // Переменные для отображения данных в зависимости от url
  isProjectsPage = false;
  isMembersPage = false;
  isProjectsRatingPage = false;
  isAnalyticsPage = false;

  isTeamPage = false;
  isVacanciesPage = false;
  isProjectChatPage = false;

  // Сторонние переменные для работы с роутингом или доп проверок
  backPath?: string;
  registerDateExpired?: boolean;
  submissionProjectDateExpired?: boolean;
  isInProject?: boolean;

  isSended = false;
  isSubscriptionActive = signal(false);
  isProfileFill = false;

  // Переменные для работы с модалкой подачи проекта
  selectedProjectId: number | null = null;
  memberProjects: Project[] = [];

  userType = signal<number | undefined>(undefined);

  // Сигналы для работы с модальными окнами с текстом
  // assignProjectToProgramModalMessage = signal<ProjectAssign | null>(null);
  errorMessageModal = signal("");

  additionalFields = signal<PartnerProgramFields[]>([]);

  // Переменные для работы с модалками
  isAssignProjectToProgramModalOpen = signal(false);
  showSubmitProjectModal = signal(false);
  isProgramEndedModalOpen = signal(false);
  isProgramSubmissionProjectsEndedModalOpen = signal<boolean>(false);
  isLeaveProjectModalOpen = false; // Флаг модального окна выхода
  isEditDisable = false; // Флаг недоступности редактирования
  isEditDisableModal = false; // Флаг недоступности редактирования для модалки
  openSupport = false; // Флаг модального окна поддержки
  leaderLeaveModal = false; // Флаг модального окна предупреждения лидера
  isDelayModalOpen = false;
  isContactsModalOpen = false;
  isMaterialsModalOpen = false;

  get contactLinks(): { label: string; url: string }[] {
    return (this.info()?.links ?? []).map((link: string) => ({ label: link, url: link }));
  }

  get materialLinks(): { label: string; url: string }[] {
    return (this.info()?.materials ?? [])
      .filter((m: { title: string; url: string }) => !m.title.trim().toLowerCase().includes("сайт"))
      .map((m: { title: string; url: string }) => ({
        label: m.title,
        url: m.url,
      }));
  }

  get programInfoLinks(): { label: string; url: string }[] {
    return [...this.contactLinks, ...this.materialLinks];
  }

  get detailCoverImageAddress(): string {
    const entity = this.info() as Record<string, unknown> | undefined;
    const fallback = "/assets/images/office/profile/detail/cover.png";

    if (!entity) {
      return fallback;
    }

    if (this.listType === "program" && this.appWidth < 768) {
      return (
        this.firstFilledString(
          entity["mobileCoverImageAddress"],
          entity["mobile_cover_image_address"],
          entity["mobileCoverAddress"],
          entity["mobile_cover_address"]
        ) ?? fallback
      );
    }

    return (
      this.firstFilledString(entity["coverImageAddress"], entity["cover_image_address"]) ??
      fallback
    );
  }

  get shouldRenderDetailCoverImage(): boolean {
    if (this.listType !== "program") {
      return this.appWidth > 920;
    }

    if (this.appWidth >= 768) {
      return true;
    }

    const entity = this.info() as Record<string, unknown> | undefined;

    if (!entity) {
      return false;
    }

    return Boolean(
      this.firstFilledString(
        entity["mobileCoverImageAddress"],
        entity["mobile_cover_image_address"],
        entity["mobileCoverAddress"],
        entity["mobile_cover_address"]
      )
    );
  }

  get hasProgramCoverImageAddress(): boolean {
    const entity = this.info() as Record<string, unknown> | undefined;

    if (!entity) {
      return false;
    }

    if (this.appWidth < 768) {
      return Boolean(
        this.firstFilledString(
          entity["mobileCoverImageAddress"],
          entity["mobile_cover_image_address"],
          entity["mobileCoverAddress"],
          entity["mobile_cover_address"]
        )
      );
    }

    return Boolean(
      this.firstFilledString(
        entity["mobileCoverImageAddress"],
        entity["mobile_cover_image_address"],
        entity["mobileCoverAddress"],
        entity["mobile_cover_address"],
        entity["coverImageAddress"],
        entity["cover_image_address"]
      )
    );
  }

  get programLandingLink(): string | null {
    const program = this.info();
    const siteMaterialLink = this.findProgramMaterialUrl(["сайт чемпионата", "сайт"]);

    if (siteMaterialLink) {
      return siteMaterialLink;
    }

    const link = program?.registrationLink;

    if (
      program?.registrationType !== "external" ||
      typeof link !== "string" ||
      !link.trim()
    ) {
      return null;
    }

    return this.normalizeExternalUrl(link.trim());
  }

  get programPresentationLink(): string | null {
    const program = this.info();
    const presentationLink =
      typeof program?.presentationAddress === "string" ? program.presentationAddress.trim() : "";

    return presentationLink || this.findProgramMaterialUrl(["положение", "регламент"]);
  }

  // Переменные для работы с подтверждением навыков
  showApproveSkillModal = false;
  showSendInviteModal = false;
  showNoProjectsModal = false;
  showActiveInviteModal = false;
  showNoInProgramModal = false;
  showSuccessInviteModal = false;
  readAllModal = false;

  // Сигналы для работы с модальными окнами с текстом
  assignProjectToProgramModalMessage = signal<string | null>(null);

  subscriptions: Subscription[] = [];

  get projectForm() {
    return this.projectFormService.formModel;
  }

  readonly inviteForm = this.fb.group({
    role: ["", Validators.required],
  });

  registrationForm = new FormGroup<Record<string, FormControl<RegistrationFormValue>>>({});
  registrationFields: RegistrationField[] = [];
  isRegistrationModalOpen = false;
  isRegistrationModalLoading = false;
  isRegistrationSubmitting = false;
  registrationServerError = "";
  registrationFileUploading: Record<string, boolean> = {};
  isRegistrationSuccessModalOpen = false;
  isProjectPickerModalOpen = false;
  isProjectInviteCodeModalOpen = false;
  isProjectBinding = false;
  projectBindingError = "";
  projectInviteCode = "";
  projectInviteCodeError = "";
  isProjectInviteAccepting = false;
  private hasLoadedMemberProjects = false;

  protected readonly errorMessage = ErrorMessage;

  ngOnInit(): void {
    const listTypeSub$ = this.route.data.subscribe(data => {
      this.listType = data["listType"];
    });

    this.initializeBackPath();

    this.updatePageStates();
    this.location.onUrlChange(url => {
      this.updatePageStates(url);
    });

    this.initializeInfo();

    this.subscriptions.push(listTypeSub$);
  }

  ngOnDestroy(): void {
    this.subscriptions.forEach($ => $.unsubscribe());
  }

  // Геттеры для работы с отображением данных разного типа доступа
  get isUserManager() {
    if (this.listType === "program") {
      return this.info().isUserManager;
    }
  }

  get isUserMember() {
    if (this.listType === "program") {
      return this.info().isUserMember;
    }
  }

  get isUserExpert() {
    if (this.listType === "program" && this.info()?.isUserExpert) {
      return true;
    }

    const type = this.userType();
    return type !== undefined && type === 3;
  }

  get isPlatformAdmin(): boolean {
    const profileWithFlags = this.profile as (User & { is_staff?: boolean }) | undefined;
    return Boolean(profileWithFlags?.isStaff || profileWithFlags?.is_staff);
  }

  get canViewProgramLists(): boolean {
    if (this.listType !== "program") {
      return true;
    }

    const program = this.info();
    if (!program || program.projectsAvailability !== "experts_only") {
      return true;
    }

    return Boolean(
      program.isUserManager || program.isUserExpert || this.isUserExpert || this.isPlatformAdmin
    );
  }

  get isProgramRegistrationOpen(): boolean {
    const program = this.info();

    return (
      this.listType === "program" &&
      !this.isProgramParticipant &&
      program?.status === "published" &&
      Boolean(program?.datetimeRegistrationEnds) &&
      Date.now() <= Date.parse(program.datetimeRegistrationEnds)
    );
  }

  get isProgramParticipant(): boolean {
    const program = this.info();

    return Boolean(
      this.listType === "program" &&
        program?.isUserMember &&
        !program?.isUserManager &&
        !program?.isUserExpert &&
        !this.isPlatformAdmin
    );
  }

  get isNotRegisteredProgramGuest(): boolean {
    const program = this.info();

    return Boolean(
      this.listType === "program" &&
        program &&
        !program.isUserMember &&
        !program.isUserManager &&
        !program.isUserExpert &&
        !this.isPlatformAdmin
    );
  }

  get isProgramVerified(): boolean {
    const program = this.info();

    return program?.isVerified === true;
  }

  get shouldShowVerificationStatusChip(): boolean {
    const program = this.info();

    return Boolean(
      this.listType === "program" &&
        program &&
        !this.isProgramVerified
    );
  }

  get verificationStatusLabel(): string {
    const program = this.info();
    if (!program?.isUserManager && !this.isPlatformAdmin) {
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

  get programFormatLabel(): string {
    return this.info()?.registrationType === "external" ? "внешняя регистрация" : "на платформе";
  }

  get programStatus(): ProgramStatus {
    return (this.info()?.status ?? "published") as ProgramStatus;
  }

  get shouldUseExternalRegistrationLink(): boolean {
    return this.info()?.registrationType === "external" && Boolean(this.info()?.registrationLink);
  }

  get hasUploadingRegistrationFiles(): boolean {
    return Object.values(this.registrationFileUploading).some(Boolean);
  }

  get registrationSubmitDisabled(): boolean {
    return (
      this.registrationForm.invalid ||
      this.isRegistrationModalLoading ||
      this.isRegistrationSubmitting ||
      this.hasUploadingRegistrationFiles
    );
  }

  get isProjectAssigned() {
    const programId = this.info()?.id;
    const currentProject = (
      this.info() as (Program & { participantProject?: Project | null }) | undefined
    )?.participantProject;

    return Boolean(
      currentProject ||
        this.memberProjects.some(project => this.isProjectLinkedToProgram(project, programId))
    );
  }

  get linkedProgramProject(): Project | null {
    const programId = this.info()?.id;
    const currentProject = (
      this.info() as (Program & { participantProject?: Project | null }) | undefined
    )?.participantProject;

    return (
      currentProject ??
      this.memberProjects.find(project => this.isProjectLinkedToProgram(project, programId)) ??
      null
    );
  }

  get availableProgramProjects(): Project[] {
    return this.memberProjects.filter(project => {
      if (project.draft) {
        return false;
      }

      return !project.partnerProgram;
    });
  }

  get selectedProjectForBinding(): Project | undefined {
    return this.memberProjects.find(project => project.id === this.selectedProjectId);
  }

  get canBindSelectedProject(): boolean {
    const project = this.selectedProjectForBinding;

    return Boolean(project && project.leader === this.profile?.id);
  }

  // Методы для управления состоянием ошибок через сервис
  setAssignProjectToProgramError(error: { non_field_errors: string[] }): void {
    this.projectAdditionalService.setAssignProjectToProgramError(error);
  }

  /** Показать подсказку */
  showTooltip(): void {
    this.isTooltipVisible = true;
  }

  /** Скрыть подсказку */
  hideTooltip(): void {
    this.isTooltipVisible = false;
  }

  /**
   * Обработчик изменения радио-кнопки для выбора проекта
   */
  onProjectRadioChange(event: Event): void {
    const target = event.target as HTMLInputElement;
    this.selectedProjectId = +target.value;

    if (this.selectedProjectId) {
      this.memberProjects.find(project => project.id === this.selectedProjectId);
    }
  }

  addNewProject(): void {
    const program = this.info();
    const programId = program?.id;

    if (!program || !programId) {
      return;
    }

    const linkedProject = this.linkedProgramProject;
    if (linkedProject) {
      this.closeRegistrationSuccessModal();
      this.setLinkedProjectForProgram(linkedProject);
      this.snackbarService.info("Проект уже привязан к этому чемпионату");
      this.router.navigate([`/office/projects/${linkedProject.id}/edit`], {
        queryParams: { editingStep: "main", fromProgram: true },
      });
      return;
    }

    this.closeRegistrationSuccessModal();

    this.programService
      .applyProjectToProgram(programId, {
        project: this.buildProgramDraftProjectPayload(program),
        program_field_values: this.getDefaultProgramFieldValues(),
      })
      .subscribe({
        next: relation => {
          const projectId = this.getProgramProjectResponseProjectId(relation);
          const programLinkId = this.getProgramProjectResponseLinkId(relation);

          if (!projectId) {
            this.refreshProgramAfterRegistration(programId);
            this.loadMemberProjects();
            this.snackbarService.success("Проект создан и привязан к чемпионату");
            return;
          }

          const linkedProject = this.buildLinkedProject(
            {
              id: projectId,
              name: this.getDefaultProjectName(program),
              description: "",
              imageAddress: program.imageAddress,
              coverImageAddress: program.coverImageAddress,
              draft: true,
              leader: this.profile?.id ?? 0,
            } as Project,
            programId,
            programLinkId
          );
          this.memberProjects = [
            ...this.memberProjects.filter(item => item.id !== linkedProject.id),
            linkedProject,
          ];
          this.setLinkedProjectForProgram(linkedProject);
          this.snackbarService.success("Проект создан и привязан к чемпионату");
          this.refreshProgramAfterRegistration(programId);
          this.loadMemberProjects();
          this.router
            .navigate([`/office/projects/${linkedProject.id}/edit`], {
              queryParams: { editingStep: "main", fromProgram: true },
            })
            .then(() => console.debug("Route change from ProjectsComponent"));
        },
        error: err => {
          if (this.handleAlreadyLinkedProgramProjectError(err, programId)) {
            return;
          }

          this.snackbarService.error("Не удалось создать проект");
        },
      });
  }

  closeRegistrationSuccessModal(): void {
    this.isRegistrationSuccessModalOpen = false;
    this.markProjectSelectionPromptSeen(this.info()?.id);
  }

  openProjectPickerModal(): void {
    this.selectedProjectId = null;
    this.projectBindingError = "";
    this.isRegistrationSuccessModalOpen = false;
    this.isProjectPickerModalOpen = true;
  }

  closeProjectPickerModal(): void {
    if (this.isProjectBinding) {
      return;
    }

    this.isProjectPickerModalOpen = false;
    this.projectBindingError = "";
  }

  bindSelectedProjectToProgram(): void {
    const program = this.info();
    const projectId = this.selectedProjectId;

    if (!program?.id || !projectId || !this.canBindSelectedProject) {
      this.projectBindingError = "Привязать проект может только лидер проекта.";
      return;
    }

    this.isProjectBinding = true;
    this.projectBindingError = "";

    this.programService
      .applyProjectToProgram(program.id, {
        project_id: projectId,
        program_field_values: this.getDefaultProgramFieldValues(),
      })
      .pipe(finalize(() => (this.isProjectBinding = false)))
      .subscribe({
        next: r => {
          const programLinkId = this.getProgramProjectResponseLinkId(r);
          const responseProjectId = this.getProgramProjectResponseProjectId(r);
          this.isProjectPickerModalOpen = false;
          this.selectedProjectId = null;
          const linkedProject =
            this.memberProjects.find(project => project.id === projectId) ??
            this.selectedProjectForBinding;
          if (linkedProject) {
            const normalizedProject = this.buildLinkedProject(
              linkedProject,
              program.id,
              programLinkId
            );
            this.memberProjects = this.memberProjects.map(project =>
              project.id === normalizedProject.id ? normalizedProject : project
            );
            this.setLinkedProjectForProgram(normalizedProject);
          }
          this.snackbarService.success("Проект привязан к чемпионату");
          this.refreshProgramAfterRegistration(program.id);
          this.loadMemberProjects();
          this.router.navigate([`/office/projects/${responseProjectId ?? projectId}/edit`], {
            queryParams: { editingStep: "main", fromProgram: true },
          });
        },
        error: error => {
          if (this.handleAlreadyLinkedProgramProjectError(error, program.id, projectId)) {
            this.isProjectPickerModalOpen = false;
            return;
          }

          this.projectBindingError = this.getProjectBindingError(error);
        },
      });
  }

  openProjectInviteCodeModal(): void {
    this.projectInviteCode = "";
    this.projectInviteCodeError = "";
    this.isRegistrationSuccessModalOpen = false;
    this.isProjectInviteCodeModalOpen = true;
  }

  backToRegistrationSuccessModal(): void {
    if (this.isProjectBinding || this.isProjectInviteAccepting) {
      return;
    }

    this.isProjectPickerModalOpen = false;
    this.isProjectInviteCodeModalOpen = false;
    this.projectBindingError = "";
    this.projectInviteCodeError = "";
    this.isRegistrationSuccessModalOpen = false;
    this.markProjectSelectionPromptSeen(this.info()?.id);
  }

  closeProjectInviteCodeModal(): void {
    if (this.isProjectInviteAccepting) {
      return;
    }

    this.isProjectInviteCodeModalOpen = false;
    this.projectInviteCode = "";
    this.projectInviteCodeError = "";
  }

  acceptProjectInviteCode(): void {
    const inviteId = this.parseProjectInviteCode(this.projectInviteCode);

    if (!inviteId) {
      this.projectInviteCodeError = "Введите корректный код приглашения.";
      return;
    }

    this.isProjectInviteAccepting = true;
    this.projectInviteCodeError = "";

    this.inviteService
      .acceptInvite(inviteId)
      .pipe(finalize(() => (this.isProjectInviteAccepting = false)))
      .subscribe({
        next: invite => {
          this.isProjectInviteCodeModalOpen = false;
          this.projectInviteCode = "";
          this.snackbarService.success("Вы присоединились к проектной команде");

          if (this.isProjectLinkedToProgram(invite.project, this.info()?.id)) {
            this.setLinkedProjectForProgram(invite.project);
          } else {
            this.snackbarService.info(
              "Проектная команда найдена. Если проект еще не привязан к чемпионату, лидер проекта сможет привязать его отдельно."
            );
          }

          this.loadMemberProjects();
        },
        error: () => {
          this.projectInviteCodeError = "Не удалось принять приглашение. Проверьте код.";
        },
      });
  }

  /**
   * Закрытие модального окна выхода из проекта
   */
  onCloseLeaveProjectModal(): void {
    this.isLeaveProjectModalOpen = false;
  }

  /**
   * Закрытие модального окна для невозможности редактировать проект
   */
  onUnableEditingProject(): void {
    if (this.isEditDisable) {
      this.isEditDisableModal = true;
    } else {
      this.isEditDisableModal = false;
    }
  }

  /**
   * Выход из проекта
   */
  onLeave() {
    this.route.data
      .pipe(map(r => r["data"][0]))
      .pipe(concatMap(p => this.projectService.leave(p.id)))
      .subscribe(
        () => {
          this.router
            .navigateByUrl("/office/projects/my")
            .then(() => console.debug("Route changed from ProjectInfoComponent"));
        },
        () => {
          this.leaderLeaveModal = true; // Показываем предупреждение для лидера
        }
      );
  }

  /**
   * Копирование ссылки на профиль в буфер обмена
   */
  onCopyLink(profileId: number): void {
    let fullUrl = "";

    // Формирование URL в зависимости от типа ресурса
    fullUrl = `${location.origin}/office/profile/${profileId}/`;

    // Копирование в буфер обмена
    navigator.clipboard.writeText(fullUrl).then(() => {
      this.snackbarService.success("скопирован URL");
    });
  }

  openSkills: any = {};

  /**
   * Открытие модального окна с информацией о подтверждениях навыка
   * @param skillId - идентификатор навыка
   */
  onOpenSkill(skillId: number) {
    this.openSkills[skillId] = !this.openSkills[skillId];
  }

  onCloseModal(skillId: number) {
    this.openSkills[skillId] = false;
  }

  /**
   * Отправка CV пользователя на email
   * Проверяет ограничения по времени и отправляет CV на почту пользователя
   */
  downloadCV() {
    this.isSended = true;
    this.authService.downloadCV().subscribe({
      next: blob => {
        saveFile(blob, "cv", this.profile?.firstName + " " + this.profile?.lastName);
        this.isSended = false;
      },
      error: err => {
        this.isSended = false;
        if (err.status === 400) {
          this.isDelayModalOpen = true;
        }
      },
    });
  }

  /**
   * Открывает модалку для отправки приглашения пользователю
   * Проверяет какие отрендерить проекты где profile.id === leader
   */
  inviteUser(): void {
    if (!this.profileProjects().length) {
      this.showNoProjectsModal = true;
    } else {
      this.showSendInviteModal = true;
    }
  }

  sendInvite(): void {
    const role = this.inviteForm.get("role")?.value;
    const userId = this.route.snapshot.params["id"];

    if (
      !this.validationService.getFormValidation(this.inviteForm) ||
      this.selectedProjectId === null
    ) {
      return;
    }

    this.inviteService.sendForUser(userId, this.selectedProjectId, role!).subscribe({
      next: () => {
        this.showSendInviteModal = false;
        this.showSuccessInviteModal = true;

        this.inviteForm.reset();
        this.selectedProjectId = null;
      },
      error: err => {
        if (err.error.user[0].includes("проект относится к программе")) {
          this.showNoInProgramModal = true;
        } else if (err.error.user[0].includes("активное приглашение")) {
          this.showActiveInviteModal = true;
        }
      },
    });
  }

  /**
   * Перенаправляет на страницу с информацией в завивисимости от listType
   */
  redirectDetailInfo(): void {
    switch (this.listType) {
      case "profile":
        this.router.navigateByUrl(`/office/profile/${this.info().id}`);
        break;

      case "project":
        this.router.navigateByUrl(`/office/projects/${this.info().id}`);
        break;

      case "program":
        this.router.navigateByUrl(`/office/program/${this.info().id}`);
        break;
    }
  }

  routingToMyProjects(): void {
    this.router.navigateByUrl(`/office/projects/my`);
  }

  preventDisabledLink(event: Event): void {
    event.preventDefault();
    event.stopPropagation();
  }

  openRegistrationModal(event?: Event): void {
    event?.preventDefault();
    event?.stopPropagation();

    if (this.stopIfRegistrationClosed()) {
      return;
    }

    const program = this.info();
    if (!program?.id) {
      return;
    }

    this.isRegistrationModalOpen = true;
    this.isRegistrationModalLoading = true;
    this.registrationServerError = "";

    this.programService
      .getDataSchema(program.id)
      .pipe(finalize(() => (this.isRegistrationModalLoading = false)))
      .subscribe({
        next: schema => {
          this.registrationFields = this.normalizeRegistrationFields(schema);
          this.buildRegistrationForm();
        },
        error: () => {
          this.registrationFields = this.normalizeRegistrationFields();
          this.buildRegistrationForm();
        },
      });
  }

  closeRegistrationModal(): void {
    if (this.isRegistrationSubmitting) {
      return;
    }

    this.isRegistrationModalOpen = false;
    this.registrationServerError = "";
    this.registrationFileUploading = {};
  }

  submitRegistration(): void {
    this.registrationForm.markAllAsTouched();

    if (this.registrationSubmitDisabled) {
      return;
    }

    const program = this.info();
    if (!program?.id) {
      return;
    }

    this.isRegistrationSubmitting = true;
    this.registrationServerError = "";
    const registrationPayload = this.buildRegistrationPayload();

    this.programService
      .register(program.id, registrationPayload)
      .pipe(finalize(() => (this.isRegistrationSubmitting = false)))
      .subscribe({
        next: () => {
          const registeredProgram = {
            ...program,
            isUserMember: true,
            participantsCount:
              typeof program.participantsCount === "number"
                ? program.participantsCount + 1
                : program.participantsCount,
          };

          this.info.set(registeredProgram);
          this.programDataService.setProgram(registeredProgram);
          this.isRegistrationModalOpen = false;
          this.isRegistrationSuccessModalOpen = true;
          this.registrationServerError = "";
          this.registrationFileUploading = {};
          this.snackbarService.success("Вы зарегистрированы в чемпионате");
          this.refreshProgramAfterRegistration(program.id);
          this.loadMemberProjects();
        },
        error: error => {
          this.registrationServerError = this.getRegistrationServerError(error);
        },
      });
  }

  private refreshProgramAfterRegistration(programId: number): void {
    const programSub$ = this.programService.getOne(programId).subscribe({
      next: updatedProgram => {
        const currentProgram = this.info();
        const mergedProgram = {
          ...updatedProgram,
          participantProject: currentProgram?.participantProject,
          participantProjectStatus: currentProgram?.participantProjectStatus,
        };

        this.info.set(mergedProgram);
        this.programDataService.setProgram(mergedProgram);
        this.syncProgramProjectSelection();
      },
      error: () => undefined,
    });

    this.subscriptions.push(programSub$);
  }

  private loadMemberProjects(): void {
    const memberProjects$ = this.projectService.getMy().subscribe({
      next: projects => {
        const programId = this.info()?.id;
        this.memberProjects = projects.results.filter(
          project => !project.draft || this.isProjectLinkedToProgram(project, programId)
        );
        this.hasLoadedMemberProjects = true;
        this.syncProgramProjectSelection();
      },
    });

    this.subscriptions.push(memberProjects$);
  }

  private syncProgramProjectSelection(): void {
    const program = this.info() as Program | undefined;

    if (!program?.id || this.listType !== "program") {
      return;
    }

    const participantProject =
      this.memberProjects.find(project => this.isProjectLinkedToProgram(project, program.id)) ??
      null;
    const participantProjectStatus: Program["participantProjectStatus"] = participantProject
      ? this.isPartnerProgramProjectSubmitted(participantProject)
        ? "submitted"
        : "not_submitted"
      : undefined;
    const updatedProgram = {
      ...program,
      participantProject,
      participantProjectStatus,
    };

    this.info.set(updatedProgram);
    this.programDataService.setProgram(updatedProgram);
  }

  private setLinkedProjectForProgram(project: Project): void {
    const program = this.info() as Program | undefined;

    if (!program?.id) {
      return;
    }

    const participantProjectStatus: Program["participantProjectStatus"] =
      this.isPartnerProgramProjectSubmitted(project) ? "submitted" : "not_submitted";
    const updatedProgram = {
      ...program,
      participantProject: project,
      participantProjectStatus,
    };

    this.info.set(updatedProgram);
    this.programDataService.setProgram(updatedProgram);
  }

  private buildLinkedProject(project: Project, programId: number, programLinkId?: number): Project {
    const submitted = this.isPartnerProgramProjectSubmitted(project);

    return {
      ...project,
      partnerProgram: {
        ...(project.partnerProgram ?? {}),
        id: project.partnerProgram?.id ?? programId,
        programId,
        programLinkId: programLinkId ?? project.partnerProgram?.programLinkId ?? programId,
        isSubmitted: submitted,
        submitted,
        submittedAt: project.partnerProgram?.submittedAt ?? null,
        submitted_at: project.partnerProgram?.submitted_at ?? null,
        canSubmit: project.partnerProgram?.canSubmit ?? true,
        programFields: project.partnerProgram?.programFields ?? [],
        programFieldValues: project.partnerProgram?.programFieldValues ?? [],
      },
    } as Project;
  }

  private buildProgramDraftProjectPayload(program: Program): Record<string, unknown> {
    return {
      name: this.getDefaultProjectName(program),
      description: "",
      region: program.city ?? "",
      industry: null,
      presentation_address: "",
      image_address: "",
      cover_image_address: "",
      actuality: "",
      problem: "",
      target_audience: "",
      implementation_deadline: null,
      trl: null,
      is_company: false,
    };
  }

  private getDefaultProjectName(program: Program): string {
    return `Проект для чемпионата ${program.name || ""}`.trim().slice(0, 256);
  }

  private findProgramMaterialUrl(titleNeedles: string[]): string | null {
    const materials = this.info()?.materials ?? [];
    const normalizedNeedles = titleNeedles.map(needle => needle.toLowerCase());
    const material = materials.find((item: { title?: string; url?: string }) => {
      const title = (item.title ?? "").toLowerCase();
      return normalizedNeedles.some(needle => title.includes(needle));
    });
    const url = typeof material?.url === "string" ? material.url.trim() : "";

    return url ? this.normalizeExternalUrl(url) : null;
  }

  private normalizeExternalUrl(url: string): string {
    if (/^https?:\/\//i.test(url)) {
      return url;
    }

    return `https://${url}`;
  }

  private firstFilledString(...values: unknown[]): string | undefined {
    return values.find((value): value is string => typeof value === "string" && value.trim().length > 0);
  }

  private getProgramProjectResponseProjectId(response: unknown): number | undefined {
    const data = response as
      | {
          projectId?: unknown;
          project_id?: unknown;
          newProjectId?: unknown;
          new_project_id?: unknown;
        }
      | undefined;

    return this.toNumberOrUndefined(
      data?.projectId ?? data?.project_id ?? data?.newProjectId ?? data?.new_project_id
    );
  }

  private getProgramProjectResponseLinkId(response: unknown): number | undefined {
    const data = response as
      | {
          programLinkId?: unknown;
          program_link_id?: unknown;
        }
      | undefined;

    return this.toNumberOrUndefined(data?.programLinkId ?? data?.program_link_id);
  }

  private toNumberOrUndefined(value: unknown): number | undefined {
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }

    if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) {
      return Number(value);
    }

    return undefined;
  }

  private handleAlreadyLinkedProgramProjectError(
    error: unknown,
    programId: number,
    fallbackProjectId?: number
  ): boolean {
    const status = (error as { status?: number })?.status;
    const errorBody = (error as { error?: unknown })?.error;

    if (status !== 400 || !this.isAlreadyLinkedProgramProjectError(errorBody)) {
      return false;
    }

    const projectId = this.getProgramProjectResponseProjectId(errorBody) ?? fallbackProjectId;
    const programLinkId = this.getProgramProjectResponseLinkId(errorBody);
    const project =
      this.memberProjects.find(item => item.id === projectId) ??
      this.memberProjects.find(item => this.isProjectLinkedToProgram(item, programId));

    this.isAssignProjectToProgramModalOpen.set(false);
    this.assignProjectToProgramModalMessage.set(null);

    if (projectId && project) {
      const linkedProject = this.buildLinkedProject(project, programId, programLinkId);
      this.setLinkedProjectForProgram(linkedProject);
      this.router.navigate([`/office/projects/${projectId}/edit`], {
        queryParams: { editingStep: "main", fromProgram: true },
      });
    }

    this.refreshProgramAfterRegistration(programId);
    this.loadMemberProjects();
    this.snackbarService.info("Проект уже привязан к этому чемпионату");

    return true;
  }

  private isAlreadyLinkedProgramProjectError(errorBody: unknown): boolean {
    const text = typeof errorBody === "string" ? errorBody : JSON.stringify(errorBody ?? {});

    if (/another program|друг/i.test(text)) {
      return false;
    }

    return /уже|already|linked|привязан|подан/i.test(text);
  }

  private isProjectLinkedToProgram(project: Project, programId?: number): boolean {
    const relation = project.partnerProgram;

    return Boolean(
      programId &&
        relation &&
        (relation.id === programId ||
          relation.programId === programId ||
          relation.programLinkId === programId)
    );
  }

  private isPartnerProgramProjectSubmitted(project?: Project | null): boolean {
    const relation = project?.partnerProgram;

    return Boolean(relation?.submitted || relation?.isSubmitted);
  }

  private tryShowProjectSelectionPrompt(program?: Program): void {
    if (
      this.listType !== "program" ||
      !this.hasLoadedMemberProjects ||
      !program?.id ||
      !program.isUserMember ||
      program.isUserManager ||
      program.isUserExpert ||
      this.isProjectAssigned ||
      this.isRegistrationModalOpen ||
      this.isRegistrationSuccessModalOpen ||
      this.isProjectPickerModalOpen ||
      this.isProjectInviteCodeModalOpen ||
      this.hasSeenProjectSelectionPrompt(program.id)
    ) {
      return;
    }

    this.isRegistrationSuccessModalOpen = true;
    this.cdRef.detectChanges();
  }

  private getProjectSelectionPromptSeenKey(programId: number): string {
    return `program_project_selection_prompt_seen_${programId}`;
  }

  private hasSeenProjectSelectionPrompt(programId: number): boolean {
    try {
      return !!localStorage.getItem(this.getProjectSelectionPromptSeenKey(programId));
    } catch (e) {
      return false;
    }
  }

  private markProjectSelectionPromptSeen(programId?: number): void {
    if (!programId) {
      return;
    }

    try {
      localStorage.setItem(this.getProjectSelectionPromptSeenKey(programId), "1");
    } catch (e) {
      // localStorage can be unavailable in restricted browser contexts.
    }
  }

  private getDefaultProgramFieldValues(): projectNewAdditionalProgramVields[] {
    return this.additionalFields().map((field: PartnerProgramFields) => ({
      field_id: field.id,
      value_text: field.options.length ? field.options[0] : "'",
    }));
  }

  private parseProjectInviteCode(code: string): number | null {
    const match = code
      .trim()
      .toUpperCase()
      .match(/^(?:INV-)?(\d+)$/);

    if (!match) {
      return null;
    }

    const inviteId = Number(match[1]);

    return Number.isFinite(inviteId) && inviteId > 0 ? inviteId : null;
  }

  private getProjectBindingError(error: unknown): string {
    if (typeof error === "object" && error !== null && "error" in error) {
      const body = (error as { error?: unknown }).error;

      if (typeof body === "object" && body !== null && "detail" in body) {
        const detail = (body as { detail?: unknown }).detail;
        if (typeof detail === "string") {
          return detail;
        }
      }

      if (typeof body === "object" && body !== null && "project_id" in body) {
        const projectError = (body as { project_id?: unknown }).project_id;
        if (Array.isArray(projectError) && typeof projectError[0] === "string") {
          return projectError[0];
        }
        if (typeof projectError === "string") {
          return projectError;
        }
      }
    }

    return "Не удалось привязать проект. Попробуйте еще раз.";
  }

  onRegistrationFileSelected(event: Event, field: RegistrationField): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];

    if (!file) {
      return;
    }

    this.registrationFileUploading = {
      ...this.registrationFileUploading,
      [field.key]: true,
    };

    this.fileService
      .uploadFile(file)
      .pipe(
        finalize(() => {
          this.registrationFileUploading = {
            ...this.registrationFileUploading,
            [field.key]: false,
          };
        })
      )
      .subscribe({
        next: ({ url }) => {
          const control = this.registrationForm.get(field.key);
          control?.setValue(url);
          control?.markAsDirty();
          control?.markAsTouched();
        },
        error: () => {
          this.registrationServerError = "Не удалось загрузить файл";
          this.registrationForm.get(field.key)?.setValue(null);
        },
      });
  }

  onRegistrationTextInput(event: Event, field: RegistrationField): void {
    if (field.key !== "phone" && field.type !== "phone") {
      return;
    }

    const input = event.target as HTMLInputElement;
    const formattedPhone = formatRussianPhone(input.value);

    if (input.value !== formattedPhone) {
      input.value = formattedPhone;
      this.registrationForm.get(field.key)?.setValue(formattedPhone);
    }
  }

  getRegistrationInputType(field: RegistrationField): "email" | "tel" | "text" {
    if (field.key === "email" || field.type === "email") {
      return "email";
    }

    if (field.key === "phone" || field.type === "phone") {
      return "tel";
    }

    return "text";
  }

  getRegistrationFileName(field: RegistrationField): string {
    const value = this.registrationForm.get(field.key)?.value;

    if (typeof value !== "string" || !value) {
      return "";
    }

    return value.split("?")[0].split("/").pop() || "Файл загружен";
  }

  isRegistrationFieldInvalid(field: RegistrationField): boolean {
    const control = this.registrationForm.get(field.key);

    return Boolean(control?.invalid && (control.touched || control.dirty));
  }

  getRegistrationFieldError(field: RegistrationField): string {
    const control = this.registrationForm.get(field.key);

    if (!control?.errors || !(control.touched || control.dirty)) {
      return "";
    }

    if (control.errors["required"] || control.errors["requiredTrue"]) {
      return field.type === "checkbox" ? "Подтвердите согласие" : "Заполните поле";
    }

    if (control.errors["email"]) {
      return "Введите корректный email";
    }

    if (control.errors["pattern"]) {
      return "Введите корректный номер телефона";
    }

    return "Проверьте значение";
  }

  /**
   * Проверка завершения программы перед регистрацией
   */
  checkPrograRegistrationEnded(event: Event): void {
    if (this.stopIfRegistrationClosed(event)) {
      return;
    }

    if (!(event.currentTarget as HTMLAnchorElement | null)?.getAttribute("href")) {
      this.openRegistrationModal(event);
    }
  }

  private stopIfRegistrationClosed(event?: Event): boolean {
    const program = this.info();

    if (
      program?.datetimeRegistrationEnds &&
      Date.now() > Date.parse(program.datetimeRegistrationEnds)
    ) {
      event?.preventDefault();
      event?.stopPropagation();
      this.isProgramEndedModalOpen.set(true);
      return true;
    }

    if (
      program?.datetimeProjectSubmissionEnds &&
      Date.now() > Date.parse(program.datetimeProjectSubmissionEnds)
    ) {
      event?.preventDefault();
      event?.stopPropagation();
      this.isProgramSubmissionProjectsEndedModalOpen.set(true);
      return true;
    }

    return false;
  }

  private normalizeRegistrationFields(schema?: ProgramDataSchema): RegistrationField[] {
    const customFields = this.normalizeCustomRegistrationFields(schema);

    return [...this.getSystemRegistrationFields(), ...customFields];
  }

  private normalizeCustomRegistrationFields(schema?: ProgramDataSchema): RegistrationField[] {
    const schemaFields = this.readSchemaFields(schema);

    if (!schemaFields.length) {
      return this.getFallbackRegistrationFields();
    }

    const normalizedFields = schemaFields
      .map(([key, field]) => this.normalizeSchemaField(key, field))
      .filter((field): field is RegistrationField => Boolean(field))
      .filter(field => !this.isOrganizerControlledConsentField(field));

    return normalizedFields.length ? normalizedFields : this.getFallbackRegistrationFields();
  }

  private isOrganizerControlledConsentField(field: RegistrationField): boolean {
    const value = `${field.key} ${field.label} ${field.hint}`.toLowerCase();

    return (
      value.includes("consent") ||
      value.includes("personaldata") ||
      value.includes("personal-data") ||
      value.includes("соглас") ||
      value.includes("персональн")
    );
  }

  private readSchemaFields(schema?: ProgramDataSchema): [string, ProgramDataSchemaField][] {
    if (!schema) {
      return [];
    }

    const schemaRecord = schema as Record<string, unknown>;
    const fieldsValue = schemaRecord["fields"];
    if (Array.isArray(fieldsValue)) {
      return fieldsValue
        .filter((field): field is ProgramDataSchemaField => this.isSchemaField(field))
        .map((field, index) => [`field_${index + 1}`, field]);
    }

    return Object.entries(schema)
      .filter(([, value]) => this.isSchemaField(value))
      .map(([key, value]) => [key, value as ProgramDataSchemaField]);
  }

  private isSchemaField(value: unknown): value is ProgramDataSchemaField {
    return typeof value === "object" && value !== null && !Array.isArray(value);
  }

  private normalizeSchemaField(
    key: string,
    field: ProgramDataSchemaField
  ): RegistrationField | null {
    const record = field as unknown as Record<string, unknown>;
    const label = this.readString(record["label"]) || this.readString(record["name"]);

    if (!label) {
      return null;
    }

    const rawType =
      this.readString(record["type"]) ||
      this.readString(record["fieldType"]) ||
      this.readString(record["field_type"]);
    const type = this.normalizeRegistrationType(rawType);
    const required =
      this.readBoolean(record["isRequired"]) ??
      this.readBoolean(record["is_required"]) ??
      this.readBoolean(record["required"]) ??
      false;
    const hint =
      this.readString(record["helpText"]) ||
      this.readString(record["help_text"]) ||
      this.readString(record["hint"]) ||
      this.readString(record["description"]);

    return {
      key,
      label,
      type,
      placeholder: this.readString(record["placeholder"]),
      hint,
      required,
      options: this.readStringArray(record["options"]),
      system: false,
    };
  }

  private normalizeRegistrationType(type: string): RegistrationFieldType {
    const normalized = type.toLowerCase();

    if (
      normalized === "textarea" ||
      normalized === "email" ||
      normalized === "phone" ||
      normalized === "select" ||
      normalized === "radio" ||
      normalized === "checkbox" ||
      normalized === "file"
    ) {
      return normalized;
    }

    return "text";
  }

  private getSystemRegistrationFields(): RegistrationField[] {
    return [
      {
        key: "fullName",
        label: "ФИО",
        type: "text",
        placeholder: "Иван Петров",
        hint: "",
        required: true,
        options: [],
        system: true,
      },
      {
        key: "email",
        label: "Email",
        type: "text",
        placeholder: "ivan.petrov@example.com",
        hint: "",
        required: true,
        options: [],
        system: true,
      },
      {
        key: "phone",
        label: "Телефон",
        type: "phone",
        placeholder: "+7 (___) ___-__-__",
        hint: "",
        required: true,
        options: [],
        system: true,
      },
    ];
  }

  private getFallbackRegistrationFields(): RegistrationField[] {
    const fields: RegistrationField[] = [
      {
        key: "organization",
        label: "Вуз / организация",
        type: "text",
        placeholder: "Введите название вуза или организации",
        hint: "",
        required: true,
        options: [],
        system: false,
      },
      {
        key: "educationLevel",
        label: "Уровень подготовки",
        type: "select",
        placeholder: "",
        hint: "",
        required: false,
        options: ["Бакалавриат", "Магистратура", "Аспирантура"],
        system: false,
      },
      {
        key: "motivation",
        label: "Почему хотите участвовать?",
        type: "textarea",
        placeholder:
          "Расскажите, что вас мотивирует участвовать в чемпионате и что хотите получить от участия.",
        hint: "Коротко расскажите о своей мотивации",
        required: true,
        options: [],
        system: false,
      },
      {
        key: "participationFormat",
        label: "Формат участия",
        type: "radio",
        placeholder: "",
        hint: "",
        required: true,
        options: ["Индивидуально", "В команде"],
        system: false,
      },
      {
        key: "personalDataConsent",
        label: "Согласие на обработку данных",
        type: "checkbox",
        placeholder: "",
        hint: "Я даю согласие на обработку персональных данных в соответствии с Политикой конфиденциальности.",
        required: true,
        options: [],
        system: false,
      },
    ];

    return fields.filter(field => field.key !== "personalDataConsent");
  }

  private buildRegistrationForm(): void {
    const controls: Record<string, FormControl<RegistrationFormValue>> = {};

    this.registrationFields.forEach(field => {
      controls[field.key] = new FormControl<RegistrationFormValue>(
        this.getRegistrationInitialValue(field),
        this.getRegistrationValidators(field)
      );
    });
    controls["legalConsent"] = new FormControl<RegistrationFormValue>(false, [
      Validators.requiredTrue,
    ]);

    this.registrationForm = new FormGroup<Record<string, FormControl<RegistrationFormValue>>>(
      controls
    );
  }

  private getRegistrationInitialValue(field: RegistrationField): RegistrationFormValue {
    if (field.key === "fullName") {
      return this.getProfileFullName();
    }

    if (field.key === "email") {
      return this.profile?.email || "";
    }

    if (field.key === "phone") {
      return this.getProfilePhone();
    }

    if (field.type === "checkbox") {
      return false;
    }

    if (field.type === "select" || field.type === "radio") {
      return field.options[0] || "";
    }

    return "";
  }

  private getRegistrationValidators(field: RegistrationField): ValidatorFn[] {
    const validators: ValidatorFn[] = [];

    if (field.required) {
      validators.push(field.type === "checkbox" ? Validators.requiredTrue : Validators.required);
    }

    if (field.key === "email" || field.type === "email") {
      validators.push(Validators.email);
    }

    if (field.key === "phone" || field.type === "phone") {
      validators.push(Validators.pattern(RUSSIAN_PHONE_PATTERN));
    }

    return validators;
  }

  private getProfileFullName(): string {
    return [this.profile?.lastName, this.profile?.firstName, this.profile?.patronymic]
      .filter(Boolean)
      .join(" ");
  }

  private getProfilePhone(): string {
    const rawPhone = this.profile?.phoneNumber;

    if (rawPhone === undefined || rawPhone === null) {
      return "";
    }

    return formatRussianPhone(rawPhone);
  }

  private buildRegistrationPayload(): Record<string, RegistrationFormValue> {
    const payload = this.registrationFields.reduce<Record<string, RegistrationFormValue>>(
      (payload, field) => {
        const value = this.registrationForm.get(field.key)?.value ?? null;

        payload[field.key] =
          field.key === "phone" || field.type === "phone" ? normalizeRussianPhone(value) : value;

        return payload;
      },
      {}
    );

    payload["legalConsent"] = this.registrationForm.get("legalConsent")?.value ?? false;

    return payload;
  }

  isLegalConsentInvalid(): boolean {
    const control = this.registrationForm.get("legalConsent");

    return Boolean(control?.invalid && (control.touched || control.dirty));
  }

  getLegalDocument(type: LegalDocument["type"]): LegalDocument | null {
    return this.info()?.legalDocuments?.find((document: LegalDocument) => document.type === type) ?? null;
  }

  getLegalDocumentHref(type: LegalDocument["type"]): string {
    return this.getLegalDocument(type)?.contentUrl ?? "";
  }

  getLegalDocumentTitle(type: LegalDocument["type"], fallback: string): string {
    const document = this.getLegalDocument(type);

    return document?.version ? `${document.title} (${document.version})` : document?.title ?? fallback;
  }

  getParticipationRulesHref(): string {
    const settings = this.info()?.legalSettings;

    return settings?.participationRulesLink || settings?.participationRulesFileUrl || "";
  }

  private readString(value: unknown): string {
    return typeof value === "string" ? value : "";
  }

  private readBoolean(value: unknown): boolean | undefined {
    return typeof value === "boolean" ? value : undefined;
  }

  private readStringArray(value: unknown): string[] {
    return Array.isArray(value)
      ? value.filter((item): item is string => typeof item === "string")
      : [];
  }

  private getRegistrationServerError(error: unknown): string {
    if (typeof error === "object" && error !== null && "error" in error) {
      const body = (error as { error?: unknown }).error;

      if (typeof body === "object" && body !== null && "detail" in body) {
        const detail = (body as { detail?: unknown }).detail;
        if (typeof detail === "string") {
          return detail;
        }
      }

      if (typeof body === "string") {
        return body;
      }
    }

    return "Не удалось зарегистрироваться. Проверьте данные и попробуйте еще раз.";
  }

  /**
   * Обновляет состояния страниц на основе URL
   */
  private updatePageStates(url?: string): void {
    const currentUrl = url || this.router.url;

    this.isProjectsPage =
      currentUrl.includes("/projects") && !currentUrl.includes("/projects-rating");

    this.isMembersPage = currentUrl.includes("/members");

    this.isProjectsRatingPage = currentUrl.includes("/projects-rating");
    this.isAnalyticsPage = currentUrl.includes("/analytics");

    this.isTeamPage = currentUrl.includes("/team");
    this.isVacanciesPage = currentUrl.includes("/vacancies");
    this.isProjectChatPage = currentUrl.includes("/chat");
  }

  private initializeInfo() {
    if (this.listType === "project") {
      const projectSub$ = this.projectDataService.project$
        .pipe(filter(project => !!project))
        .subscribe(project => {
          this.info.set(project);

          if (project?.partnerProgram) {
            this.isEditDisable = this.isPartnerProgramProjectSubmitted(project);
          }
        });

      this.isInProfileInfo();

      this.subscriptions.push(projectSub$);
    } else if (this.listType === "program") {
      const program$ = this.programDataService.program$
        .pipe(
          filter(program => !!program),
          tap(program => {
            if (program) {
              this.info.set(program);
              if (program.isUserMember || program.isUserManager || program.isUserExpert) {
                this.loadAdditionalFields(program.id);
              } else {
                this.additionalFields.set([]);
              }
              this.registerDateExpired = Date.now() > Date.parse(program.datetimeRegistrationEnds);
              this.submissionProjectDateExpired =
                Date.now() > Date.parse(program.datetimeProjectSubmissionEnds);
            }
          })
        )
        .subscribe();

      const profileDataSub$ = this.authService.profile.pipe(filter(user => !!user)).subscribe({
        next: user => {
          this.userType.set(user!.userType);
          this.profile = user;
          this.cdRef.detectChanges();
        },
      });

      this.loadMemberProjects();

      this.subscriptions.push(program$);
      this.subscriptions.push(profileDataSub$);
    } else {
      const profileDataSub$ = this.profileDataService
        .getProfile()
        .pipe(
          map(user => ({ ...user, progress: calculateProfileProgress(user!) })),
          filter(user => !!user)
        )
        .subscribe({
          next: user => {
            this.info.set(user);
            this.isProfileFill =
              user.progress! < 100 ? (this.isProfileFill = true) : (this.isProfileFill = false);
          },
        });

      this.isInProfileInfo();

      const profileLeaderProjectsSub$ = this.authService.getLeaderProjects().subscribe({
        next: (projects: ApiPagination<Project>) => {
          this.profileProjects.set(projects.results);
        },
      });

      this.subscriptions.push(profileDataSub$, profileLeaderProjectsSub$);
    }
  }

  private isInProfileInfo(): void {
    const profileInfoSub$ = this.authService.profile.subscribe({
      next: profile => {
        this.profile = profile;

        if (this.info() && this.listType === "project") {
          this.isInProject = this.info()
            ?.collaborators?.map((person: Collaborator) => person.userId)
            .includes(profile.id);
        }
      },
    });

    this.subscriptions.push(profileInfoSub$);
  }

  /**
   * Инициализация строки для back компонента в зависимости от типа данных
   */
  private initializeBackPath(): void {
    if (this.listType === "project") {
      this.backPath = "/office/projects/all";
    } else if (this.listType === "program") {
      this.backPath = "/office/program/all";
    }
  }

  private loadAdditionalFields(programId: number): void {
    const additionalFieldsSub$ = this.programService
      .getProgramProjectAdditionalFields(programId)
      .pipe(
        catchError(() => {
          this.additionalFields.set([]);
          return of({ programFields: [] });
        })
      )
      .subscribe({
        next: ({ programFields }) => {
          if (programFields) {
            this.additionalFields.set(programFields);
          }
        },
      });

    this.subscriptions.push(additionalFieldsSub$);
  }
}
