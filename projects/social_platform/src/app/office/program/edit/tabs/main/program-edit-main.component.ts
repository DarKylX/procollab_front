/** @format */

import { CommonModule } from "@angular/common";
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  DestroyRef,
  OnDestroy,
  OnInit,
  inject,
} from "@angular/core";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { FormBuilder, ReactiveFormsModule, Validators } from "@angular/forms";
import { catchError, Observable, tap, throwError } from "rxjs";
import { FileService } from "@core/services/file.service";
import { Program } from "@office/program/models/program.model";
import { ProgramDraftPayload } from "@office/program/models/program-draft.model";
import { ProgramService } from "@office/program/services/program.service";
import { ButtonComponent, IconComponent } from "@ui/components";
import { SnackbarService } from "@ui/services/snackbar.service";
import {
  ProgramEditStateService,
  ProgramEditTabController,
} from "../../services/program-edit-state.service";

type AssetKey =
  | "coverImageAddress"
  | "mobileCoverImageAddress"
  | "imageAddress";

interface AssetMeta {
  name: string;
  size: number | null;
}

interface AssetField {
  key: AssetKey;
  label: string;
  hint: string;
  required?: boolean;
  previewClass: string;
}

interface MainFormValue {
  name: string;
  tag: string;
  description: string;
  city: string;
  coverImageAddress: string;
  mobileCoverImageAddress: string;
  imageAddress: string;
}

interface MainDraft {
  value: MainFormValue;
  assetMeta: Partial<Record<AssetKey, AssetMeta>>;
}

@Component({
  selector: "app-program-edit-main",
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, ButtonComponent, IconComponent],
  templateUrl: "./program-edit-main.component.html",
  styleUrl: "./program-edit-main.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProgramEditMainComponent implements OnInit, OnDestroy {
  private readonly fb = inject(FormBuilder);
  private readonly destroyRef = inject(DestroyRef);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly editState = inject(ProgramEditStateService);
  private readonly programService = inject(ProgramService);
  private readonly fileService = inject(FileService);
  private readonly snackbar = inject(SnackbarService);
  private readonly tabKey = "main";

  readonly formatOptions = ["Онлайн", "Оффлайн"];

  readonly assetFields: AssetField[] = [
    {
      key: "coverImageAddress",
      label: "Основная обложка",
      hint: "JPG или PNG, 16:7",
      required: true,
      previewClass: "asset-card--cover",
    },
    {
      key: "mobileCoverImageAddress",
      label: "Мобильная обложка",
      hint: "JPG или PNG, 3:4",
      previewClass: "asset-card--mobile",
    },
    {
      key: "imageAddress",
      label: "Аватар чемпионата",
      hint: "JPG или PNG, 1:1",
      previewClass: "asset-card--avatar",
    },
  ];

  readonly form = this.fb.nonNullable.group({
    name: ["", [Validators.required, Validators.minLength(5), Validators.maxLength(200)]],
    tag: [""],
    description: [
      "",
      [Validators.required, Validators.maxLength(5000)],
    ],
    city: ["", [Validators.required]],
    coverImageAddress: [""],
    mobileCoverImageAddress: [""],
    imageAddress: [""],
  });

  readonly controller: ProgramEditTabController = {
    tabKey: this.tabKey,
    save: () => this.save(),
    reset: () => this.reset(),
  };

  assetMeta: Partial<Record<AssetKey, AssetMeta>> = {};
  private savedAssetValues: Partial<Record<AssetKey, string>> = {};
  uploadingAsset: AssetKey | null = null;

  ngOnInit(): void {
    const draft = this.editState.getTabDraft<MainDraft>(this.tabKey);
    if (draft) {
      this.applyDraft(draft);
      this.markAssetsAsSaved(this.editState.savedProgram());
    } else {
      this.patchFromProgram(this.editState.savedProgram() ?? this.program);
    }
    this.applyReadonly();
    this.editState.registerController(this.controller);
    this.syncState();

    this.form.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      this.syncState();
      this.cdr.markForCheck();
    });

    this.form.statusChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      this.syncState();
      this.cdr.markForCheck();
    });
  }

  ngOnDestroy(): void {
    this.editState.unregisterController(this.controller);
  }

  get isReadonly(): boolean {
    return this.editState.isCurrentTabReadonly();
  }

  get program(): Program | null {
    return this.editState.program();
  }

  isInvalid(controlName: keyof typeof this.form.controls): boolean {
    const control = this.form.controls[controlName];
    return control.invalid && (control.dirty || control.touched);
  }

  errorText(controlName: keyof typeof this.form.controls): string {
    const control = this.form.controls[controlName];

    if (control.hasError("required")) {
      return "Поле обязательно";
    }

    if (control.hasError("minlength")) {
      return `Минимум ${control.getError("minlength").requiredLength} символов`;
    }

    if (control.hasError("maxlength")) {
      return `Максимум ${control.getError("maxlength").requiredLength} символов`;
    }

    return "";
  }

  assetValue(key: AssetKey): string {
    return this.form.controls[key].value;
  }

  assetName(key: AssetKey): string {
    const meta = this.assetMeta[key];
    if (meta?.name) {
      return meta.name;
    }

    const url = this.assetValue(key);
    return url ? decodeURIComponent(url.split("/").pop() || "image") : "";
  }

  assetSize(key: AssetKey): string {
    const size = this.assetMeta[key]?.size;
    if (!size) {
      return "Размер не указан";
    }

    if (size < 1024 * 1024) {
      return `${Math.round(size / 1024)} КБ`;
    }

    return `${(size / (1024 * 1024)).toFixed(1)} МБ`;
  }

  onAssetSelected(event: Event, key: AssetKey): void {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) {
      return;
    }

    this.uploadingAsset = key;
    this.fileService
      .uploadFile(file)
      .pipe(
        tap(({ url }) => {
          this.assetMeta[key] = { name: file.name, size: file.size };
          this.form.controls[key].setValue(url);
          this.form.controls[key].markAsDirty();
          this.syncState();
          input.value = "";
        }),
        catchError(error => {
          this.snackbar.error("Не удалось загрузить изображение");
          return throwError(() => error);
        }),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe({
        next: () => {
          this.uploadingAsset = null;
          this.cdr.markForCheck();
        },
        error: () => {
          this.uploadingAsset = null;
          this.cdr.markForCheck();
        },
      });
  }

  removeAsset(key: AssetKey): void {
    if (this.isSavedAsset(key) && !window.confirm("Удалить сохраненное изображение?")) {
      return;
    }

    this.form.controls[key].setValue("");
    this.form.controls[key].markAsDirty();
    delete this.assetMeta[key];
    this.syncState();
  }

  private save(): Observable<Program> {
    this.form.markAllAsTouched();
    this.syncState();

    const programId = this.program?.id;
    if (!programId || this.form.invalid || this.isReadonly) {
      return throwError(() => new Error("Invalid main form"));
    }

    const value = this.form.getRawValue();
    const payload: ProgramDraftPayload = {
      name: value.name.trim(),
      tag: value.tag.trim(),
      description: value.description.trim(),
      city: value.city.trim(),
      coverImageAddress: value.coverImageAddress,
      mobileCoverImageAddress: value.mobileCoverImageAddress,
      imageAddress: value.imageAddress,
    };

    return this.programService.update(programId, payload).pipe(
      tap(program => {
        this.form.markAsPristine();
        this.markAssetsAsSaved();
        this.editState.updateFormState(false, this.form.valid, this.isReadonly);
        this.editState.updateProgram(program);
      })
    );
  }

  private reset(): void {
    this.patchFromProgram(this.editState.savedProgram() ?? this.program);
    this.form.markAsPristine();
    this.assetMeta = {};
    this.syncState();
  }

  private patchFromProgram(program: Program | null): void {
    if (!program) {
      return;
    }

    this.form.patchValue(
      {
        name: program.name ?? "",
        tag: program.tag ?? "",
        description: program.description ?? "",
        city: this.normalizeProgramFormat(program.city),
        coverImageAddress: program.coverImageAddress ?? "",
        mobileCoverImageAddress: program.mobileCoverImageAddress ?? "",
        imageAddress: program.imageAddress ?? "",
      },
      { emitEvent: false }
    );
    this.markAssetsAsSaved(program);
  }

  private applyDraft(draft: MainDraft): void {
    this.form.patchValue(draft.value, { emitEvent: false });
    this.assetMeta = { ...draft.assetMeta };
  }

  private applyReadonly(): void {
    const readonly = this.computeReadonly();
    if (readonly) {
      this.form.disable({ emitEvent: false });
    } else {
      this.form.enable({ emitEvent: false });
    }
  }

  private computeReadonly(): boolean {
    const status = this.program?.status;
    return (
      status === "pending_moderation" ||
      status === "published" ||
      status === "frozen" ||
      status === "archived"
    );
  }

  private syncState(): void {
    const value = this.form.getRawValue();
    const dirty = JSON.stringify(value) !== JSON.stringify(this.createValueFromProgram(this.editState.savedProgram()));

    this.editState.updateFormState(dirty, this.form.valid, this.computeReadonly(), {
      tabKey: this.tabKey,
      draft: {
        value,
        assetMeta: this.assetMeta,
      } satisfies MainDraft,
      programPatch: this.createProgramPatch(value),
    });
  }

  private isSavedAsset(key: AssetKey): boolean {
    const value = this.assetValue(key);

    return Boolean(value && this.savedAssetValues[key] === value && !this.assetMeta[key]);
  }

  private createProgramPatch(value: MainFormValue): Partial<Program> {
    return {
      name: value.name,
      tag: value.tag,
      description: value.description,
      city: value.city,
      coverImageAddress: value.coverImageAddress,
      mobileCoverImageAddress: value.mobileCoverImageAddress,
      imageAddress: value.imageAddress,
    };
  }

  private createValueFromProgram(program: Program | null): MainFormValue {
    return {
      name: program?.name ?? "",
      tag: program?.tag ?? "",
      description: program?.description ?? "",
      city: this.normalizeProgramFormat(program?.city),
      coverImageAddress: program?.coverImageAddress ?? "",
      mobileCoverImageAddress: program?.mobileCoverImageAddress ?? "",
      imageAddress: program?.imageAddress ?? "",
    };
  }

  private markAssetsAsSaved(program: Program | null = this.program): void {
    this.savedAssetValues = {
      coverImageAddress: program?.coverImageAddress ?? "",
      mobileCoverImageAddress: program?.mobileCoverImageAddress ?? "",
      imageAddress: program?.imageAddress ?? "",
    };
    this.assetMeta = {};
  }

  private normalizeProgramFormat(value?: string): string {
    const normalized = (value || "").trim().toLowerCase();
    if (!normalized) {
      return "";
    }
    return normalized === "онлайн" || normalized === "online" ? "Онлайн" : "Оффлайн";
  }
}
