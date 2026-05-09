/** @format */

import { Routes } from "@angular/router";
import { ProgramComponent } from "./program.component";
import { ProgramMainComponent } from "./main/main.component";

/**
 * Конфигурация маршрутов для модуля "Программы"
 *
 * Описание маршрутов:
 * - "" - корневой маршрут программ с дочерними маршрутами
 *   - "" - редирект на "/all"
 *   - "all" - список всех программ с резолвером данных
 * - ":programId" - детальная страница программы (ленивая загрузка)
 * - ":programId/projects-rating" - страница оценки проектов программы (ленивая загрузка)
 *
 * @returns {Routes} Массив конфигураций маршрутов для Angular Router
 */
export const PROGRAM_ROUTES: Routes = [
  {
    path: "new",
    loadChildren: () => import("./wizard/wizard.routes").then(c => c.PROGRAM_WIZARD_ROUTES),
  },
  {
    path: "",
    component: ProgramComponent,
    children: [
      {
        path: "",
        pathMatch: "full",
        redirectTo: "all",
      },
      {
        path: "all",
        component: ProgramMainComponent,
        data: { tab: "all" },
      },
      {
        path: "my",
        component: ProgramMainComponent,
        data: { tab: "my" },
      },
    ],
  },
  {
    path: ":programId",
    loadChildren: () => import("./detail/detail.routes").then(c => c.PROGRAM_DETAIL_ROUTES),
  },
];
