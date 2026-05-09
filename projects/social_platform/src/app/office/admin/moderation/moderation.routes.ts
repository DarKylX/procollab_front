/** @format */

import { Routes } from "@angular/router";
import { moderationStaffGuard } from "./moderation-staff.guard";
import { ModerationForbiddenComponent } from "./forbidden/moderation-forbidden.component";
import { VerificationListComponent } from "./verification-list/verification-list.component";
import { VerificationDetailComponent } from "./verification-detail/verification-detail.component";

export const MODERATION_ROUTES: Routes = [
  {
    path: "forbidden",
    component: ModerationForbiddenComponent,
  },
  {
    path: "",
    canActivate: [moderationStaffGuard],
    children: [
      {
        path: "",
        pathMatch: "full",
        redirectTo: "verification",
      },
      {
        path: "verification",
        component: VerificationListComponent,
      },
      {
        path: "verification/:requestId",
        component: VerificationDetailComponent,
      },
    ],
  },
];
