import { Controller, Get, HttpCode, HttpStatus } from '@nestjs/common';
import { IncidentsService } from './modules/incidents/incidents.service';

@Controller()
export class AppController {
  constructor(private readonly incidentsService: IncidentsService) {}

  @Get('health')
  @HttpCode(HttpStatus.OK)
  getHealth(): { status: string; timestamp: string } {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }

  /**
   * T6.8.A4 — GeoReporta parity: GET /estados alias for GET /incidents/statuses.
   */
  @Get('estados')
  getEstados() {
    return this.incidentsService.getStatuses();
  }
}
