import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root',
})
export class ImageCompressorService {
  async compressImage(file: File, quality: number = 0.7): Promise<Blob> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = (event: any) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');

          canvas.width = img.width;
          canvas.height = img.height;

          ctx?.drawImage(img, 0, 0);

          canvas.toBlob(
            (blob) => {
              if (blob) {
                resolve(blob);
              } else {
                reject('Failed to compress image');
              }
            },
            'image/webp',
            quality,
          );
        };

        img.onerror = () => reject('Failed to load image');
        img.src = event.target.result;
      };

      reader.onerror = () => reject('Failed to read file');
      reader.readAsDataURL(file);
    });
  }

  getFileSizeKB(blob: Blob): number {
    return blob.size / 1024;
  }
}
