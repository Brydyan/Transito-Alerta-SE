import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';

import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { IncidentCategoryEntity } from '../../entities/incident-category.entity';
import { CreateIncidentCategoryDto } from './dto/create-incident-category.dto';
import { UpdateIncidentCategoryDto } from './dto/update-incident-category.dto';
import { ListResult } from './incident-categories.service';
import { CategoryNode } from './incident-categories.repository';
import { IncidentCategoriesService } from './incident-categories.service';

/**
 * IncidentCategoriesController (T3.7). `GET /tree` MUST be declared before
 * `GET /:id` — Nest matches routes in declaration order and `:id` would
 * otherwise swallow the literal `tree` segment (design D-Routes). No
 * `{data}` response envelope (design D7) — entities/arrays are returned
 * directly, matching every other controller in this codebase; `list()`
 * follows UsersController's `{items, total}` pagination shape.
 */
@Controller('incident-categories')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class IncidentCategoriesController {
  constructor(private readonly categoriesService: IncidentCategoriesService) {}

  @Get('tree')
  @RequirePermission('READ')
  getTree(): Promise<CategoryNode[]> {
    return this.categoriesService.getTree();
  }

  @Get()
  @RequirePermission('READ')
  list(
    @Query('search') search?: string,
    @Query('parent_id') parentId?: string,
    @Query('page') page?: string,
    @Query('per_page') perPage?: string,
  ): Promise<ListResult> {
    return this.categoriesService.list({
      search,
      parentId: parentId === 'null' ? null : parentId,
      page: page ? parseInt(page, 10) : undefined,
      perPage: perPage ? parseInt(perPage, 10) : undefined,
    });
  }

  @Get(':id')
  @RequirePermission('READ')
  findOne(@Param('id', ParseUUIDPipe) id: string): Promise<IncidentCategoryEntity> {
    return this.categoriesService.findById(id);
  }

  @Post()
  @RequirePermission('CREATE')
  create(@Body() dto: CreateIncidentCategoryDto): Promise<IncidentCategoryEntity> {
    return this.categoriesService.create(dto);
  }

  @Patch(':id')
  @RequirePermission('UPDATE')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateIncidentCategoryDto,
  ): Promise<IncidentCategoryEntity> {
    return this.categoriesService.update(id, dto);
  }

  @Delete(':id')
  @RequirePermission('DELETE')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.categoriesService.delete(id);
  }
}
