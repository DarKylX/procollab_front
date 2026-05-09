/** @format */

import { Routes } from "@angular/router";
import { moderationStaffGuard } from "./moderation-staff.guard";

export const MODERATION_ROUTES: Routes = [
  {
    path: "forbidden",
    loadComponent: () =>
      import("./forbidden/moderation-forbidden.component").then(
        c => c.ModerationForbiddenComponent
      ),
  },
  {
    path: "",
    pathMatch: "full",
    canActivate: [moderationStaffGuard],
    loadComponent: () =>
      import("./list/moderation-list.component").then(c => c.ModerationListComponent),
  },
  {
    path: "verification",
    canActivate: [moderationStaffGuard],
    loadComponent: () =>
      import("./verification-list/verification-list.component").then(
        c => c.VerificationListComponent
      ),
  },
  {
    path: "verification/:requestId",
    canActivate: [moderationStaffGuard],
    loadComponent: () =>
      import("./verification-detail/verification-detail.component").then(
        c => c.VerificationDetailComponent
      ),
  },
  {
    path: "programs/:programId",
    canActivate: [moderationStaffGuard],
    loadComponent: () =>
      import("./detail/moderation-detail.component").then(c => c.ModerationDetailComponent),
  },
];
