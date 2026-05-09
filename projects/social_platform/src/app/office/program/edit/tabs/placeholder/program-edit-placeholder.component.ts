/** @format */

import { CommonModule } from "@angular/common";
import { ChangeDetectionStrategy, Component, OnDestroy, OnInit, inject } from "@angular/core";
import { ActivatedRoute } from "@angular/router";
import {
  ProgramEditStateService,
  ProgramEditTabController,
} from "../../services/program-edit-state.service";

@Component({
  selector: "app-program-edit-placeholder",
  standalone: true,
  imports: [CommonModule],
  templateUrl: "./program-edit-placeholder.component.html",
  styleUrl: "./program-edit-placeholder.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProgramEditPlaceholderComponent implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly editState = inject(ProgramEditStateService);

  readonly controller: ProgramEditTabController = {
    tabKey: "placeholder",
    save: () => {
      throw new Error("Placeholder tab cannot be saved");
    },
    reset: () => undefined,
  };

  get title(): string {
    return this.route.snapshot.data["title"] ?? "Раздел";
  }

  ngOnInit(): void {
    this.editState.registerController(this.controller);
    this.editState.updateFormState(false, true, true);
  }

  ngOnDestroy(): void {
    this.editState.unregisterController(this.controller);
  }
}
