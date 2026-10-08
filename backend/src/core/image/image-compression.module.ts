import { Module } from '@nestjs/common';
import { ImageCompressionService } from './image-compression.service';

/**
 * ImageCompressionModule (F7 — WebP Image Compression, tasks T2.2)
 * — exposes `ImageCompressionService`. Imported by `CoreModule` (which is
 * `@Global()`), so the three feature modules that need the service
 * (users, incidents, comments) inject it without re-importing this module
 * locally. See `core.module.ts` and apply-progress.md §5.
 */
@Module({
  providers: [ImageCompressionService],
  exports: [ImageCompressionService],
})
export class ImageCompressionModule {}
