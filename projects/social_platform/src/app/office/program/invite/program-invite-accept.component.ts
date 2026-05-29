/** @format */

import { CommonModule } from "@angular/common";
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  OnInit,
  inject,
} from "@angular/core";
import { ActivatedRoute, Router, RouterLink } from "@angular/router";
import { ProgramService } from "@office/program/services/program.service";
import { IconComponent } from "@ui/components";
import { SnackbarService } from "@ui/services/snackbar.service";

@Component({
  selector: "app-program-invite-accept",
  standalone: true,
  imports: [CommonModule, RouterLink, IconComponent],
  templateUrl: "./program-invite-accept.component.html",
  styleUrl: "./program-invite-accept.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProgramInviteAcceptComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly programService = inject(ProgramService);
  private readonly snackbar = inject(SnackbarService);
  private readonly cdr = inject(ChangeDetectorRef);

  loading = true;
  error = "";

  ngOnInit(): void {
    const token = this.route.snapshot.paramMap.get("token")?.trim();
    if (!token) {
      this.loading = false;
      this.error = "Код приглашения не найден.";
      this.cdr.markForCheck();
      return;
    }

    this.programService.acceptInviteCode(token).subscribe({
      next: response => {
        this.snackbar.success("Приглашение принято");
        this.router.navigate(["/office/program", response.programId]);
      },
      error: error => {
        this.loading = false;
        this.error = this.formatError(error);
        this.cdr.markForCheck();
      },
    });
  }

  private formatError(error: unknown): string {
    const detail = (error as { error?: { detail?: unknown } })?.error?.detail;
    if (typeof detail === "string") {
      return detail;
    }

    return "Не удалось принять приглашение. Проверьте ссылку или введите код вручную.";
  }
}
