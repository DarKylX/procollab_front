/** @format */

import { CanDeactivateFn, Routes } from "@angular/router";
import { WizardComponent } from "./wizard.component";

const canDeactivateWizard: CanDeactivateFn<WizardComponent> = component =>
  component.canDeactivate();

export const PROGRAM_WIZARD_ROUTES: Routes = [
  {
    path: "",
    component: WizardComponent,
    canDeactivate: [canDeactivateWizard],
    children: [
      {
        path: "",
        pathMatch: "full",
        redirectTo: "basic-info",
      },
      {
        path: "basic-info",
        loadComponent: () =>
          import("./steps/basic-info-step/basic-info-step.component").then(
            c => c.BasicInfoStepComponent
          ),
      },
      {
        path: "registration",
        loadComponent: () =>
          import("./steps/registration-step/registration-step.component").then(
            c => c.RegistrationStepComponent
          ),
      },
      {
        path: "publish",
        loadComponent: () =>
          import("./steps/publish-step/publish-step.component").then(c => c.PublishStepComponent),
      },
    ],
  },
];
