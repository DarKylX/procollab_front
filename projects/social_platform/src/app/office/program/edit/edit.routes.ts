/** @format */

import { CanDeactivateFn, Routes } from "@angular/router";
import { ProgramDetailResolver } from "@office/program/detail/detail.resolver";
import { ProgramEditComponent } from "./edit.component";

const canDeactivateProgramEdit: CanDeactivateFn<ProgramEditComponent> = component =>
  component.canDeactivate();

export const PROGRAM_EDIT_ROUTES: Routes = [
  {
    path: "",
    component: ProgramEditComponent,
    canDeactivate: [canDeactivateProgramEdit],
    resolve: {
      data: ProgramDetailResolver,
    },
    children: [
      {
        path: "",
        pathMatch: "full",
        redirectTo: "main",
      },
      {
        path: "main",
        loadComponent: () =>
          import("./tabs/main/program-edit-main.component").then(c => c.ProgramEditMainComponent),
      },
      {
        path: "schedule",
        loadComponent: () =>
          import("./tabs/schedule/program-edit-schedule.component").then(
            c => c.ProgramEditScheduleComponent
          ),
      },
      {
        path: "materials",
        loadComponent: () =>
          import("./tabs/materials/program-edit-materials.component").then(
            c => c.ProgramEditMaterialsComponent
          ),
      },
      {
        path: "registration",
        loadComponent: () =>
          import("./tabs/registration/program-edit-registration.component").then(
            c => c.ProgramEditRegistrationComponent
          ),
        data: { title: "Регистрация" },
      },
      {
        path: "criteria",
        loadComponent: () =>
          import("./tabs/criteria/program-edit-criteria.component").then(
            c => c.ProgramEditCriteriaComponent
          ),
        data: { title: "Критерии и эксперты" },
      },
      {
        path: "verification",
        loadComponent: () =>
          import("./tabs/verification/program-edit-verification.component").then(
            c => c.ProgramEditVerificationComponent
          ),
        data: { title: "Верификация" },
      },
      {
        path: "certificate",
        loadComponent: () =>
          import("./tabs/certificate/program-edit-certificate.component").then(
            c => c.ProgramEditCertificateComponent
          ),
        data: { title: "Сертификат" },
      },
    ],
  },
];
