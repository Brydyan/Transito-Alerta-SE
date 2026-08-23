import { CategoryDto } from './category.dto';

/**
 * `GET /api/map/filters` response. Wraps the catalog in a `data` envelope
 * to match the rest of the project's catalog endpoints (one less surprise
 * for the frontend axios instance).
 */
export class MapFiltersResponseDto {
  data!: { categories: CategoryDto[] };
}
