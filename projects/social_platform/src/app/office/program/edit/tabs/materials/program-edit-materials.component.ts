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
import { IconComponent } from "@ui/components";
import { SnackbarService } from "@ui/services/snackbar.service";
import {
  ProgramEditStateService,
  ProgramEditTabController,
} from "../../services/program-edit-state.service";

interface ProgramMaterial {
  title: string;
  url: string;
}

type MaterialType = "link" | "file";

interface MaterialsDraft {
  materials: ProgramMaterial[];
  presentationAddress: string;
  links: string[];
}

@Component({
  selector: "app-program-edit-materials",
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, IconComponent],
  templateUrl: "./program-edit-materials.component.html",
  styleUrl: "./program-edit-materials.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProgramEditMaterialsComponent implements OnInit, OnDestroy {
  private readonly fb = inject(FormBuilder);
  private readonly destroyRef = inject(DestroyRef);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly editState = inject(ProgramEditStateService);
  private readonly programService = inject(ProgramService);
  private readonly fileService = inject(FileService);
  private readonly snackbar = inject(SnackbarService);
  private readonly tabKey = "materials";

  readonly newMaterialForm = this.fb.nonNullable.group({
    type: ["link" as MaterialType],
    title: ["", [Validators.required, Validators.maxLength(255)]],
    url: ["", [Validators.required]],
  });
  readonly programInfoForm = this.fb.nonNullable.group({
    websiteUrl: [""],
    presentationAddress: [""],
    contactUrl: [""],
  });

  readonly controller: ProgramEditTabController = {
    tabKey: this.tabKey,
    save: () => this.save(),
    reset: () => this.reset(),
  };

  materials: ProgramMaterial[] = [];
  private initialState: MaterialsDraft = {
    materials: [],
    presentationAddress: "",
    links: [],
  };
  private hiddenContactLinks: string[] = [];
  isUploading = false;
  isPresentationUploading = false;

  ngOnInit(): void {
    const draft = this.editState.getTabDraft<MaterialsDraft>(this.tabKey);
    if (draft) {
      this.initialState = this.buildStateFromProgram(this.editState.savedProgram());
      this.hiddenContactLinks = draft.links.slice(1);
      this.materials = [...draft.materials].filter(material => !this.isSiteMaterial(material));
      this.programInfoForm.patchValue(
        {
          websiteUrl: this.findSiteMaterial(draft.materials)?.url ?? "",
          presentationAddress: draft.presentationAddress,
          contactUrl: draft.links[0] ?? "",
        },
        { emitEvent: false }
      );
    } else {
      this.patchFromProgram(this.editState.savedProgram() ?? this.program);
    }
    this.applyReadonly();
    this.editState.registerController(this.controller);
    this.syncState();

    this.newMaterialForm.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      this.cdr.markForCheck();
    });
    this.programInfoForm.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      this.syncState();
      this.cdr.markForCheck();
    });
  }

  ngOnDestroy(): void {
    this.editState.unregisterController(this.controller);
  }

  get program(): Program | null {
    return this.editState.program();
  }

  get isReadonly(): boolean {
    const status = this.program?.status;
    return status === "pending_moderation" || status === "frozen" || status === "archived";
  }

  get isFileMode(): boolean {
    return this.newMaterialForm.controls.type.value === "file";
  }

  get presentationFileName(): string {
    return this.programInfoForm.controls.presentationAddress.value
      ? this.materialFileName(this.programInfoForm.controls.presentationAddress.value)
      : "";
  }

  addMaterial(): void {
    this.newMaterialForm.markAllAsTouched();

    if (this.newMaterialForm.invalid || this.isReadonly) {
      return;
    }

    const value = this.newMaterialForm.getRawValue();
    this.materials = [
      ...this.materials,
      {
        title: value.title.trim(),
        url: value.url.trim(),
      },
    ];

    this.newMaterialForm.reset({ type: value.type, title: "", url: "" });
    this.syncState();
    this.cdr.markForCheck();
  }

  updateMaterialTitle(index: number, value: string): void {
    if (this.isReadonly) {
      return;
    }

    this.materials = this.materials.map((material, materialIndex) =>
      materialIndex === index ? { ...material, title: value } : material
    );
    this.syncState();
  }

  removeMaterial(index: number): void {
    if (this.isReadonly) {
      return;
    }

    const shouldDelete = window.confirm("Удалить материал из чемпионата?");
    if (!shouldDelete) {
      return;
    }

    this.materials = this.materials.filter((_, materialIndex) => materialIndex !== index);
    this.syncState();
  }

  onFileSelected(event: Event): void {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) {
      return;
    }

    this.isUploading = true;
    this.fileService
      .uploadFile(file)
      .pipe(
        tap(({ url }) => {
          this.newMaterialForm.patchValue({
            title: this.newMaterialForm.controls.title.value || file.name,
            url,
          });
          input.value = "";
        }),
        catchError(error => {
          this.snackbar.error("Не удалось загрузить файл");
          return throwError(() => error);
        }),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe({
        next: () => {
          this.isUploading = false;
          this.cdr.markForCheck();
        },
        error: () => {
          this.isUploading = false;
          this.cdr.markForCheck();
        },
      });
  }

  onPresentationSelected(event: Event): void {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) {
      return;
    }

    this.isPresentationUploading = true;
    this.fileService
      .uploadFile(file)
      .pipe(
        tap(({ url }) => {
          this.programInfoForm.patchValue({ presentationAddress: url });
          input.value = "";
        }),
        catchError(error => {
          this.snackbar.error("Не удалось загрузить положение");
          return throwError(() => error);
        }),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe({
        next: () => {
          this.isPresentationUploading = false;
          this.cdr.markForCheck();
        },
        error: () => {
          this.isPresentationUploading = false;
          this.cdr.markForCheck();
        },
      });
  }

  materialKind(url: string): string {
    return /\.(pdf|docx?|xlsx?|pptx?|png|jpe?g|webp)$/i.test(url) ? "Файл" : "Ссылка";
  }

  materialFileName(url: string): string {
    return decodeURIComponent(url.split("/").pop() || url);
  }

  private save(): Observable<Program> {
    const programId = this.program?.id;
    if (!programId || this.isReadonly) {
      return throwError(() => new Error("Invalid materials form"));
    }

    const payload: ProgramDraftPayload = {
      presentationAddress: this.trimOrNull(this.programInfoForm.controls.presentationAddress.value),
      links: this.buildLinks(),
      materials: this.buildMaterialsPayload(),
    };

    return this.programService.update(programId, payload).pipe(
      tap(program => {
        this.patchFromProgram(program);
        this.editState.updateFormState(false, true, this.isReadonly);
        this.editState.updateProgram(program);
      })
    );
  }

  private reset(): void {
    this.patchFromProgram(this.editState.savedProgram() ?? this.program);
    this.newMaterialForm.reset({ type: "link", title: "", url: "" });
    this.syncState();
    this.cdr.markForCheck();
  }

  private patchFromProgram(program: Program | null): void {
    this.initialState = this.buildStateFromProgram(program);
    this.hiddenContactLinks = this.initialState.links.slice(1);
    this.materials = this.initialState.materials.filter(material => !this.isSiteMaterial(material));
    this.programInfoForm.patchValue(
      {
        websiteUrl: this.findSiteMaterial(this.initialState.materials)?.url ?? "",
        presentationAddress: program?.presentationAddress ?? "",
        contactUrl: program?.links?.[0] ?? "",
      },
      { emitEvent: false }
    );
  }

  private applyReadonly(): void {
    if (this.isReadonly) {
      this.newMaterialForm.disable({ emitEvent: false });
      this.programInfoForm.disable({ emitEvent: false });
      return;
    }

    this.newMaterialForm.enable({ emitEvent: false });
    this.programInfoForm.enable({ emitEvent: false });
  }

  private syncState(): void {
    const currentState = this.currentState();
    this.editState.updateFormState(this.isDirty(), true, this.isReadonly, {
      tabKey: this.tabKey,
      draft: currentState,
      programPatch: {
        materials: currentState.materials,
        presentationAddress: currentState.presentationAddress,
        links: currentState.links,
      },
    });
  }

  private isDirty(): boolean {
    return JSON.stringify(this.currentState()) !== JSON.stringify(this.initialState);
  }

  private currentState(): MaterialsDraft {
    return {
      materials: this.buildMaterialsPayload(),
      presentationAddress: this.programInfoForm.controls.presentationAddress.value.trim(),
      links: this.buildLinks(),
    };
  }

  private buildStateFromProgram(program: Program | null): MaterialsDraft {
    return {
      materials: [...(program?.materials ?? [])],
      presentationAddress: program?.presentationAddress ?? "",
      links: [...(program?.links ?? [])],
    };
  }

  private buildMaterialsPayload(): ProgramMaterial[] {
    const materials = this.materials
      .map(material => ({
        title: material.title.trim(),
        url: material.url.trim(),
      }))
      .filter(material => material.title && material.url && !this.isSiteMaterial(material));

    const websiteUrl = this.programInfoForm.controls.websiteUrl.value.trim();
    if (websiteUrl) {
      materials.push({ title: "Сайт чемпионата", url: websiteUrl });
    }

    return materials;
  }

  private buildLinks(): string[] {
    const contactUrl = this.programInfoForm.controls.contactUrl.value.trim();
    return [...(contactUrl ? [contactUrl] : []), ...this.hiddenContactLinks];
  }

  private findSiteMaterial(materials: ProgramMaterial[]): ProgramMaterial | undefined {
    return materials.find(material => this.isSiteMaterial(material));
  }

  private isSiteMaterial(material: ProgramMaterial): boolean {
    return material.title.trim().toLowerCase().includes("сайт");
  }

  private trimOrNull(value: string): string | null {
    const trimmed = value.trim();
    return trimmed || null;
  }
}
