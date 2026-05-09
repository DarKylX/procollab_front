/** @format */

import { inject } from "@angular/core";
import { CanActivateFn, Router } from "@angular/router";
import { AuthService } from "@auth/services";
import { catchError, map, of } from "rxjs";

export const moderationStaffGuard: CanActivateFn = () => {
  const authService = inject(AuthService);
  const router = inject(Router);

  return authService.getProfile().pipe(
    map(profile =>
      profile.isStaff ? true : router.createUrlTree(["/office/admin/moderation/forbidden"])
    ),
    catchError(() => of(router.createUrlTree(["/auth"])))
  );
};
