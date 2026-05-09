/** @format */

import { ProgramDataSchema } from "./program.model";

export interface ProgramDraftPayload {
  name?: string;
  tag?: string;
  description?: string;
  city?: string;
  imageAddress?: string;
  coverImageAddress?: string;
  mobileCoverImageAddress?: string;
  advertisementImageAddress?: string;
  presentationAddress?: string | null;
  links?: string[];
  datetimeStarted?: string;
  datetimeRegistrationEnds?: string;
  datetimeProjectSubmissionEnds?: string | null;
  datetimeEvaluationEnds?: string | null;
  datetimeFinished?: string;
  registrationType?: "internal" | "external";
  registrationLink?: string | null;
  isPrivate?: boolean;
  dataSchema?: ProgramDataSchema;
  participationRulesFile?: string | null;
  participationRulesLink?: string;
  additionalTermsText?: string;
  isCompetitive?: boolean;
  isDistributedEvaluation?: boolean;
  maxProjectRates?: number | null;
  projectsAvailability?: "all_users" | "all" | "experts_only";
  publishProjectsAfterFinish?: boolean;
  participationFormat?: "individual" | "team";
  projectTeamMinSize?: number | null;
  projectTeamMaxSize?: number | null;
  materials?: { title: string; url: string }[];
}
