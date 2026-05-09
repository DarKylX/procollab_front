/** @format */

import { Injectable } from "@angular/core";
import { AuthService } from "@auth/services";
import { User } from "@auth/models/user.model";
import { Program } from "@office/program/models/program.model";
import { combineLatest, map, Observable, of, shareReplay, take } from "rxjs";

export type ProgramRole = "organizer" | "expert" | "participant" | "guest" | "admin";

@Injectable({
  providedIn: "root",
})
export class RoleResolverService {
  private readonly cache = new Map<number, Observable<ProgramRole[]>>();

  constructor(private readonly authService: AuthService) {}

  getRole(programId: number, program?: Program): Observable<ProgramRole[]> {
    if (!program) {
      return of(["guest"]);
    }

    const cached = this.cache.get(programId);
    if (cached) {
      return cached;
    }

    const roles$ = combineLatest([this.authService.profile.pipe(take(1)), of(program)]).pipe(
      map(([profile, programData]) => this.resolveRoles(profile, programData)),
      shareReplay({ bufferSize: 1, refCount: true })
    );

    this.cache.set(programId, roles$);

    return roles$;
  }

  clear(programId?: number): void {
    if (programId) {
      this.cache.delete(programId);
      return;
    }

    this.cache.clear();
  }

  private resolveRoles(profile: User, program: Program): ProgramRole[] {
    const roles = new Set<ProgramRole>();
    const profileWithFlags = profile as User & { isStaff?: boolean; is_staff?: boolean };
    const userId = profile.id;

    if (profileWithFlags.isStaff || profileWithFlags.is_staff) {
      roles.add("admin");
    }

    if (program.isUserManager || program.managers?.some(manager => manager.id === userId)) {
      roles.add("organizer");
    }

    if (program.isUserExpert || program.experts?.some(expert => expert.id === userId)) {
      roles.add("expert");
    }

    if (
      program.isUserMember ||
      program.participants?.some(participant => participant.id === userId)
    ) {
      roles.add("participant");
    }

    return roles.size ? Array.from(roles) : ["guest"];
  }
}
