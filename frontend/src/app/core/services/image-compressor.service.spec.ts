import { TestBed } from '@angular/core/testing';
import { ImageCompressorService } from './image-compressor.service';

describe('ImageCompressorService', () => {
  let service: ImageCompressorService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [ImageCompressorService]
    });
    service = TestBed.inject(ImageCompressorService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
