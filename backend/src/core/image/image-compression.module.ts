import { Module } from '@nestjs/common';
import { ImageCompressionService } from './image-compression.service';

/**
 * ImageCompressionModule (F7 image-compression-webp, T2.2) — provides
 * `ImageCompressionService` to the three image-upload services. Designed
 * to be imported (or registered as global) from `CoreModule` so any
 * feature module that needs image compression gets it for free.
 */
@Module({
  providers: [ImageCompressionService],
  exports: [ImageCompressionService],
})
export class ImageCompressionModule {}
