import { Component, inject, OnInit, OnDestroy, ChangeDetectionStrategy } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { SpinnerService } from '../../../core/services/spinner.service';
import {
  NavigationCancel,
  NavigationEnd,
  NavigationError,
  NavigationStart,
  Router,
} from '@angular/router';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-spinner',
  imports: [NgTemplateOutlet],
  templateUrl: './spinner.component.html',
  styleUrl: './spinner.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Spinner implements OnInit, OnDestroy {
  private spinnerService = inject(SpinnerService);
  private router = inject(Router);
  private routerSub!: Subscription;
  customSpinner = this.spinnerService.customSpinner;
  spinner = this.spinnerService.spinner;
  ngOnInit() {
    this.routerSub = this.router.events.subscribe((event) => {
      if (event instanceof NavigationStart) {
        this.spinnerService.loadingOn();
      } else if (
        event instanceof NavigationEnd ||
        event instanceof NavigationCancel ||
        event instanceof NavigationError
      ) {
        this.spinnerService.loadingOff();
      }
    });
  }
  ngOnDestroy() {
    this.routerSub?.unsubscribe();
  }
}
