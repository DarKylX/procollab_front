/** @format */

import { ChangeDetectionStrategy, Component } from "@angular/core";
import { RouterLink } from "@angular/router";
import { ButtonComponent, IconComponent } from "@ui/components";

@Component({
  selector: "app-moderation-forbidden",
  standalone: true,
  imports: [RouterLink, ButtonComponent, IconComponent],
  templateUrl: "./moderation-forbidden.component.html",
  styleUrl: "./moderation-forbidden.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ModerationForbiddenComponent {}
