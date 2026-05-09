/** @format */

import { of } from "rxjs";
import { AuthService } from "@auth/services";
import { User } from "@auth/models/user.model";
import { Program } from "@office/program/models/program.model";
import { RoleResolverService } from "./role-resolver.service";

describe("RoleResolverService", () => {
  function createService(profile: Partial<User>): RoleResolverService {
    return new RoleResolverService({ profile: of(profile as User) } as AuthService);
  }

  it("should resolve multiple roles", done => {
    const service = createService({ id: 7, isStaff: true } as Partial<User> & {
      isStaff: boolean;
    });
    const program = {
      id: 12,
      isUserManager: true,
      isUserExpert: true,
      isUserMember: true,
    } as Program;

    service.getRole(program.id, program).subscribe(roles => {
      expect(roles).toEqual(["admin", "organizer", "expert", "participant"]);
      done();
    });
  });

  it("should resolve guest when no role applies", done => {
    const service = createService({ id: 7 });

    service.getRole(12, { id: 12 } as Program).subscribe(roles => {
      expect(roles).toEqual(["guest"]);
      done();
    });
  });
});
