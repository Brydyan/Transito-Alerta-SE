import { HttpContextToken, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { SpinnerService } from '../services/spinner.service';
import { finalize } from 'rxjs';

export const NoLoading = new HttpContextToken(() => false);

export const spinnerInterceptor: HttpInterceptorFn = (req, next) => {
  const spinnerService = inject(SpinnerService);

  if (req.context.get(NoLoading)) {
    return next(req);
  }

  spinnerService.loadingOn();

  return next(req).pipe(
    finalize(() => {
      spinnerService.loadingOff();
    }),
  );
};
