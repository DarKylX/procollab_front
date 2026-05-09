/** @format */

import { ReadinessChecklist, ReadinessData } from "./readiness.model";

/**
 * Основная модель программы в системе
 *
 * Содержит полную информацию о программе, включая метаданные,
 * даты проведения, статистику и права пользователя.
 *
 * Свойства:
 * @param {number} id - Уникальный идентификатор программы
 * @param {string} imageAddress - URL основного изображения
 * @param {string} coverImageAddress - URL обложки программы
 * @param {string} presentationAddress - URL презентации программы
 * @param {string} advertisementImageAddress - URL рекламного изображения
 * @param {string} name - Название программы
 * @param {string} description - Полное описание программы
 * @param {string} city - Город проведения программы
 * @param {string} tag - Тег/категория программы
 * @param {number} year - Год проведения программы
 * @param {string[]} links - Массив полезных ссылок
 * @param {Array<{title: string; url: string}>} materials - Материалы программы
 * @param {string} shortDescription - Краткое описание программы
 * @param {string} datetimeRegistrationEnds - Дата окончания регистрации
 * @param {string} datetimeStarted - Дата начала программы
 * @param {string} datetimeFinished - Дата окончания программы
 * @param {number} viewsCount - Количество просмотров
 * @param {number} likesCount - Количество лайков
 * @param {boolean} isUserLiked - Лайкнул ли текущий пользователь
 * @param {boolean} isUserManager - Является ли пользователь менеджером программы
 * @param {boolean} isUserMember - Является ли пользователь участником программы
 *
 * Методы:
 * @method static default() - Возвращает объект программы с дефолтными значениями
 */
export interface ProgramDataSchemaField {
  type?: "text" | "email" | "phone" | "textarea" | "select" | "radio" | "checkbox" | "file";
  name?: string;
  label?: string;
  placeholder?: string;
  required?: boolean;
  isRequired?: boolean;
  is_required?: boolean;
  helpText?: string;
  help_text?: string;
  hint?: string;
  description?: string;
  options?: string[];
  order?: number;
  asFilter?: boolean;
  showFilter?: boolean;
  show_filter?: boolean;
}

export class ProgramDataSchema {
  [key: string]: ProgramDataSchemaField;
}

export interface LegalDocument {
  id: number;
  type: "privacy_policy" | "participant_consent" | "participation_terms" | "organizer_terms";
  title: string;
  version: string;
  contentUrl?: string;
  contentHtml?: string;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface ProgramLegalSettings {
  participationRulesFile?: string | null;
  participationRulesFileUrl?: string;
  participationRulesLink?: string;
  additionalTermsText?: string;
  organizerTermsAcceptedBy?: {
    id: number;
    email: string;
    fullName: string;
  } | null;
  organizerTermsAcceptedAt?: string | null;
  organizerTermsVersion?: string;
  termsVersion?: string;
  updatedAt?: string;
}

export class Program {
  id!: number;
  status?:
    | "draft"
    | "pending_moderation"
    | "published"
    | "rejected"
    | "completed"
    | "frozen"
    | "archived";

  imageAddress!: string;
  coverImageAddress!: string;
  mobileCoverImageAddress?: string;
  presentationAddress!: string;
  advertisementImageAddress!: string;
  name!: string;
  description!: string;
  city!: string;
  tag!: string;
  year!: number;
  links!: string[];
  registrationLink!: string | null;
  registrationType?: "internal" | "external";
  isPrivate?: boolean;
  dataSchema?: ProgramDataSchema;
  projectsAvailability?: "all_users" | "all" | "experts_only";
  participationFormat?: "individual" | "team";
  projectTeamMinSize?: number | null;
  projectTeamMaxSize?: number | null;
  materials!: { title: string; url: string }[];
  shortDescription!: string;
  datetimeRegistrationEnds!: string;
  datetimeStarted!: string;
  datetimeFinished!: string;
  datetimeProjectSubmissionEnds!: string;
  datetimeEvaluationEnds!: string;
  isCompetitive?: boolean;
  isDistributedEvaluation?: boolean;
  maxProjectRates?: number | null;
  viewsCount!: number;
  likesCount!: number;
  isUserLiked!: boolean;
  isUserManager!: boolean;
  isUserMember!: boolean;
  isVerified?: boolean;
  verificationStatus?: "not_requested" | "pending" | "verified" | "rejected" | "revoked";
  verifiedCompanyName?: string;
  companyName?: string;
  legalDocuments?: LegalDocument[];
  legalSettings?: ProgramLegalSettings | null;
  readiness?: ReadinessChecklist;
  readinessData?: ReadinessData;
  canExportContacts?: boolean;
  managers?: { id: number }[];
  experts?: { id: number }[];
  participants?: { id: number }[];
  participantsCount?: number;
  participantsDeltaWeek?: number;
  projectsCount?: number;
  activeProjectsCount?: number;
  expertsCount?: number;
  expertsRemainingCount?: number;
  unevaluatedProjectsCount?: number;
  isUserExpert?: boolean;
  participantProjectStatus?: "not_submitted" | "submitted";
  participantProjectSubmittedAt?: string;
  issuedCertificateUrl?: string | null;
  freezeReason?: string;
  moderationResult?: {
    action?: string;
    comment?: string;
    reasonCode?: string;
    reasonLabel?: string;
    createdAt?: string;
    rejectionReasonCode?: string;
    rejectionComment?: string;
    rejectedAt?: string;
    sectionsToFix?: string[];
    rejectedBy?: {
      id?: number;
      email?: string;
      fullName?: string;
    } | null;
  } | null;
  publishProjectsAfterFinish!: boolean;
  courseId!: number | null;
  courses!: { id: number; title: string; isAvailable: boolean }[];

  static default(): Program {
    return {
      id: 1,
      name: "",
      description: "",
      city: "",
      imageAddress: "",
      presentationAddress: "",
      links: [],
      materials: [],
      registrationLink: null,
      registrationType: "internal",
      isPrivate: false,
      dataSchema: {},
      projectsAvailability: "all_users",
      participationFormat: "team",
      projectTeamMinSize: 1,
      projectTeamMaxSize: null,
      coverImageAddress: "",
      mobileCoverImageAddress: "",
      advertisementImageAddress: "",
      shortDescription: "",
      datetimeRegistrationEnds: "",
      datetimeStarted: "",
      datetimeFinished: "",
      datetimeProjectSubmissionEnds: "",
      datetimeEvaluationEnds: "",
      isCompetitive: false,
      isDistributedEvaluation: false,
      maxProjectRates: 1,
      viewsCount: 1,
      tag: "",
      likesCount: 1,
      year: 0,
      isUserLiked: false,
      isUserMember: false,
      isUserManager: false,
      isVerified: false,
      verificationStatus: "not_requested",
      verifiedCompanyName: "",
      companyName: "",
      legalDocuments: [],
      legalSettings: null,
      readiness: {},
      readinessData: undefined,
      canExportContacts: false,
      managers: [],
      experts: [],
      participants: [],
      participantsCount: 0,
      participantsDeltaWeek: 0,
      projectsCount: 0,
      activeProjectsCount: 0,
      expertsCount: 0,
      expertsRemainingCount: 0,
      unevaluatedProjectsCount: 0,
      isUserExpert: false,
      participantProjectStatus: "not_submitted",
      participantProjectSubmittedAt: "",
      issuedCertificateUrl: null,
      freezeReason: "",
      moderationResult: null,
      publishProjectsAfterFinish: false,
      courseId: null,
      courses: [],
    };
  }
}

/**
 * Схема данных программы для динамических полей
 *
 * Определяет структуру дополнительных полей программы,
 * которые могут быть настроены администратором.
 *
 * @param {string} key - Ключ поля
 * @param {object} value - Объект с типом, названием и плейсхолдером поля
 */
/**
 * Модель тега программы
 *
 * Представляет категорию или тег программы для группировки и фильтрации.
 *
 * @param {number} id - Уникальный идентификатор тега
 * @param {string} name - Отображаемое название тега
 * @param {string} tag - Системное название тега
 */
export class ProgramTag {
  id!: number;
  name!: string;
  tag!: string;
}
