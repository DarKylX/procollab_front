/** @format */

import { Injectable } from "@angular/core";
import { ApiService } from "projects/core";
import { map, Observable } from "rxjs";
import { HttpParams } from "@angular/common/http";
import { ProgramDraftPayload } from "@office/program/models/program-draft.model";
import { ProgramCreate } from "@office/program/models/program-create.model";
import {
  LegalDocument,
  Program,
  ProgramDataSchema,
  ProgramLegalSettings,
} from "@office/program/models/program.model";
import { ProgramAnalytics } from "@office/program/models/program-analytics.model";
import { Project } from "@models/project.model";
import { ApiPagination } from "@models/api-pagination.model";
import { User } from "@auth/models/user.model";
import { PartnerProgramFields } from "@office/models/partner-program-fields.model";
import { ProjectAdditionalFields } from "@office/projects/models/project-additional-fields.model";
import { ReadinessData } from "@office/program/models/readiness.model";
import {
  ProgramVerificationState,
  ProgramVerificationSubmitPayload,
} from "@office/program/models/program-verification.model";
import {
  CertificateGenerateResponse,
  CertificateListResponse,
  MyCertificateResponse,
  ProgramCertificateSettings,
} from "@office/program/models/program-certificate.model";

export interface ProgramStats {
  participantsCount: number;
  participantsDeltaWeek: number;
  projectsCount: number;
  activeProjectsCount: number;
  expertsCount: number;
  expertsRemainingCount: number;
  currentPeriod?: string;
}

export interface ProgramCriterion {
  id?: number;
  name: string;
  description: string;
  type: "int" | "float" | "bool" | "str";
  minValue?: number | null;
  maxValue?: number | null;
  weight: number;
}

export interface ProgramExpert {
  id: number;
  userId: number;
  fullName: string;
  organization: string;
  email: string;
  avatar?: string;
  status?: "added" | "available";
}

interface ModerationProgramActionResponse {
  program: Partial<Program>;
}

/**
 * Сервис для работы с программами
 *
 * Предоставляет методы для взаимодействия с API программ:
 * - Получение списка программ с пагинацией
 * - Получение детальной информации о программе
 * - Создание новой программы
 * - Регистрация в программе
 * - Получение проектов и участников программы
 * - Работа с тегами программ
 *
 * Принимает:
 * @param {ApiService} apiService - Сервис для HTTP запросов
 *
 * Методы:
 * @method getAll(skip: number, take: number) - Получает список программ с пагинацией
 * @method getOne(programId: number) - Получает детальную информацию о программе
 * @method create(program: ProgramCreate) - Создает новую программу
 * @method getDataSchema(programId: number) - Получает схему дополнительных полей программы
 * @method register(programId: number, additionalData: Record<string, string>) - Регистрирует пользователя в программе
 * @method getAllProjects(programId: number, offset: number, limit: number) - Получает проекты программы
 * @method getAllMembers(programId: number, skip: number, take: number) - Получает участников программы
 * @method submitCompettetiveProject(prelationId: number) - Cохранить и "подать проект" на сдачу в программу конкурсную
 * @method getProgramFilters(programId: number) - Получение данных для фильтра проектов-участников по доп полям
 * @method programTags() - Получает и кеширует теги программ пользователя
 *
 * Свойства:
 * @property {BehaviorSubject<ProgramTag[]>} programTags$ - Реактивный поток тегов программ
 */
@Injectable({
  providedIn: "root",
})
export class ProgramService {
  private readonly PROGRAMS_URL = "/programs";
  private readonly MODERATION_PROGRAMS_URL = "/api/admin/moderation/programs";

  constructor(private readonly apiService: ApiService) {}

  getAll(skip: number, take: number, params?: HttpParams): Observable<ApiPagination<Program>> {
    let httpParams = new HttpParams();

    httpParams = httpParams.set("limit", take);
    httpParams = httpParams.set("offset", skip);

    if (params) {
      params.keys().forEach(key => {
        const value = params.get(key);
        if (value !== null) {
          httpParams = httpParams.set(key, value);
        }
      });
    }

    return this.apiService.get(`${this.PROGRAMS_URL}/`, httpParams);
  }

  getActualPrograms(): Observable<ApiPagination<Program>> {
    return this.getAll(0, 10, new HttpParams({ fromObject: { status: "published" } }));
  }

  getOne(programId: number): Observable<Program> {
    return this.apiService.get(`${this.PROGRAMS_URL}/${programId}/`);
  }

  getReadiness(programId: number): Observable<ReadinessData> {
    return this.apiService.get<ReadinessData>(`${this.PROGRAMS_URL}/${programId}/readiness/`);
  }

  getVerification(programId: number): Observable<ProgramVerificationState> {
    return this.apiService.get<ProgramVerificationState>(
      `${this.PROGRAMS_URL}/${programId}/verification/`
    );
  }

  submitVerification(
    programId: number,
    payload: ProgramVerificationSubmitPayload
  ): Observable<ProgramVerificationState> {
    return this.apiService.post<ProgramVerificationState>(
      `${this.PROGRAMS_URL}/${programId}/verification/submit/`,
      payload
    );
  }

  getAnalytics(programId: number): Observable<ProgramAnalytics> {
    return this.apiService.get<ProgramAnalytics>(`${this.PROGRAMS_URL}/${programId}/analytics/`);
  }

  getCertificateSettings(programId: number): Observable<ProgramCertificateSettings> {
    return this.apiService.get<ProgramCertificateSettings>(
      `${this.PROGRAMS_URL}/${programId}/certificate/settings/`
    );
  }

  saveCertificateSettings(
    programId: number,
    payload: Partial<ProgramCertificateSettings>
  ): Observable<ProgramCertificateSettings> {
    return this.apiService.patch<ProgramCertificateSettings>(
      `${this.PROGRAMS_URL}/${programId}/certificate/settings/`,
      payload
    );
  }

  previewCertificate(
    programId: number,
    payload: Partial<ProgramCertificateSettings>
  ): Observable<Blob> {
    return this.apiService.postFile(
      `${this.PROGRAMS_URL}/${programId}/certificate/preview/`,
      payload
    );
  }

  generateCertificates(
    programId: number,
    regenerate = true
  ): Observable<CertificateGenerateResponse> {
    return this.apiService.post<CertificateGenerateResponse>(
      `${this.PROGRAMS_URL}/${programId}/certificate/generate/`,
      { regenerate }
    );
  }

  releaseCertificates(programId: number): Observable<ProgramCertificateSettings> {
    return this.apiService.post<ProgramCertificateSettings>(
      `${this.PROGRAMS_URL}/${programId}/certificate/release/`,
      {}
    );
  }

  getCertificateList(programId: number): Observable<CertificateListResponse> {
    return this.apiService.get<CertificateListResponse>(
      `${this.PROGRAMS_URL}/${programId}/certificate/list/`
    );
  }

  getMyCertificate(programId: number): Observable<MyCertificateResponse> {
    return this.apiService.get<MyCertificateResponse>(
      `${this.PROGRAMS_URL}/${programId}/certificate/me/`
    );
  }

  downloadCertificate(programId: number, certificateId: string): Observable<Blob> {
    return this.apiService.getFile(
      `${this.PROGRAMS_URL}/${programId}/certificate/${certificateId}/download/`
    );
  }

  exportAnalytics(programId: number): Observable<Blob> {
    return this.apiService.getFile(`${this.PROGRAMS_URL}/${programId}/analytics/export/`);
  }

  exportAnalyticsContacts(programId: number): Observable<Blob> {
    return this.apiService.getFile(`${this.PROGRAMS_URL}/${programId}/analytics/contact-export/`);
  }

  getActiveLegalDocuments(): Observable<LegalDocument[]> {
    return this.apiService.get<LegalDocument[]>(`${this.PROGRAMS_URL}/legal-documents/active/`);
  }

  getLegalSettings(programId: number): Observable<ProgramLegalSettings> {
    return this.apiService.get<ProgramLegalSettings>(
      `${this.PROGRAMS_URL}/${programId}/legal-settings/`
    );
  }

  updateLegalSettings(
    programId: number,
    payload: Partial<ProgramLegalSettings>
  ): Observable<ProgramLegalSettings> {
    return this.apiService.patch<ProgramLegalSettings>(
      `${this.PROGRAMS_URL}/${programId}/legal-settings/`,
      payload
    );
  }

  acceptOrganizerTerms(programId: number): Observable<ProgramLegalSettings> {
    return this.apiService.post<ProgramLegalSettings>(
      `${this.PROGRAMS_URL}/${programId}/legal-settings/accept-organizer-terms/`,
      {}
    );
  }

  getStats(programId: number): Observable<Partial<ProgramStats>> {
    return this.apiService.get<Partial<ProgramStats>>(`${this.PROGRAMS_URL}/${programId}/stats/`);
  }

  getMyPrograms(): Observable<Program[]> {
    return this.getAll(0, 100, new HttpParams({ fromObject: { my: "true" } })).pipe(
      map(response => response.results ?? [])
    );
  }

  create(program: ProgramCreate | ProgramDraftPayload): Observable<Program> {
    return this.apiService.post<Program>(`${this.PROGRAMS_URL}/`, program);
  }

  update(programId: number, program: Partial<ProgramDraftPayload>): Observable<Program> {
    return this.apiService.patch<Program>(`${this.PROGRAMS_URL}/${programId}/`, program);
  }

  submitToModeration(programId: number): Observable<Program> {
    return this.apiService.post<Program>(
      `${this.PROGRAMS_URL}/${programId}/submit-to-moderation/`,
      {}
    );
  }

  canSubmitToModeration(programId: number): Observable<ReadinessData> {
    return this.getReadiness(programId);
  }

  approve(programId: number): Observable<Program> {
    return this.apiService.post<Program>(`${this.PROGRAMS_URL}/${programId}/approve/`, {});
  }

  reject(programId: number, comment: string): Observable<Program> {
    return this.apiService.post<Program>(`${this.PROGRAMS_URL}/${programId}/reject/`, { comment });
  }

  freeze(programId: number, comment: string): Observable<Program> {
    return this.apiService
      .post<ModerationProgramActionResponse>(
        `${this.MODERATION_PROGRAMS_URL}/${programId}/freeze/`,
        { comment }
      )
      .pipe(map(response => response.program as Program));
  }

  restore(programId: number): Observable<Program> {
    return this.apiService
      .post<ModerationProgramActionResponse>(
        `${this.MODERATION_PROGRAMS_URL}/${programId}/restore/`,
        {}
      )
      .pipe(map(response => response.program as Program));
  }

  archive(programId: number): Observable<Program> {
    return this.apiService
      .post<ModerationProgramActionResponse>(
        `${this.MODERATION_PROGRAMS_URL}/${programId}/archive/`,
        {}
      )
      .pipe(map(response => response.program as Program));
  }

  withdrawFromModeration(programId: number): Observable<Program> {
    return this.apiService.post<Program>(
      `${this.PROGRAMS_URL}/${programId}/withdraw-from-moderation/`,
      {}
    );
  }

  getCriteria(programId: number): Observable<ProgramCriterion[]> {
    return this.apiService.get<ProgramCriterion[]>(`${this.PROGRAMS_URL}/${programId}/criteria/`);
  }

  createCriterion(
    programId: number,
    criterion: ProgramCriterion
  ): Observable<ProgramCriterion> {
    return this.apiService.post<ProgramCriterion>(
      `${this.PROGRAMS_URL}/${programId}/criteria/`,
      criterion
    );
  }

  updateCriterion(
    programId: number,
    criterionId: number,
    criterion: Partial<ProgramCriterion>
  ): Observable<ProgramCriterion> {
    return this.apiService.patch<ProgramCriterion>(
      `${this.PROGRAMS_URL}/${programId}/criteria/${criterionId}/`,
      criterion
    );
  }

  deleteCriterion(programId: number, criterionId: number): Observable<void> {
    return this.apiService.delete<void>(
      `${this.PROGRAMS_URL}/${programId}/criteria/${criterionId}/`
    );
  }

  getProgramExperts(programId: number): Observable<ProgramExpert[]> {
    return this.apiService.get<ProgramExpert[]>(`${this.PROGRAMS_URL}/${programId}/experts/`);
  }

  searchProgramExperts(programId: number, query: string): Observable<ProgramExpert[]> {
    return this.apiService.get<ProgramExpert[]>(
      `${this.PROGRAMS_URL}/${programId}/experts/search/`,
      new HttpParams({ fromObject: { query } })
    );
  }

  addProgramExpert(programId: number, userId: number): Observable<ProgramExpert> {
    return this.apiService.post<ProgramExpert>(`${this.PROGRAMS_URL}/${programId}/experts/`, {
      userId,
    });
  }

  deleteProgramExpert(programId: number, userId: number): Observable<void> {
    return this.apiService.delete<void>(`${this.PROGRAMS_URL}/${programId}/experts/${userId}/`);
  }

  getDataSchema(programId: number): Observable<ProgramDataSchema> {
    return this.apiService
      .get<{ dataSchema: ProgramDataSchema }>(`${this.PROGRAMS_URL}/${programId}/schema/`)
      .pipe(map(r => r["dataSchema"]));
  }

  register(programId: number, additionalData: Record<string, unknown>): Observable<unknown> {
    return this.apiService.post(`${this.PROGRAMS_URL}/${programId}/register/`, additionalData);
  }

  getAllProjects(programId: number, params?: HttpParams): Observable<ApiPagination<Project>> {
    return this.apiService.get(`${this.PROGRAMS_URL}/${programId}/projects`, params);
  }

  getAllMembers(programId: number, skip: number, take: number): Observable<ApiPagination<User>> {
    return this.apiService.get(
      `${this.PROGRAMS_URL}/${programId}/participants/`,
      new HttpParams({ fromObject: { limit: take, offset: skip } })
    );
  }

  getProgramFilters(programId: number): Observable<PartnerProgramFields[]> {
    return this.apiService.get(`${this.PROGRAMS_URL}/${programId}/filters/`);
  }

  getProgramProjectAdditionalFields(programId: number): Observable<ProjectAdditionalFields> {
    return this.apiService.get(`${this.PROGRAMS_URL}/${programId}/projects/apply/`);
  }

  // body - это форма проекта который подается + programFieldValues
  applyProjectToProgram(programId: number, body: any): Observable<any> {
    return this.apiService.post(`${this.PROGRAMS_URL}/${programId}/projects/apply/`, body);
  }

  createProgramFilters(
    programId: number,
    filters: Record<string, string[]>,
    params?: HttpParams
  ): Observable<ApiPagination<Project>> {
    let url = `${this.PROGRAMS_URL}/${programId}/projects/filter/`;

    if (params) {
      url += `?${params.toString()}`;
    }

    return this.apiService.post(url, { filters });
  }

  submitCompettetiveProject(relationId: number): Observable<Project> {
    return this.apiService.post(
      `${this.PROGRAMS_URL}/partner-program-projects/${relationId}/submit/`,
      {}
    );
  }
}
