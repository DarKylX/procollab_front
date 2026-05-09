/** @format */
import {
  ChangeDetectorRef,
  Component,
  ElementRef,
  HostListener,
  OnDestroy,
  OnInit,
  signal,
  ViewChild,
} from "@angular/core";
import { ProgramService } from "@office/program/services/program.service";
import { ActivatedRoute, Router, RouterModule } from "@angular/router";
import { HttpParams } from "@angular/common/http";
import {
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
import {
  formatProgramParticipation,
  Program,
  ProgramParticipantProject,
} from "@office/program/models/program.model";
import { ProgramNewsService } from "@office/program/services/program-news.service";
import { FeedNews } from "@office/projects/models/project-news.model";
import { expandElement } from "@utils/expand-element";
import { ParseBreaksPipe, ParseLinksPipe } from "projects/core";
import { ProgramLinksComponent } from "@office/features/program-links/program-links.component";
import { ProgramNewsCardComponent } from "../shared/news-card/news-card.component";
import { ButtonComponent, IconComponent } from "@ui/components";
import { ApiPagination } from "@models/api-pagination.model";
import { Project } from "@models/project.model";
import { TagComponent } from "@ui/components/tag/tag.component";
import { ProjectService } from "@office/services/project.service";
import { ModalComponent } from "@ui/components/modal/modal.component";
import { MatProgressBarModule } from "@angular/material/progress-bar";
import { LoadingService } from "@office/services/loading.service";
import { ProjectAdditionalService } from "@office/projects/edit/services/project-additional.service";
import { SoonCardComponent } from "@office/shared/soon-card/soon-card.component";
import { NewsFormComponent } from "@office/features/news-form/news-form.component";
import { AsyncPipe, DatePipe } from "@angular/common";
import { AvatarComponent } from "@uilib";
import { NewsCardComponent } from "@office/features/news-card/news-card.component";
import { AuthService } from "@auth/services";

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
    ParseBreaksPipe,
    ParseLinksPipe,
    ModalComponent,
    MatProgressBarModule,
    SoonCardComponent,
    NewsFormComponent,
    ProgramLinksComponent,
    RouterModule,
    DatePipe,
  ],
})
export class ProgramDetailMainComponent implements OnInit, OnDestroy {
  constructor(
    private readonly programService: ProgramService,
    private readonly programNewsService: ProgramNewsService,
    private readonly projectAdditionalService: ProjectAdditionalService,
    private readonly projectService: ProjectService,
    private readonly authService: AuthService,
    private readonly router: Router,
    private readonly route: ActivatedRoute,
    private readonly cdRef: ChangeDetectorRef,
    private readonly loadingService: LoadingService
  ) {}

  get isAssignProjectToProgramError() {
    return this.projectAdditionalService.getIsAssignProjectToProgramError()();
  }

  get errorAssignProjectToProgramModalMessage() {
    return this.projectAdditionalService.getErrorAssignProjectToProgramModalMessage();
  }

  appWidth = window.innerWidth;

  @HostListener("window:resize")
  onResize() {
    this.appWidth = window.innerWidth;
  }

  news = signal<FeedNews[]>([]);
  totalNewsCount = signal(0);
  fetchLimit = signal(10);
  fetchPage = signal(0);

  // Сигналы для работы с модальными окнами с текстом
  showProgramModal = signal(false);
  showProgramModalErrorMessage = signal<string | null>(null);

  registeredProgramModal = signal<boolean>(false);
  participantProjectSubmitting = false;
  participantProjectSubmitError = "";
  participantProjectPickerOpen = false;
  participantProjectLoading = false;
  participantProjectLinking = false;
  participantProjectCreateLoading = false;
  participantProjectLinkError = "";
  participantProjectOptions: Project[] = [];

  programId?: number;
  profileId = signal<number | undefined>(undefined);

  subscriptions$ = signal<Subscription[]>([]);

  ngOnInit(): void {
    const programIdSubscription$ = this.route.params
      .pipe(
        map(params => params["programId"]),
        tap(programId => {
          this.programId = programId;
          this.fetchNews(0, this.fetchLimit());
        })
      )
      .subscribe();

    const routeModalSub$ = this.route.queryParams.subscribe(param => {
      if (param["access"] === "accessDenied") {
        this.loadingService.hide();

        this.showProgramModal.set(true);
        this.showProgramModalErrorMessage.set("У вас не доступа к этой вкладке!");

        this.router.navigate([], {
          relativeTo: this.route,
          queryParams: { access: null },
          queryParamsHandling: "merge",
          replaceUrl: true,
        });
      }
    });

    const profileIdSub$ = this.authService.profile.subscribe({
      next: profile => {
        this.profileId.set(profile.id);
      },
    });

    this.subscriptions$().push(profileIdSub$);

    const program$ = this.route.data
      .pipe(
        map(r => r["data"]),
        tap(program => {
          this.program = program;
          this.registerDateExpired = Date.now() > Date.parse(program.datetimeRegistrationEnds);
          if (program.isUserMember) {
            const seen = this.hasSeenRegisteredProgramModal(program.id);
            if (!seen) {
              this.registeredProgramModal.set(true);
              this.markSeenRegisteredProgramModal(program.id);
            }
          }
        }),
        concatMap(program => {
          if (program.isUserMember) {
            return this.fetchNews(0, this.fetchLimit());
          } else {
            return of({} as ApiPagination<FeedNews>);
          }
        })
      )
      .subscribe({
        next: news => {
          if (news.results?.length) {
            this.news.set(news.results);
            this.totalNewsCount.set(news.count);

            setTimeout(() => {
              this.setupNewsObserver();
            }, 100);
          }

          this.loadingService.hide();
        },
        error: () => {
          this.loadingService.hide();

          this.showProgramModal.set(true);
          this.showProgramModalErrorMessage.set("Произошла ошибка при загрузке программы");
        },
      });

    setTimeout(() => {
      this.checkDescriptionExpandable();
      this.cdRef.detectChanges();
    }, 100);

    this.loadEvent = fromEvent(window, "load");

    this.subscriptions$().push(program$);
    this.subscriptions$().push(programIdSubscription$);
    this.subscriptions$().push(routeModalSub$);
  }

  ngAfterViewInit() {
    setTimeout(() => {
      this.checkDescriptionExpandable();
      this.cdRef.detectChanges();
    }, 150);

    const target = document.querySelector(".office__body");
    if (target) {
      const scrollEvents$ = fromEvent(target, "scroll")
        .pipe(
          concatMap(() => this.onScroll()),
          throttleTime(2000)
        )
        .subscribe();
      this.subscriptions$().push(scrollEvents$);
    }
  }

  ngOnDestroy(): void {
    this.subscriptions$().forEach($ => $.unsubscribe());
  }

  onScroll() {
    if (this.news().length < this.totalNewsCount()) {
      return this.fetchNews(this.fetchPage() * this.fetchLimit(), this.fetchLimit()).pipe(
        tap(({ results }) => {
          this.news.update(news => [...news, ...results]);
          if (results.length < this.fetchLimit()) {
            // console.log('No more to fetch')
          } else {
            this.fetchPage.update(p => p + 1);
          }

          setTimeout(() => {
            this.setupNewsObserver();
          }, 100);
        })
      );
    }

    const target = document.querySelector(".office__body");
    if (!target) return of({});
    const scrollBottom = target.scrollHeight - target.scrollTop - target.clientHeight;
    if (scrollBottom > 0) return of({});
    this.fetchPage.update(p => p + 1);
    return this.fetchNews(this.fetchPage() * this.fetchLimit(), this.fetchLimit());
  }

  fetchNews(offset: number, limit: number) {
    const programId = this.route.snapshot.params["programId"];
    return this.programNewsService.fetchNews(limit, offset, programId).pipe(
      tap(({ count, results }) => {
        this.totalNewsCount.set(count);
        this.news.update(news => [...news, ...results]);
      })
    );
  }

  @ViewChild(NewsFormComponent) newsFormComponent?: NewsFormComponent;
  @ViewChild(ProgramNewsCardComponent) ProgramNewsCardComponent?: ProgramNewsCardComponent;
  @ViewChild("descEl") descEl?: ElementRef;

  onNewsInVew(entries: IntersectionObserverEntry[]): void {
    const ids = entries.map(e => {
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      return e.target.dataset.id;
    });
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

  onDelete(newsId: number) {
    const item = this.news().find((n: any) => n.id === newsId);
    if (!item) return;
    this.programNewsService.deleteNews(this.route.snapshot.params["programId"], newsId).subscribe({
      next: () => {
        const index = this.news().findIndex(news => news.id === newsId);
        this.news().splice(index, 1);
      },
    });
  }

  onLike(newsId: number) {
    const item = this.news().find((n: any) => n.id === newsId);
    if (!item) return;
    this.programNewsService
      .toggleLike(this.route.snapshot.params["programId"], newsId, !item.isUserLiked)
      .subscribe(() => {
        item.likesCount = item.isUserLiked ? item.likesCount - 1 : item.likesCount + 1;
        item.isUserLiked = !item.isUserLiked;
      });
  }

  onEdit(news: FeedNews, newsId: number) {
    this.programNewsService
      .editNews(this.route.snapshot.params["programId"], newsId, news)
      .subscribe({
        next: (resNews: any) => {
          const newsIdx = this.news().findIndex(n => n.id === resNews.id);
          this.news()[newsIdx] = resNews;
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

  clearAssignProjectToProgramError(): void {
    this.projectAdditionalService.clearAssignProjectToProgramError();
  }

  openParticipantProjectPicker(): void {
    if (!this.program) {
      return;
    }

    this.participantProjectPickerOpen = true;
    this.participantProjectLinkError = "";
    this.participantProjectLoading = true;

    this.projectService
      .getMy(new HttpParams({ fromObject: { limit: 100, offset: 0 } }))
      .pipe(finalize(() => (this.participantProjectLoading = false)))
      .subscribe({
        next: response => {
          this.participantProjectOptions = response.results ?? [];
        },
        error: error => {
          this.participantProjectOptions = [];
          this.participantProjectLinkError = this.getParticipantProjectLinkErrorText(error);
        },
      });
  }

  closeParticipantProjectPicker(): void {
    if (this.participantProjectLinking || this.participantProjectCreateLoading) {
      return;
    }

    this.participantProjectPickerOpen = false;
  }

  linkExistingParticipantProject(project: Project): void {
    const program = this.program;
    if (!program || this.participantProjectLinking || this.participantProjectCreateLoading) {
      return;
    }

    this.participantProjectLinkError = "";
    this.participantProjectLinking = true;
    this.programService
      .applyProjectToProgram(program.id, { projectId: project.id, programFieldValues: [] })
      .pipe(finalize(() => (this.participantProjectLinking = false)))
      .subscribe({
        next: response => this.applyParticipantProjectLink(program, project, response),
        error: error => {
          this.participantProjectLinkError = this.getParticipantProjectLinkErrorText(error);
        },
      });
  }

  createDraftParticipantProject(): void {
    const program = this.program;
    if (!program || this.participantProjectLinking || this.participantProjectCreateLoading) {
      return;
    }

    this.participantProjectLinkError = "";
    this.participantProjectCreateLoading = true;
    this.projectService
      .create()
      .pipe(
        switchMap(project =>
          this.programService
            .applyProjectToProgram(program.id, { projectId: project.id, programFieldValues: [] })
            .pipe(map(response => ({ project, response })))
        ),
        finalize(() => (this.participantProjectCreateLoading = false))
      )
      .subscribe({
        next: ({ project, response }) => {
          this.applyParticipantProjectLink(program, project, response);
          this.router.navigate(["/office/projects", project.id, "edit"]);
        },
        error: error => {
          this.participantProjectLinkError = this.getParticipantProjectLinkErrorText(error);
        },
      });
  }

  submitParticipantProject(): void {
    const relationId = this.participantProjectRelationId;
    if (!relationId || this.participantProjectSubmitting || this.participantProjectSubmitted) {
      return;
    }

    this.participantProjectSubmitError = "";
    this.participantProjectSubmitting = true;
    this.programService
      .submitCompettetiveProject(relationId)
      .pipe(finalize(() => (this.participantProjectSubmitting = false)))
      .subscribe({
        next: () => {
          const submittedAt = new Date().toISOString();
          if (!this.program) {
            return;
          }

          this.program = {
            ...this.program,
            participantProjectStatus: "submitted",
            participantProjectSubmittedAt: submittedAt,
            participantProject: this.participantProject
              ? {
                  ...this.participantProject,
                  partnerProgram: {
                    ...(this.participantProject.partnerProgram ?? {
                      programId: this.program.id,
                      programLinkId: relationId,
                      isSubmitted: false,
                    }),
                    isSubmitted: true,
                    submitted: true,
                    submittedAt,
                  },
                }
              : null,
          };
        },
        error: (error: any) => {
          this.participantProjectSubmitError = this.getSubmitErrorText(error);
        },
      });
  }

  private loadEvent?: Observable<Event>;

  private checkDescriptionExpandable(): void {
    const descElement = this.descEl?.nativeElement;

    if (!descElement || !this.program?.description) {
      this.descriptionExpandable = false;
      return;
    }

    this.descriptionExpandable = descElement.scrollHeight > descElement.clientHeight;
  }

  private getRegisteredProgramSeenKey(programId: number): string {
    return `program_${this.profileId()}_modal_seen_${programId}`;
  }

  private hasSeenRegisteredProgramModal(programId: number): boolean {
    try {
      return !!localStorage.getItem(this.getRegisteredProgramSeenKey(programId));
    } catch (e) {
      return false;
    }
  }

  private markSeenRegisteredProgramModal(programId: number): void {
    try {
      localStorage.setItem(this.getRegisteredProgramSeenKey(programId), "1");
    } catch (e) {}
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

  program?: Program;
  registerDateExpired!: boolean;
  descriptionExpandable!: boolean;
  readFullDescription = false;

  get contactLinks(): { label: string; url: string }[] {
    return (this.program?.links ?? []).map(link => ({ label: link, url: link }));
  }

  get materialLinks(): { label: string; url: string }[] {
    return (this.program?.materials ?? []).map(m => ({ label: m.title, url: m.url }));
  }

  get participationText(): string {
    return formatProgramParticipation(this.program);
  }

  get participantProject(): ProgramParticipantProject | null {
    return this.program?.participantProject ?? null;
  }

  get participantProjectRelationId(): number | null {
    return this.program?.programLinkId ?? this.participantProject?.partnerProgram?.programLinkId ?? null;
  }

  get participantProjectSubmitted(): boolean {
    return (
      this.program?.participantProjectStatus === "submitted" ||
      Boolean(
        this.participantProject?.partnerProgram?.submitted ||
          this.participantProject?.partnerProgram?.isSubmitted
      )
    );
  }

  get participantProjectSubmittedAt(): string | null {
    return (
      this.program?.participantProjectSubmittedAt ??
      this.participantProject?.partnerProgram?.submittedAt ??
      null
    );
  }

  get participantProjectStatusText(): string {
    if (!this.participantProject) {
      return "Проект пока не выбран";
    }
    return this.participantProjectSubmitted ? "Проект сдан" : "Проект не сдан";
  }

  get availableParticipantProjects(): Project[] {
    const currentProjectId = this.participantProject?.id ?? null;
    return this.participantProjectOptions.filter(project => {
      if (project.id === currentProjectId) {
        return false;
      }

      return !project.partnerProgram;
    });
  }

  projectOptionDescription(project: Project): string {
    return project.shortDescription || project.description || "Описание проекта пока не заполнено";
  }

  private applyParticipantProjectLink(program: Program, project: Project, response: any): void {
    const relationId =
      response?.programLinkId ??
      response?.program_link_id ??
      project.partnerProgram?.programLinkId ??
      null;

    this.program = {
      ...program,
      programLinkId: relationId,
      participantProjectStatus: "not_submitted",
      participantProjectSubmittedAt: null,
      participantProject: {
        id: project.id,
        name: project.name || "",
        description: project.description || "",
        shortDescription: project.shortDescription || "",
        imageAddress: project.imageAddress || "",
        coverImageAddress: project.coverImageAddress || "",
        presentationAddress: project.presentationAddress || "",
        draft: project.draft,
        partnerProgram: relationId
          ? {
              programId: program.id,
              programLinkId: relationId,
              isSubmitted: false,
              submitted: false,
              submittedAt: null,
            }
          : undefined,
      },
    };
    this.participantProjectPickerOpen = false;
  }

  private getSubmitErrorText(error: any): string {
    const detail = error?.error?.detail;
    if (detail) {
      return String(detail);
    }

    const projectError = error?.error?.project;
    if (projectError) {
      return String(projectError);
    }

    const nonFieldErrors = error?.error?.nonFieldErrors ?? error?.error?.non_field_errors;
    if (Array.isArray(nonFieldErrors) && nonFieldErrors.length) {
      return String(nonFieldErrors[0]);
    }

    return "Не удалось сдать проект. Проверьте данные и попробуйте еще раз.";
  }

  private getParticipantProjectLinkErrorText(error: any): string {
    const detail = error?.error?.detail;
    if (detail) {
      return String(detail);
    }

    const projectId = error?.error?.projectId ?? error?.error?.project_id;
    if (projectId) {
      return Array.isArray(projectId) ? String(projectId[0]) : String(projectId);
    }

    const nonFieldErrors = error?.error?.nonFieldErrors ?? error?.error?.non_field_errors;
    if (Array.isArray(nonFieldErrors) && nonFieldErrors.length) {
      return String(nonFieldErrors[0]);
    }

    return "Не удалось привязать проект к чемпионату. Проверьте проект и попробуйте еще раз.";
  }
}
