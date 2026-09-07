import { Directive, inject, input, TemplateRef, ViewContainerRef, effect } from '@angular/core';
import { AuthService } from '../../core/services/auth.service';

/**
 * Structural directive that conditionally renders the host element
 * based on whether the current user holds the specified permission.
 *
 * Usage: `*hasPermission="'CREATE incident-categories'"`
 */
@Directive({
  selector: '[hasPermission]',
  standalone: true,
})
export class HasPermissionDirective {
  private readonly templateRef = inject(TemplateRef<unknown>);
  private readonly viewContainer = inject(ViewContainerRef);
  private readonly authService = inject(AuthService);

  readonly hasPermission = input.required<string>();

  private rendered = false;

  constructor() {
    // Evaluate on construction and re-evaluate whenever the permission
    // input changes. Since Angular evaluates structural directive inputs
    // before the component is created, we do the initial check here.
    effect(() => {
      this.evaluate();
    });
  }

  private evaluate(): void {
    const permission = this.hasPermission();
    const permissions = this.authService.currentUser()?.permissions ?? [];
    const hasIt = permissions.includes(permission);

    if (hasIt && !this.rendered) {
      this.viewContainer.createEmbeddedView(this.templateRef);
      this.rendered = true;
    } else if (!hasIt && this.rendered) {
      this.viewContainer.clear();
      this.rendered = false;
    }
  }
}
