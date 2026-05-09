/** @format */

import { Component, OnInit } from "@angular/core";
import { NavService } from "@services/nav.service";
import { RouterOutlet } from "@angular/router";
import { BackComponent } from "@uilib";

/**
 * Основной компонент модуля "Программы"
 *
 * Функциональность:
 * - Отображает заголовок навигации "Программы"
 * - Предоставляет форму поиска программ
 * - Управляет состоянием активных вкладок (My/All)
 * - Обрабатывает изменения поисковых параметров в URL
 * - Содержит router-outlet для дочерних компонентов
 *
 * Принимает:
 * - NavService - для установки заголовка навигации
 * - ActivatedRoute - для работы с параметрами маршрута
 * - ProgramService - сервис для работы с программами
 * - Router - для навигации и изменения URL параметров
 * - FormBuilder - для создания реактивных форм
 *
 * Возвращает:
 * - HTML шаблон с формой поиска и router-outlet
 * - Управляет состоянием флагов isMy и isAll
 */
@Component({
  selector: "app-program",
  templateUrl: "./program.component.html",
  styleUrl: "./program.component.scss",
  standalone: true,
  imports: [RouterOutlet, BackComponent],
})
export class ProgramComponent implements OnInit {
  constructor(private readonly navService: NavService) {}

  ngOnInit(): void {
    this.navService.setNavTitle("Чемпионаты");
  }
}
