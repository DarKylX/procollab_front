/** @format */

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
export type ProgramStatus = "draft" | "published" | "completed" | "archived";
export type ProgramParticipationFormat = "individual" | "team";
export type ProgramParticipantProjectStatus = "not_linked" | "not_submitted" | "submitted";

export interface ProgramCompany {
  id: number;
  name: string;
  inn: string;
}

export interface ProgramParticipantProject {
  id: number;
  name: string;
  description?: string;
  shortDescription?: string;
  imageAddress?: string;
  coverImageAddress?: string;
  presentationAddress?: string;
  draft?: boolean;
  partnerProgram?: {
    programLinkId: number;
    programId: number;
    isSubmitted: boolean;
    submitted?: boolean;
    submittedAt?: string | null;
  };
}

export interface LegalDocument {
  id: number;
  type: "privacy_policy" | "participant_consent" | "participation_terms";
  title: string;
  version: string;
  contentUrl?: string;
  contentHtml?: string;
}

export class Program {
  id!: number;
  status!: ProgramStatus;
  imageAddress!: string;
  coverImageAddress!: string;
  presentationAddress!: string;
  advertisementImageAddress!: string;
  name!: string;
  description!: string;
  city!: string;
  tag!: string;
  year!: number;
  links!: string[];
  registrationLink!: string | null;
  materials!: { title: string; url: string }[];
  shortDescription!: string;
  datetimeRegistrationEnds!: string;
  datetimeStarted!: string;
  datetimeFinished!: string;
  datetimeProjectSubmissionEnds!: string;
  datetimeEvaluationEnds!: string;
  viewsCount!: number;
  likesCount!: number;
  isUserLiked!: boolean;
  isUserManager!: boolean;
  isUserMember!: boolean;
  company!: ProgramCompany | null;
  companyName!: string;
  participationFormat!: ProgramParticipationFormat;
  projectTeamMinSize!: number | null;
  projectTeamMaxSize!: number | null;
  programLinkId!: number | null;
  participantProject!: ProgramParticipantProject | null;
  participantProjectStatus!: ProgramParticipantProjectStatus;
  participantProjectSubmittedAt!: string | null;
  publishProjectsAfterFinish!: boolean;
  courseId!: number | null;
  courses!: { id: number; title: string; isAvailable: boolean }[];

  static default(): Program {
    return {
      id: 1,
      status: "draft",
      name: "",
      description: "",
      city: "",
      imageAddress: "",
      presentationAddress: "",
      links: [],
      materials: [],
      registrationLink: null,
      coverImageAddress: "",
      advertisementImageAddress: "",
      shortDescription: "",
      datetimeRegistrationEnds: "",
      datetimeStarted: "",
      datetimeFinished: "",
      datetimeProjectSubmissionEnds: "",
      datetimeEvaluationEnds: "",
      viewsCount: 1,
      tag: "",
      likesCount: 1,
      year: 0,
      isUserLiked: false,
      isUserMember: false,
      isUserManager: false,
      company: null,
      companyName: "",
      participationFormat: "team",
      projectTeamMinSize: 1,
      projectTeamMaxSize: null,
      programLinkId: null,
      participantProject: null,
      participantProjectStatus: "not_linked",
      participantProjectSubmittedAt: null,
      publishProjectsAfterFinish: false,
      courseId: null,
      courses: [],
    };
  }
}

export function formatProgramParticipation(program?: Pick<
  Program,
  "participationFormat" | "projectTeamMinSize" | "projectTeamMaxSize"
>): string {
  if (!program) {
    return "";
  }

  if (program.participationFormat === "individual") {
    return "Индивидуальное участие";
  }

  const minSize = program.projectTeamMinSize ?? 1;
  const maxSize = program.projectTeamMaxSize;

  if (maxSize && maxSize === minSize) {
    return `Команда: ${maxSize} участников`;
  }

  if (maxSize && maxSize > minSize) {
    return `Команда: ${minSize}-${maxSize} участников`;
  }

  if (minSize > 1) {
    return `Команда: от ${minSize} участников`;
  }

  return "Командное участие";
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
export class ProgramDataSchema {
  [key: string]: {
    type: "text";
    name: string;
    placeholder: string;
  };
}

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
