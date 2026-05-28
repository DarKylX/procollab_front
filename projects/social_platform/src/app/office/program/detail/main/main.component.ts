/** @format */

import {
  AfterViewInit,
  ChangeDetectorRef,
  Component,
  ElementRef,
  HostListener,
  OnDestroy,
  OnInit,
  signal,
  ViewChild,
} from "@angular/core";
import { ActivatedRoute, Router, RouterModule } from "@angular/router";
import { DomSanitizer, SafeResourceUrl } from "@angular/platform-browser";
import {
  catchError,
  concatMap,
  finalize,
  fromEvent,
  map,
  noop,
  Observable,
  of,
  Subscription,
  switchMap,
  tap,
  throttleTime,
} from "rxjs";
import { AsyncPipe, DatePipe } from "@angular/common";
import { AuthService } from "@auth/services";
import { ButtonComponent, IconComponent } from "@ui/components";
import { ModalComponent } from "@ui/components/modal/modal.component";
import { SnackbarService } from "@ui/services/snackbar.service";
import { ApiPagination } from "@models/api-pagination.model";
import { Project } from "@models/project.model";
import { Program } from "@office/program/models/program.model";
import {
  IssuedCertificate,
  MyCertificateResponse,
} from "@office/program/models/program-certificate.model";
import { ProgramNewsService } from "@office/program/services/program-news.service";
import { ProgramDataService } from "@office/program/services/program-data.service";
import { ProgramService, ProgramStats } from "@office/program/services/program.service";
import { ProgramRole, RoleResolverService } from "@office/program/services/role-resolver.service";
import { ModerationService } from "@office/admin/moderation/moderation.service";
import { ProjectAdditionalService } from "@office/projects/edit/services/project-additional.service";
import { LoadingService } from "@office/services/loading.service";
import { FeedNews } from "@office/projects/models/project-news.model";
import { ProgramLinksComponent } from "@office/features/program-links/program-links.component";
import { SoonCardComponent } from "@office/shared/soon-card/soon-card.component";
import { NewsFormComponent } from "@office/features/news-form/news-form.component";
import { expandElement } from "@utils/expand-element";
import { ParseBreaksPipe, ParseLinksPipe } from "projects/core";
import { ProgramNewsCardComponent } from "../shared/news-card/news-card.component";
import {
  ProgramContextActionsComponent,
  ProgramRejectPayload,
} from "./components/program-context-actions/program-context-actions.component";
import { ProgramStatCardsComponent } from "./components/program-stat-cards/program-stat-cards.component";
import { saveAs } from "file-saver";

interface ProgramStageItem {
  index: number;
  title: string;
  date: string;
  active: boolean;
  completed: boolean;
}

interface ParticipationStep {
  index: number;
  title: string;
  description: string;
  active: boolean;
  completed: boolean;
}

interface ParticipantProjectMaterial {
  title: string;
  caption: string;
  url: string;
}

type ProgramParticipationState = Program & {
  assignedProject?: Project | null;
  participantProject?: Project | null;
  participantProjectStatus?: string;
  participantProjectSubmittedAt?: string;
  project?: Project | null;
  projectStatus?: string;
  programLinkId?: number | string | null;
  team?: unknown;
  teamId?: number;
};

@Component({
  selector: "app-main",
  templateUrl: "./main.component.html",
  styleUrl: "./main.component.scss",
  standalone: true,
  imports: [
    IconComponent,
    ButtonComponent,
    ProgramNewsCardComponent,
    AsyncPipe,
    DatePipe,
    ParseBreaksPipe,
    ParseLinksPipe,
    ModalComponent,
    SoonCardComponent,
    NewsFormComponent,
    ProgramLinksComponent,
    RouterModule,
    ProgramStatCardsComponent,
    ProgramContextActionsComponent,
  ],
})
export class ProgramDetailMainComponent implements OnInit, OnDestroy, AfterViewInit {
  constructor(
    private readonly programNewsService: ProgramNewsService,
    private readonly projectAdditionalService: ProjectAdditionalService,
    private readonly authService: AuthService,
    private readonly router: Router,
    private readonly route: ActivatedRoute,
    private readonly cdRef: ChangeDetectorRef,
    private readonly loadingService: LoadingService,
    private readonly programService: ProgramService,
    private readonly programDataService: ProgramDataService,
    private readonly moderationService: ModerationService,
    private readonly roleResolver: RoleResolverService,
    private readonly snackbar: SnackbarService,
    private readonly sanitizer: DomSanitizer
  ) {}

  @ViewChild(NewsFormComponent) newsFormComponent?: NewsFormComponent;
  @ViewChild(ProgramNewsCardComponent) ProgramNewsCardComponent?: ProgramNewsCardComponent;
  @ViewChild("descEl") descEl?: ElementRef;

  appWidth = window.innerWidth;
  news = signal<FeedNews[]>([]);
  totalNewsCount = signal(0);
  fetchLimit = signal(10);
  fetchPage = signal(0);
  showProgramModal = signal(false);
  showProgramModalErrorMessage = signal<string | null>(null);
  showRevisionModal = signal(false);
  profileId = signal<number | undefined>(undefined);
  profileIsStaff = signal(false);

  program?: Program;
  roles: ProgramRole[] = [];
  stats: ProgramStats | null = null;
  registerDateExpired!: boolean;
  descriptionExpandable!: boolean;
  readFullDescription = false;
  programId?: number;
  participantProjectSubmitting = false;
  participantSubmitModalOpen = false;
  myCertificate?: MyCertificateResponse | null;
  certificatePreviewOpen = false;
  certificatePreviewUrl: SafeResourceUrl | null = null;

  private readonly subscriptions: Subscription[] = [];
  private certificateObjectUrl?: string;

  get isAssignProjectToProgramError(): boolean {
    return this.projectAdditionalService.getIsAssignProjectToProgramError()();
  }

  get errorAssignProjectToProgramModalMessage() {
    return this.projectAdditionalService.getErrorAssignProjectToProgramModalMessage();
  }

  get contactLinks(): { label: string; url: string }[] {
    return (this.program?.links ?? []).map(link => ({ label: link, url: link }));
  }

  get materialLinks(): { label: string; url: string }[] {
    return (this.program?.materials ?? []).map(m => ({ label: m.title, url: m.url }));
  }

  get publicMaterials(): { title: string; url: string }[] {
    return (this.program?.materials ?? []).filter(
      material => !(material.title ?? "").trim().toLowerCase().includes("сайт")
    );
  }

  get activeRejection() {
    return this.program?.status === "rejected" ? this.program?.moderationResult ?? null : null;
  }

  get revisionSectionsText(): string {
    return (this.activeRejection?.sectionsToFix ?? [])
      .map(section => this.revisionSectionLabel(section))
      .join(", ");
  }

  get canViewProgramLists(): boolean {
    if (!this.program || this.program.projectsAvailability !== "experts_only") {
      return true;
    }

    return (
      this.hasRole("organizer") ||
      this.hasRole("expert") ||
      this.hasRole("admin") ||
      this.isPlatformAdmin
    );
  }

  get isPlatformAdmin(): boolean {
    return this.profileIsStaff() || this.hasRole("admin");
  }

  get isNotRegisteredGuest(): boolean {
    return Boolean(
      this.program &&
        !this.program.isUserMember &&
        !this.program.isUserManager &&
        !this.program.isUserExpert &&
        !this.hasRole("organizer") &&
        !this.hasRole("expert") &&
        !this.isPlatformAdmin
    );
  }

  get isParticipant(): boolean {
    const program = this.program;

    return Boolean(
      program?.isUserMember &&
        !program.isUserManager &&
        !program.isUserExpert &&
        !this.hasRole("organizer") &&
        !this.hasRole("expert") &&
        !this.isPlatformAdmin
    );
  }

  get showManagementActions(): boolean {
    return Boolean(
      this.program &&
        (this.hasRole("organizer") || this.isPlatformAdmin || this.program.isUserManager)
    );
  }

  get showManagementActionsInNews(): boolean {
    return this.showManagementActions;
  }

  get isParticipantWithoutProject(): boolean {
    const program = this.program as ProgramParticipationState | undefined;

    if (!program) {
      return false;
    }

    return Boolean(
      program.isUserMember &&
        !program.isUserManager &&
        !program.isUserExpert &&
        !this.hasLinkedProject(program)
    );
  }

  get participantProject(): Project | null {
    const program = this.program as ProgramParticipationState | undefined;

    return program?.participantProject ?? program?.assignedProject ?? program?.project ?? null;
  }

  get isParticipantWithProject(): boolean {
    return this.isParticipant && Boolean(this.participantProject);
  }

  get participantProjectSubmitted(): boolean {
    const program = this.program as ProgramParticipationState | undefined;
    const status = String(program?.participantProjectStatus ?? program?.projectStatus ?? "")
      .trim()
      .toLowerCase();

    return Boolean(
      ["submitted", "on_review", "review", "approved", "rejected"].includes(status) ||
        this.isPartnerProgramSubmitted(this.participantProject)
    );
  }

  get participantProjectStatusLabel(): string {
    return this.participantProjectSubmitted ? "Ожидает оценки" : "Не сдан";
  }

  get participantProjectRelationId(): number | null {
    const program = this.program as ProgramParticipationState | undefined;

    return this.toNumberOrNull(
      this.participantProject?.partnerProgram?.programLinkId ?? program?.programLinkId ?? null
    );
  }

  get participantProjectSubmittedAt(): string {
    const program = this.program as ProgramParticipationState | undefined;

    return (
      program?.participantProjectSubmittedAt ||
      this.getPartnerProgramSubmittedAt(this.participantProject) ||
      ""
    );
  }

  get participantProjectMembers() {
    return this.participantProject?.collaborators ?? [];
  }

  get participantProjectMaterials(): ParticipantProjectMaterial[] {
    const project = this.participantProject;
    if (!project) {
      return [];
    }

    const materials: ParticipantProjectMaterial[] = [];

    if (project.presentationAddress) {
      materials.push({
        title: "Презентация проекта",
        caption: this.fileCaption(project.presentationAddress),
        url: project.presentationAddress,
      });
    }

    (project.links ?? []).forEach((link, index) => {
      materials.push({
        title: index === 0 ? "Ссылка на решение" : `Ссылка ${index + 1}`,
        caption: "Ссылка",
        url: link,
      });
    });

    if (project.coverImageAddress) {
      materials.push({
        title: "Обложка проекта",
        caption: this.fileCaption(project.coverImageAddress),
        url: project.coverImageAddress,
      });
    }

    return materials;
  }

  get participantProjectPrimaryMaterial(): ParticipantProjectMaterial | null {
    return this.participantProjectMaterials[0] ?? null;
  }

  get participantCertificate(): IssuedCertificate | null {
    return this.myCertificate?.certificate ?? null;
  }

  get shouldShowCertificateCard(): boolean {
    return Boolean(
      this.isParticipant &&
        this.myCertificate &&
        (this.myCertificate.state !== "unavailable" || this.myCertificate.settings?.isEnabled)
    );
  }

  get participantCertificateTitle(): string {
    if (this.myCertificate?.state === "available") {
      return "Сертификат доступен";
    }
    if (this.myCertificate?.state === "scheduled") {
      return "Сертификат будет доступен после завершения чемпионата";
    }
    if (this.myCertificate?.state === "not_released") {
      return "Сертификат пока недоступен";
    }
    return "Сертификат пока недоступен";
  }

  get participantCertificateText(): string {
    if (this.myCertificate?.state === "available") {
      return "Поздравляем! Вы можете скачать PDF сертификата за участие в чемпионате.";
    }
    if (this.myCertificate?.state === "scheduled") {
      return "Организатор уже подготовил сертификат. Доступ откроется после даты завершения чемпионата.";
    }
    if (this.myCertificate?.state === "not_released") {
      return "Организатор откроет доступ вручную, когда сертификаты будут готовы к выдаче.";
    }
    return "Сертификат появится после сдачи проекта и генерации организатором.";
  }

  get participantNextStepTitle(): string {
    if (this.isParticipantWithoutProject) {
      return "Выберите проект для участия";
    }

    if (this.participantProjectSubmitted) {
      return "Проект успешно отправлен";
    }

    return "Подготовьте решение и сдайте проект";
  }

  get participantNextStepText(): string {
    if (this.isParticipantWithoutProject) {
      return "Чтобы продолжить участие в чемпионате, выберите существующий проект или создайте новый. После этого вы сможете приступить к подготовке решения.";
    }

    if (this.participantProjectSubmitted) {
      return "Редактирование и повторная сдача недоступны. Вы можете просматривать проект и отправленные материалы.";
    }

    return "Работайте над проектом, обновляйте материалы и отправьте решение на проверку до дедлайна.";
  }

  get showParticipationProgress(): boolean {
    return Boolean(
      this.program &&
        !this.program.isUserManager &&
        !this.program.isUserExpert &&
        !this.hasRole("organizer") &&
        !this.hasRole("expert") &&
        !this.isPlatformAdmin
    );
  }

  get participationGuideNote(): string {
    if (this.isNotRegisteredGuest) {
      return "Зарегистрируйтесь, чтобы продолжить";
    }

    if (this.participationActiveStep >= 4) {
      return "Проект сдан";
    }

    if (this.participationActiveStep === 3) {
      return "Проект привязан";
    }

    return "Вы зарегистрированы";
  }

  get participationSteps(): ParticipationStep[] {
    const activeStep = this.participationActiveStep;
    const steps = this.isNotRegisteredGuest
      ? [
          {
            title: "Зарегистрируйтесь",
            description: "Откройте доступ к участию",
          },
          {
            title: "Создайте или привяжите проект",
            description: "Выберите проектную основу участия",
          },
          {
            title: "Подготовьте решение",
            description: "Оформите материалы проекта",
          },
          {
            title: "Сдайте проект",
            description: "Отправьте работу на проверку",
          },
        ]
      : [
          {
            title: "Регистрация",
            description: "Вы успешно зарегистрированы",
          },
          {
            title: "Выбор проекта",
            description: "Выберите проект для участия",
          },
          {
            title: "Подготовка решения",
            description: "Подготовьте и оформите решение",
          },
          {
            title: "Сдача проекта",
            description: "Отправьте проект на рассмотрение",
          },
        ];

    return steps.map((step, index) => ({
      index: index + 1,
      title: step.title,
      description: step.description,
      active: activeStep === index + 1,
      completed: activeStep > index + 1,
    }));
  }

  requestRegistration(event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    window.dispatchEvent(new CustomEvent("program-registration-requested"));
  }

  requestCreateProject(event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    window.dispatchEvent(new CustomEvent("program-create-project-requested"));
  }

  requestBindProject(event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    window.dispatchEvent(new CustomEvent("program-bind-project-requested"));
  }

  requestProjectInvite(event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    window.dispatchEvent(new CustomEvent("program-invite-project-requested"));
  }

  openParticipantSubmitModal(event: Event): void {
    event.preventDefault();
    event.stopPropagation();

    if (
      !this.participantProjectRelationId ||
      this.participantProjectSubmitted ||
      this.participantProjectSubmitting
    ) {
      return;
    }

    this.participantSubmitModalOpen = true;
  }

  closeParticipantSubmitModal(): void {
    if (!this.participantProjectSubmitting) {
      this.participantSubmitModalOpen = false;
    }
  }

  confirmParticipantProjectSubmit(): void {
    const relationId = this.participantProjectRelationId;
    if (!relationId || this.participantProjectSubmitted || this.participantProjectSubmitting) {
      return;
    }

    this.participantProjectSubmitting = true;
    this.programService
      .submitCompettetiveProject(relationId)
      .pipe(finalize(() => (this.participantProjectSubmitting = false)))
      .subscribe({
        next: responseProject => {
          const project = this.participantProject;
          const program = this.program as ProgramParticipationState | undefined;
          const submittedAt = new Date().toISOString();

          if (program && project) {
            const updatedProject = {
              ...(responseProject ?? project),
              ...project,
              partnerProgram: project.partnerProgram
                ? {
                    ...project.partnerProgram,
                    isSubmitted: true,
                    submitted: true,
                    submittedAt,
                  }
                : project.partnerProgram,
            } as Project;
            const updatedProgram = {
              ...program,
              participantProject: updatedProject,
              participantProjectStatus: "submitted",
              participantProjectSubmittedAt: submittedAt,
            } as Program;

            this.program = updatedProgram;
            this.programDataService.setProgram(updatedProgram);
          }

          this.participantSubmitModalOpen = false;
          this.snackbar.success("Проект сдан на проверку");
        },
        error: () => this.snackbar.error("Не удалось сдать проект на проверку"),
      });
  }

  participantMemberInitial(member: { firstName?: string; lastName?: string }): string {
    return (member.firstName || member.lastName || "У").slice(0, 1);
  }

  get shouldShowAboutMore(): boolean {
    const description = this.program?.description;

    if (!description) {
      return false;
    }

    const text = description
      .replace(/<[^>]*>/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    return text.length > 260;
  }

  get programStages(): ProgramStageItem[] {
    if (!this.program) {
      return [];
    }

    const currentStageIndex = this.getCurrentStageIndex(this.program);

    return [
      {
        index: 1,
        title: "Регистрация",
        date: this.formatStageDate(this.program.datetimeRegistrationEnds, "до"),
        active: currentStageIndex === 1,
        completed: currentStageIndex > 1,
      },
      {
        index: 2,
        title: "Прием проектов",
        date: this.formatStageDate(this.program.datetimeProjectSubmissionEnds, "до"),
        active: currentStageIndex === 2,
        completed: currentStageIndex > 2,
      },
      {
        index: 3,
        title: "оценка проектов",
        date: this.program.datetimeEvaluationEnds
          ? this.formatStageDate(this.program.datetimeEvaluationEnds, "до")
          : "после приема проектов",
        active: currentStageIndex === 3,
        completed: currentStageIndex > 3,
      },
      {
        index: 4,
        title: "Финал и итоги",
        date: this.formatStageDate(this.program.datetimeFinished, ""),
        active: currentStageIndex === 4,
        completed: currentStageIndex > 4,
      },
    ];
  }

  private get participationActiveStep(): number {
    const program = this.program as ProgramParticipationState | undefined;

    if (!program?.isUserMember) {
      return 1;
    }

    if (this.hasSubmittedProject(program)) {
      return 4;
    }

    if (this.hasLinkedProject(program)) {
      return 3;
    }

    return 2;
  }

  @HostListener("window:resize")
  onResize(): void {
    this.appWidth = window.innerWidth;
  }

  ngOnInit(): void {
    const programIdSubscription = this.route.params
      .pipe(
        map(params => params["programId"]),
        tap(programId => {
          this.programId = programId;
          this.fetchNews(0, this.fetchLimit());
        })
      )
      .subscribe();

    const routeModalSubscription = this.route.queryParams.subscribe(param => {
      if (param["access"] === "accessDenied") {
        this.loadingService.hide();
        this.showProgramModal.set(true);
        this.showProgramModalErrorMessage.set("У вас нет доступа к этой вкладке");

        this.router.navigate([], {
          relativeTo: this.route,
          queryParams: { access: null },
          queryParamsHandling: "merge",
          replaceUrl: true,
        });
      }
    });

    const profileIdSubscription = this.authService.profile.subscribe({
      next: profile => {
        const profileWithFlags = profile as typeof profile & { is_staff?: boolean };
        this.profileId.set(profile.id);
        this.profileIsStaff.set(Boolean(profile.isStaff || profileWithFlags.is_staff));
      },
    });

    const programSubscription = this.route.data
      .pipe(
        map(r => r["data"]),
        tap((program: Program) => {
          this.program = program;
          this.programDataService.setProgram(program);
          this.registerDateExpired = Date.now() > Date.parse(program.datetimeRegistrationEnds);
          this.openRevisionModalIfNeeded(program);
          this.loadRoles(program);
          this.loadStats(program);
          this.loadMyCertificate(program);
        }),
        concatMap((program: Program) => {
          if (program.isUserMember) {
            return this.fetchNews(0, this.fetchLimit());
          }

          return of({} as ApiPagination<FeedNews>);
        })
      )
      .subscribe({
        next: news => {
          if (news.results?.length) {
            this.news.set(news.results);
            this.totalNewsCount.set(news.count);
            setTimeout(() => this.setupNewsObserver(), 100);
          }

          this.loadingService.hide();
        },
        error: () => {
          this.loadingService.hide();
          this.showProgramModal.set(true);
          this.showProgramModalErrorMessage.set("Произошла ошибка при загрузке программы");
        },
      });

    const sharedProgramSubscription = this.programDataService.program$.subscribe(program => {
      if (!program || !this.program || program.id !== this.program.id) {
        return;
      }

      this.program = { ...this.program, ...program };
      this.registerDateExpired = Date.now() > Date.parse(program.datetimeRegistrationEnds);
      this.openRevisionModalIfNeeded(this.program);
      this.cdRef.detectChanges();
    });

    setTimeout(() => {
      this.checkDescriptionExpandable();
      this.cdRef.detectChanges();
    }, 100);

    this.subscriptions.push(
      programIdSubscription,
      routeModalSubscription,
      profileIdSubscription,
      programSubscription,
      sharedProgramSubscription
    );
  }

  ngAfterViewInit(): void {
    setTimeout(() => {
      this.checkDescriptionExpandable();
      this.cdRef.detectChanges();
    }, 150);

    const target = document.querySelector(".office__body");
    if (target) {
      const scrollEvents = fromEvent(target, "scroll")
        .pipe(
          concatMap(() => this.onScroll()),
          throttleTime(2000)
        )
        .subscribe();
      this.subscriptions.push(scrollEvents);
    }
  }

  ngOnDestroy(): void {
    this.subscriptions.forEach(subscription => subscription.unsubscribe());
    this.roleResolver.clear(this.program?.id);
    this.revokeCertificatePreview();
  }

  hasRole(role: ProgramRole): boolean {
    return this.roles.includes(role);
  }

  onScroll(): Observable<ApiPagination<FeedNews> | object> {
    if (this.news().length < this.totalNewsCount()) {
      return this.fetchNews(this.fetchPage() * this.fetchLimit(), this.fetchLimit()).pipe(
        tap(({ results }) => {
          this.news.update(news => [...news, ...results]);
          if (results.length >= this.fetchLimit()) {
            this.fetchPage.update(p => p + 1);
          }

          setTimeout(() => this.setupNewsObserver(), 100);
        })
      );
    }

    const target = document.querySelector(".office__body");
    if (!target) {
      return of({});
    }

    const scrollBottom = target.scrollHeight - target.scrollTop - target.clientHeight;
    if (scrollBottom > 0) {
      return of({});
    }

    this.fetchPage.update(p => p + 1);
    return this.fetchNews(this.fetchPage() * this.fetchLimit(), this.fetchLimit());
  }

  fetchNews(offset: number, limit: number): Observable<ApiPagination<FeedNews>> {
    const programId = this.route.snapshot.params["programId"];
    return this.programNewsService.fetchNews(limit, offset, programId).pipe(
      tap(({ count, results }) => {
        this.totalNewsCount.set(count);
        this.news.update(news => [...news, ...results]);
      })
    );
  }

  onNewsInVew(entries: IntersectionObserverEntry[]): void {
    const ids = entries
      .map(entry => (entry.target as HTMLElement).dataset["id"])
      .filter((id): id is string => Boolean(id))
      .map(Number)
      .filter(Number.isFinite);
    this.programNewsService.readNews(this.route.snapshot.params["programId"], ids).subscribe(noop);
  }

  onAddNews(news: { text: string; files: string[] }): void {
    this.programNewsService
      .addNews(this.route.snapshot.params["programId"], news)
      .subscribe(newsRes => {
        this.newsFormComponent?.onResetForm();
        this.news.update(news => [newsRes, ...news]);
      });
  }

  onDelete(newsId: number): void {
    const item = this.news().find(news => news.id === newsId);
    if (!item) {
      return;
    }

    this.programNewsService.deleteNews(this.route.snapshot.params["programId"], newsId).subscribe({
      next: () => {
        this.news.update(news => news.filter(item => item.id !== newsId));
      },
    });
  }

  onLike(newsId: number): void {
    const item = this.news().find(news => news.id === newsId);
    if (!item) {
      return;
    }

    this.programNewsService
      .toggleLike(this.route.snapshot.params["programId"], newsId, !item.isUserLiked)
      .subscribe(() => {
        item.likesCount = item.isUserLiked ? item.likesCount - 1 : item.likesCount + 1;
        item.isUserLiked = !item.isUserLiked;
      });
  }

  onEdit(news: FeedNews, newsId: number): void {
    this.programNewsService
      .editNews(this.route.snapshot.params["programId"], newsId, news)
      .subscribe({
        next: responseNews => {
          const updatedNews = responseNews as FeedNews;
          this.news.update(items =>
            items.map(item => (item.id === updatedNews.id ? updatedNews : item))
          );
          this.ProgramNewsCardComponent?.onCloseEditMode();
        },
      });
  }

  onExpandDescription(elem: HTMLElement, expandedClass: string, isExpanded: boolean): void {
    expandElement(elem, expandedClass, isExpanded);
    this.readFullDescription = !isExpanded;
  }

  closeModal(): void {
    this.showProgramModal.set(false);
    this.loadingService.hide();
  }

  closeRevisionModal(): void {
    this.rememberRevisionModal();
    this.showRevisionModal.set(false);
  }

  editRevision(): void {
    const programId = this.program?.id;
    this.rememberRevisionModal();
    this.showRevisionModal.set(false);
    if (programId) {
      this.router.navigate(["/office/program", programId, "edit"]);
    }
  }

  clearAssignProjectToProgramError(): void {
    this.projectAdditionalService.clearAssignProjectToProgramError();
  }

  submitToModeration(): void {
    if (!this.program) {
      return;
    }

    this.programService
      .canSubmitToModeration(this.program.id)
      .pipe(
        switchMap(readiness => {
          const programId = this.program?.id;

          if (!programId) {
            throw new Error("Program is not loaded");
          }

          const canSubmit =
            readiness.canSubmitToModeration ?? readiness.can_submit_to_moderation ?? false;

          if (!canSubmit) {
            this.snackbar.error("Заполните обязательные блоки перед отправкой на модерацию");
            throw new Error("Program is not ready");
          }

          return this.programService.submitToModeration(programId);
        })
      )
      .subscribe({
        next: program => this.updateProgram(program, "Чемпионат отправлен на модерацию"),
        error: () => undefined,
      });
  }

  withdrawFromModeration(): void {
    const programId = this.program?.id;
    if (!programId) {
      return;
    }

    this.runProgramAction(
      () => this.programService.withdrawFromModeration(programId),
      "Модерация отозвана"
    );
  }

  approve(): void {
    const programId = this.program?.id;
    if (!programId) {
      return;
    }

    this.moderationService.decide(programId, { decision: "approve" }).subscribe({
      next: response => this.updateProgram(response.program, "Чемпионат одобрен"),
      error: () => this.snackbar.error("Не удалось одобрить чемпионат"),
    });
  }

  reject(payload: ProgramRejectPayload): void {
    const programId = this.program?.id;
    if (!programId) {
      return;
    }

    const comment = payload.comment.trim();
    if (!comment) {
      this.snackbar.error("Укажите причину отклонения");
      return;
    }

    this.moderationService
      .decide(programId, {
        decision: "reject",
        comment,
        reasonCode: "other",
        sectionsToFix: payload.sectionsToFix,
      })
      .subscribe({
        next: response => this.updateProgram(response.program, "Чемпионат отправлен на доработку"),
        error: () => this.snackbar.error("Не удалось отклонить чемпионат"),
      });
  }

  freeze(comment: string): void {
    const programId = this.program?.id;
    if (!programId) {
      return;
    }

    if (!comment) {
      this.snackbar.error("Укажите причину заморозки");
      return;
    }

    this.runProgramAction(
      () => this.programService.freeze(programId, comment),
      "Чемпионат заморожен"
    );
  }

  restore(): void {
    const programId = this.program?.id;
    if (!programId) {
      return;
    }

    this.runProgramAction(() => this.programService.restore(programId), "Чемпионат восстановлен");
  }

  archive(): void {
    const programId = this.program?.id;
    if (!programId) {
      return;
    }

    this.runProgramAction(() => this.programService.archive(programId), "Чемпионат архивирован");
  }

  contactSupport(): void {
    this.snackbar.info("Напишите в поддержку через раздел помощи");
  }

  downloadCertificate(event?: Event): void {
    event?.preventDefault();
    const programId = this.program?.id;
    const certificate = this.participantCertificate;
    if (!programId || !certificate) {
      return;
    }

    this.programService.downloadCertificate(programId, certificate.certificateId).subscribe({
      next: blob => saveAs(blob, `certificate-${certificate.certificateId}.pdf`),
      error: () => this.snackbar.error("Не удалось скачать сертификат"),
    });
  }

  viewCertificate(event?: Event): void {
    event?.preventDefault();
    const programId = this.program?.id;
    const certificate = this.participantCertificate;
    if (!programId || !certificate) {
      return;
    }

    this.programService.downloadCertificate(programId, certificate.certificateId).subscribe({
      next: blob => {
        this.revokeCertificatePreview();
        this.certificateObjectUrl = URL.createObjectURL(blob);
        this.certificatePreviewUrl = this.sanitizer.bypassSecurityTrustResourceUrl(
          this.certificateObjectUrl
        );
        this.certificatePreviewOpen = true;
        this.cdRef.detectChanges();
      },
      error: () => this.snackbar.error("Не удалось открыть сертификат"),
    });
  }

  closeCertificatePreview(): void {
    this.certificatePreviewOpen = false;
  }

  private loadRoles(program: Program): void {
    this.roleResolver.clear(program.id);
    const rolesSubscription = this.roleResolver.getRole(program.id, program).subscribe(roles => {
      this.roles = roles;
      this.cdRef.detectChanges();
    });

    this.subscriptions.push(rolesSubscription);
  }

  private loadStats(program: Program): void {
    const statsSubscription = this.programService
      .getStats(program.id)
      .pipe(
        catchError(() => of(this.buildStatsFromProgram(program))),
        map(stats => this.normalizeStats(program, stats))
      )
      .subscribe(stats => {
        this.stats = stats;
        this.cdRef.detectChanges();
      });

    this.subscriptions.push(statsSubscription);
  }

  private loadMyCertificate(program: Program): void {
    if (!program.isUserMember || program.isUserManager || program.isUserExpert) {
      this.myCertificate = null;
      return;
    }

    const certificateSubscription = this.programService
      .getMyCertificate(program.id)
      .pipe(catchError(() => of(null)))
      .subscribe(response => {
        this.myCertificate = response;
        this.cdRef.detectChanges();
      });

    this.subscriptions.push(certificateSubscription);
  }

  private buildStatsFromProgram(program: Program): ProgramStats {
    return {
      participantsCount: program.participantsCount ?? program.participants?.length ?? 0,
      participantsDeltaWeek: program.participantsDeltaWeek ?? 0,
      projectsCount: program.projectsCount ?? 0,
      activeProjectsCount: program.activeProjectsCount ?? 0,
      expertsCount: program.expertsCount ?? program.experts?.length ?? 0,
      expertsRemainingCount: program.expertsRemainingCount ?? 0,
    };
  }

  private normalizeStats(program: Program, stats: Partial<ProgramStats>): ProgramStats {
    return {
      participantsCount: stats.participantsCount ?? program.participantsCount ?? 0,
      participantsDeltaWeek: stats.participantsDeltaWeek ?? program.participantsDeltaWeek ?? 0,
      projectsCount: stats.projectsCount ?? program.projectsCount ?? 0,
      activeProjectsCount: stats.activeProjectsCount ?? program.activeProjectsCount ?? 0,
      expertsCount: stats.expertsCount ?? program.expertsCount ?? 0,
      expertsRemainingCount: stats.expertsRemainingCount ?? program.expertsRemainingCount ?? 0,
      currentPeriod: stats.currentPeriod,
    };
  }

  private formatStageDate(value: string, prefix: string): string {
    if (!value) {
      return "дата уточняется";
    }

    const date = new Date(value).toLocaleDateString("ru-RU", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });

    return prefix ? `${prefix} ${date}` : date;
  }

  private getCurrentStageIndex(program: Program): number {
    if (this.isDateInFuture(program.datetimeRegistrationEnds)) {
      return 1;
    }

    if (this.isDateInFuture(program.datetimeProjectSubmissionEnds)) {
      return 2;
    }

    if (this.isDateInFuture(program.datetimeEvaluationEnds)) {
      return 3;
    }

    return 4;
  }

  private isDateInFuture(value?: string | null): boolean {
    if (!value) {
      return false;
    }

    const time = Date.parse(value);

    return Number.isFinite(time) && Date.now() <= time;
  }

  private hasLinkedProject(program: ProgramParticipationState): boolean {
    return Boolean(program.assignedProject || program.participantProject || program.project);
  }

  private hasSubmittedProject(program: ProgramParticipationState): boolean {
    const status = String(program.participantProjectStatus ?? program.projectStatus ?? "")
      .trim()
      .toLowerCase();

    return (
      ["submitted", "on_review", "review", "approved", "rejected"].includes(status) ||
      this.isPartnerProgramSubmitted(this.participantProject)
    );
  }

  private isPartnerProgramSubmitted(project?: Project | null): boolean {
    const relation = project?.partnerProgram;

    return Boolean(relation?.submitted || relation?.isSubmitted);
  }

  private getPartnerProgramSubmittedAt(project?: Project | null): string {
    const relation = project?.partnerProgram;

    return relation?.submittedAt ?? relation?.submitted_at ?? "";
  }

  private toNumberOrNull(value: unknown): number | null {
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }

    if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) {
      return Number(value);
    }

    return null;
  }

  private fileCaption(url: string): string {
    const extension = url.split("?")[0].split(".").pop();

    return extension ? extension.toUpperCase() : "Материал";
  }

  private runProgramAction(
    request: () => ReturnType<ProgramService["getOne"]>,
    successMessage: string
  ): void {
    if (!this.program) {
      return;
    }

    request().subscribe({
      next: program => this.updateProgram(program, successMessage),
      error: () => this.snackbar.error("Не удалось выполнить действие"),
    });
  }

  private updateProgram(program: Partial<Program>, message: string): void {
    if (!this.program) {
      return;
    }

    this.program = { ...this.program, ...program } as Program;
    this.programDataService.setProgram(this.program);
    this.openRevisionModalIfNeeded(this.program);
    this.snackbar.success(message);
    this.cdRef.detectChanges();
  }

  private checkDescriptionExpandable(): void {
    const descElement = this.descEl?.nativeElement;

    if (!descElement || !this.program?.description) {
      this.descriptionExpandable = false;
      return;
    }

    this.descriptionExpandable = descElement.scrollHeight > descElement.clientHeight;
  }

  private setupNewsObserver(): void {
    const observer = new IntersectionObserver(this.onNewsInVew.bind(this), {
      root: document.querySelector(".office__body"),
      rootMargin: "0px 0px 0px 0px",
      threshold: 0,
    });

    document.querySelectorAll(".news__item").forEach(element => {
      observer.observe(element);
    });
  }

  private openRevisionModalIfNeeded(program: Program): void {
    if (program.status !== "rejected" || !program.isUserManager || !program.moderationResult) {
      this.showRevisionModal.set(false);
      return;
    }

    const key = this.revisionModalKey(program);
    if (!key || sessionStorage.getItem(key) === "seen") {
      return;
    }

    this.showRevisionModal.set(true);
  }

  private rememberRevisionModal(): void {
    if (!this.program) {
      return;
    }

    const key = this.revisionModalKey(this.program);
    if (key) {
      sessionStorage.setItem(key, "seen");
    }
  }

  private revisionModalKey(program: Program): string {
    const rejectedAt = program.moderationResult?.rejectedAt ?? program.moderationResult?.createdAt;
    return rejectedAt ? `program-revision-modal:${program.id}:${rejectedAt}` : "";
  }

  private revisionSectionLabel(key: string): string {
    const labels: Record<string, string> = {
      basicInfo: "Основная информация",
      basic_info: "Основная информация",
      dates: "Сроки и формат",
      registration: "Регистрация",
      materials: "Материалы",
      criteriaExperts: "Критерии и эксперты",
      criteria_experts: "Критерии и эксперты",
      visualAssets: "Обложка и визуальные материалы",
      visual_assets: "Обложка и визуальные материалы",
      verification: "Верификация",
      certificateTemplate: "Сертификат",
      certificate_template: "Сертификат",
    };
    return labels[key] ?? key;
  }

  private revokeCertificatePreview(): void {
    if (this.certificateObjectUrl) {
      URL.revokeObjectURL(this.certificateObjectUrl);
      this.certificateObjectUrl = undefined;
    }
    this.certificatePreviewUrl = null;
  }
}
