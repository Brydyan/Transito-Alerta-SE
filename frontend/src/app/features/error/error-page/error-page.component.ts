import { ChangeDetectionStrategy, Component, OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-error-page',
  imports: [RouterLink],
  templateUrl: './error-page.component.html',
  styleUrl: './error-page.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ErrorPageComponent implements OnInit {
  errorCode = 404;
  errorTitle = 'Página no encontrada';
  errorDescription = 'La página que buscas no existe o fue movida.';

  ngOnInit(): void {
    const state = history.state as { errorCode?: number };

    if (state?.errorCode === 500) {
      this.errorCode = 500;
      this.errorTitle = 'Servidor en mantenimiento';
      this.errorDescription =
        'Estamos teniendo problemas técnicos. Por favor, intenta de nuevo más tarde.';
    }
  }
}
