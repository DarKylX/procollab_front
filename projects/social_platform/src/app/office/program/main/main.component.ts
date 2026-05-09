/** @format */

import { ChangeDetectorRef, Component, OnDestroy, OnInit, signal } from "@angular/core";
import { ActivatedRoute, Params, Router, RouterLink } from "@angular/router";
import { FormBuilder, FormGroup, ReactiveFormsModule } from "@angular/forms";
import {
  catchError,
  combineLatest,
  debounceTime,
  distinctUntilChanged,
  forkJoin,
  map,
  of,
  Observable,
  Subscription,
  switchMap,
  tap,
} from "rxjs";
import { HttpParams } from "@angular/common/http";
import Fuse from "fuse.js";
import { Program } from "@office/program/models/program.model";
import { ApiPagination } from "@models/api-pagination.model";
import { ProgramService } from "../services/program.service";
import { AllProgramsComponent } from "./sections/all-programs/all-programs.component";
import { MyProgramsComponent } from "./sections/my-programs/my-programs.component";
import { SearchComponent } from "@ui/components/search/search.component";

type ProgramTab = "all" | "my";
type RegistrationSort = "asc" | "desc" | "";
type ProgramWithParticipantCounters = Program & {
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

@Component({
  selector: "app-main",
  templateUrl: "./main.component.html",
  styleUrl: "./main.component.scss",
  standalone: true,
  imports: [
    ReactiveFormsModule,
    RouterLink,
    SearchComponent,
    AllProgramsComponent,
    MyProgramsComponent,
  ],
})
export class ProgramMainComponent implements OnInit, OnDestroy {
  constructor(
    private readonly route: ActivatedRoute,
    private readonly router: Router,
    private readonly programService: ProgramService,
    private readonly cdref: ChangeDetectorRef,
    private readonly fb: FormBuilder
  ) {
    this.searchForm = this.fb.group({
      search: [""],
    });
  }

  programCount = 0;
  programs: Program[] = [];
  searchedPrograms: Program[] = [];
  searchForm: FormGroup;
  subscriptions$: Subscription[] = [];
  isPparticipating = signal<boolean>(false);
  verifiedOnly = signal<boolean>(false);
  registrationOpenOnly = signal<boolean>(false);
  registrationSort = signal<RegistrationSort>("");
  isLoadingPrograms = signal<boolean>(true);
  hasLoadedPrograms = signal<boolean>(false);
  activeTab: ProgramTab = "all";
  private currentSearch = "";
  private lastRequestKey = "";
  private readonly programsResponseCache = new Map<string, ApiPagination<Program>>();
  private readonly participantCountCache = new Map<number, number>();
  private requestVersion = 0;

  ngOnInit(): void {
    this.syncSearchControl(this.route.snapshot.queryParamMap.get("search") ?? "");

    const searchControl$ = this.searchForm
      .get("search")
      ?.valueChanges.pipe(debounceTime(300), distinctUntilChanged())
      .subscribe(search => {
        this.updateQuery({ search: search || null });
      });

    if (searchControl$) {
      this.subscriptions$.push(searchControl$);
    }

    const combined$ = combineLatest([
      this.route.data.pipe(map(data => (data["tab"] ?? "all") as ProgramTab)),
      this.route.queryParams.pipe(
        debounceTime(300),
        map(q => ({
          filter: this.buildFilterQuery(q),
          search: q["search"] || "",
          verifiedOnly: q["verified_only"] === "true",
          registrationOpenOnly: q["registration_open"] === "true",
          registrationSort: (q["registration_sort"] || "") as RegistrationSort,
        })),
        distinctUntilChanged((a, b) => JSON.stringify(a) === JSON.stringify(b))
      ),
    ])
      .pipe(
        switchMap(([tab, query]) => {
          this.activeTab = tab;
          this.currentSearch = query.search;
          const requestKey = JSON.stringify({ tab, filter: query.filter });
          const shouldLoadPrograms = requestKey !== this.lastRequestKey || !this.hasLoadedPrograms();
          const requestVersion = shouldLoadPrograms ? ++this.requestVersion : this.requestVersion;
          this.isLoadingPrograms.set(shouldLoadPrograms && !this.programs.length);
          this.syncSearchControl(query.search);
          this.isPparticipating.set(query.filter["participating"] === "true");
          if (this.route.snapshot.queryParamMap.get("participating") === "false") {
            this.updateQuery({ participating: null });
          }
          this.verifiedOnly.set(query.verifiedOnly);
          this.registrationOpenOnly.set(query.registrationOpenOnly);
          this.registrationSort.set(query.registrationSort);

          const cachedResponse = this.programsResponseCache.get(requestKey);
          if (cachedResponse) {
            this.lastRequestKey = requestKey;
            return of({
              response: cachedResponse,
              search: query.search,
              requestVersion,
              hydrateCounters: false,
            });
          }

          if (!shouldLoadPrograms) {
            return of({
              response: this.buildCachedProgramsResponse(),
              search: query.search,
              requestVersion,
              hydrateCounters: false,
            });
          }

          this.lastRequestKey = requestKey;
          const request$: Observable<ApiPagination<Program>> =
            tab === "my"
              ? this.programService.getMyPrograms().pipe(
                  map(
                    results =>
                      ({
                        count: results.length,
                        next: "",
                        previous: "",
                        results,
                      }) as ApiPagination<Program>
                  )
                )
              : this.programService
                  .getAll(0, 100, new HttpParams({ fromObject: query.filter }));

          return request$.pipe(
            tap(response => this.programsResponseCache.set(requestKey, response)),
            catchError(() =>
              of(this.programsResponseCache.get(requestKey) ?? this.emptyProgramsResponse())
            ),
            map(response => ({
              response,
              search: query.search,
              requestVersion,
              hydrateCounters: tab === "all",
            }))
          );
        })
      )
      .subscribe({
        next: ({ response, search, requestVersion, hydrateCounters }) => {
          this.isLoadingPrograms.set(false);
          this.hasLoadedPrograms.set(true);
          this.programCount = response.count;
          this.programs = (response.results ?? []).map(program =>
            this.mergeCachedParticipantCounter(program)
          );
          this.searchedPrograms = this.filterBySearch(this.programs, search);
          this.cdref.detectChanges();

          if (hydrateCounters) {
            this.hydrateParticipantCountersInBackground(response, search, requestVersion);
          }
        },
        error: () => {
          this.isLoadingPrograms.set(false);
          this.hasLoadedPrograms.set(true);
          this.programCount = 0;
          this.programs = [];
          this.searchedPrograms = [];
          this.cdref.detectChanges();
        },
      });

    this.subscriptions$.push(combined$);
  }

  onVerifiedOnlyChange(value: boolean): void {
    this.verifiedOnly.set(value);
    this.updateQuery({ verified_only: value ? "true" : null });
  }

  onRegistrationOpenOnlyChange(value: boolean): void {
    this.registrationOpenOnly.set(value);
    this.updateQuery({ registration_open: value ? "true" : null });
  }

  onRegistrationSortChange(value: RegistrationSort): void {
    this.registrationSort.set(value);
    this.updateQuery({ registration_sort: value || null });
  }

  onTogglePparticipating(): void {
    const newValue = !this.isPparticipating();
    this.isPparticipating.set(newValue);
    this.updateQuery({ participating: newValue ? "true" : null });
  }

  ngOnDestroy(): void {
    this.subscriptions$.forEach($ => $?.unsubscribe());
  }

  private filterBySearch(programs: Program[], search: string): Program[] {
    if (!search) {
      return programs;
    }

    const fuse = new Fuse(programs, {
      keys: ["name", "city", "tag"],
      threshold: 0.3,
    });

    return fuse.search(search).map(el => el.item);
  }

  private hydrateParticipantCountersInBackground(
    response: ApiPagination<Program>,
    search: string,
    requestVersion: number
  ): void {
    const hydrationSubscription = this.hydrateParticipantCounters(response).subscribe(hydrated => {
      if (requestVersion !== this.requestVersion || this.activeTab !== "all") {
        return;
      }

      this.programs = (hydrated.results ?? []).map(program => {
        this.cacheParticipantCounter(program);
        return this.mergeCachedParticipantCounter(program);
      });
      this.searchedPrograms = this.filterBySearch(this.programs, this.currentSearch || search);
      this.cdref.detectChanges();
    });

    this.subscriptions$.push(hydrationSubscription);
  }

  private buildCachedProgramsResponse(): ApiPagination<Program> {
    return {
      count: this.programs.length,
      next: "",
      previous: "",
      results: this.programs,
    } as ApiPagination<Program>;
  }

  private emptyProgramsResponse(): ApiPagination<Program> {
    return {
      count: 0,
      next: "",
      previous: "",
      results: [],
    } as ApiPagination<Program>;
  }

  private hydrateParticipantCounters(
    response: ApiPagination<Program>
  ): Observable<ApiPagination<Program>> {
    const programs = response.results ?? [];

    if (!programs.length) {
      return of(response);
    }

    const hydratedPrograms$ = programs.map(program =>
      this.hydrateProgramParticipantCounter(program)
    );

    return forkJoin(hydratedPrograms$).pipe(
      map(results => ({
        ...response,
        results,
      }))
    );
  }

  private hydrateProgramParticipantCounter(program: Program): Observable<Program> {
    const cachedCount = this.participantCountCache.get(program.id);
    if (cachedCount !== undefined) {
      return of(this.withParticipantCounter(program, cachedCount));
    }

    const currentCount = this.resolveParticipantsCount(program);

    if (this.hasKnownParticipantsCount(program)) {
      this.participantCountCache.set(program.id, currentCount);
      return of(program);
    }

    return this.programService.getStats(program.id).pipe(
      switchMap(stats => {
        const statsCount = stats.participantsCount ?? currentCount;

        if (statsCount > 0) {
          return of(this.withParticipantCounter(program, statsCount));
        }

        return this.programService.getAllMembers(program.id, 0, 1).pipe(
          map(members => this.withParticipantCounter(program, members.count ?? statsCount)),
          catchError(() => of(this.withParticipantCounter(program, statsCount)))
        );
      }),
      catchError(() =>
        this.programService.getAllMembers(program.id, 0, 1).pipe(
          map(members => this.withParticipantCounter(program, members.count ?? currentCount)),
          catchError(() => of(program))
        )
      )
    );
  }

  private mergeCachedParticipantCounter(program: Program): Program {
    const cachedCount = this.participantCountCache.get(program.id);
    const currentCount = this.resolveParticipantsCount(program);

    if (this.hasKnownParticipantsCount(program)) {
      this.participantCountCache.set(program.id, currentCount);
      return program;
    }

    if (cachedCount === undefined) {
      return program;
    }

    return this.withParticipantCounter(program, cachedCount);
  }

  private cacheParticipantCounter(program: Program): void {
    const count = this.resolveParticipantsCount(program);

    if (this.hasKnownParticipantsCount(program)) {
      this.participantCountCache.set(program.id, count);
    }
  }

  private withParticipantCounter(program: Program, participantsCount: number): Program {
    this.participantCountCache.set(program.id, participantsCount);

    return {
      ...program,
      participantsCount,
    };
  }

  private resolveParticipantsCount(program: Program): number {
    const item = program as ProgramWithParticipantCounters;
    const values = [
      item.participantsCount,
      item.participants_count,
      item.participantCount,
      item.participantTotal,
      item.participantsTotal,
      item.registrationsCount,
      item.registeredParticipantsCount,
      item.registeredUsersCount,
      item.membersCount,
      item.members_count,
      item.participants?.length,
      item.members?.length,
      item.registrations?.length,
    ];
    const numericValues = values.filter((value): value is number => typeof value === "number");

    return numericValues.find(value => value > 0) ?? numericValues[0] ?? 0;
  }

  private hasKnownParticipantsCount(program: Program): boolean {
    const item = program as ProgramWithParticipantCounters;
    const values = [
      item.participantsCount,
      item.participants_count,
      item.participantCount,
      item.participantTotal,
      item.participantsTotal,
      item.registrationsCount,
      item.registeredParticipantsCount,
      item.registeredUsersCount,
      item.membersCount,
      item.members_count,
      item.participants?.length,
      item.members?.length,
      item.registrations?.length,
    ];

    return values.some(value => typeof value === "number");
  }

  private buildFilterQuery(q: Params): Record<string, string> {
    const reqQuery: Record<string, string> = {
      status: "published",
    };

    if (q["participating"] === "true") {
      reqQuery["participating"] = "true";
    }

    return reqQuery;
  }

  private updateQuery(queryParams: Record<string, string | null>): void {
    this.router.navigate([], {
      queryParams,
      relativeTo: this.route,
      queryParamsHandling: "merge",
    });
  }

  private syncSearchControl(search: string): void {
    const searchControl = this.searchForm.get("search");

    if (searchControl && searchControl.value !== search) {
      searchControl.setValue(search, { emitEvent: false });
    }
  }
}
