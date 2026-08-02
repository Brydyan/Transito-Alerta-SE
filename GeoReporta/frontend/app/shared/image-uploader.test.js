import { describe, expect, it, vi, beforeEach } from 'vitest';
import { mountImageUploader, ACCEPTED_IMAGE_TYPES } from './image-uploader.js';

describe('mountImageUploader', () => {
  let container;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    // Mock URL.createObjectURL / revokeObjectURL for jsdom environment
    vi.stubGlobal('URL', {
      createObjectURL: vi.fn(() => 'blob:http://localhost/test-uuid'),
      revokeObjectURL: vi.fn(),
    });
  });

  it('renders dropzone and mobile action buttons', () => {
    const controller = mountImageUploader({ container });

    expect(container.querySelector('#iu-dropzone')).not.toBeNull();
    expect(container.querySelector('#iu-btn-camera')).not.toBeNull();
    expect(container.querySelector('#iu-btn-gallery')).not.toBeNull();
    expect(controller.getFiles().length).toBe(0);
  });

  it('adds files via file input change', () => {
    const onChange = vi.fn();
    const controller = mountImageUploader({ container, onChange });

    const fileInput = container.querySelector('#iu-file-input-desktop');
    const dummyFile = new File(['dummy'], 'test.png', { type: 'image/png' });

    Object.defineProperty(fileInput, 'files', {
      value: [dummyFile],
    });

    fileInput.dispatchEvent(new Event('change'));

    expect(controller.getFiles().length).toBe(1);
    expect(controller.getFiles()[0].name).toBe('test.png');
    expect(onChange).toHaveBeenCalledWith([dummyFile]);
    expect(container.querySelector('.image-uploader__card')).not.toBeNull();
  });

  it('enforces maximum file count limit', () => {
    const controller = mountImageUploader({ container, maxFiles: 2 });
    const fileInput = container.querySelector('#iu-file-input-desktop');

    const file1 = new File(['1'], 'foto1.jpg', { type: 'image/jpeg' });
    const file2 = new File(['2'], 'foto2.jpg', { type: 'image/jpeg' });
    const file3 = new File(['3'], 'foto3.jpg', { type: 'image/jpeg' });

    Object.defineProperty(fileInput, 'files', {
      value: [file1, file2, file3],
    });

    fileInput.dispatchEvent(new Event('change'));

    expect(controller.getFiles().length).toBe(2);
    expect(container.querySelector('#iu-error').textContent).toContain(
      'máximo de 2 imágenes',
    );
  });

  it('validates file size limit', () => {
    const controller = mountImageUploader({ container, maxSizeMB: 1 });
    const fileInput = container.querySelector('#iu-file-input-desktop');

    // 2 MB file (larger than 1 MB limit)
    const largeFile = new File(
      [new ArrayBuffer(2 * 1024 * 1024)],
      'large.jpg',
      { type: 'image/jpeg' },
    );

    Object.defineProperty(fileInput, 'files', {
      value: [largeFile],
    });

    fileInput.dispatchEvent(new Event('change'));

    expect(controller.getFiles().length).toBe(0);
    expect(container.querySelector('#iu-error').textContent).toContain(
      'supera el tamaño máximo',
    );
  });

  it('removes an individual file', () => {
    const controller = mountImageUploader({ container });
    const fileInput = container.querySelector('#iu-file-input-desktop');

    const file1 = new File(['1'], 'foto1.jpg', { type: 'image/jpeg' });
    const file2 = new File(['2'], 'foto2.jpg', { type: 'image/jpeg' });

    Object.defineProperty(fileInput, 'files', {
      value: [file1, file2],
    });

    fileInput.dispatchEvent(new Event('change'));
    expect(controller.getFiles().length).toBe(2);

    // Click remove button on first card
    const removeBtns = container.querySelectorAll(
      '.image-uploader__remove-btn',
    );
    removeBtns[0].click();

    expect(controller.getFiles().length).toBe(1);
    expect(controller.getFiles()[0].name).toBe('foto2.jpg');
    expect(URL.revokeObjectURL).toHaveBeenCalled();
  });

  it('accepts gif in ACCEPTED_IMAGE_TYPES and the file input accept attribute (D10 validation parity)', () => {
    expect(ACCEPTED_IMAGE_TYPES).toContain('image/gif');

    mountImageUploader({ container });
    const inputDesktop = container.querySelector('.iu-file-input-desktop');
    const inputGallery = container.querySelector('#iu-file-input-gallery');

    expect(inputDesktop.getAttribute('accept')).toContain('image/gif');
    expect(inputGallery.getAttribute('accept')).toContain('image/gif');
  });

  it('clears all files on controller.clear()', () => {
    const controller = mountImageUploader({ container });
    const fileInput = container.querySelector('#iu-file-input-desktop');

    const file1 = new File(['1'], 'foto1.jpg', { type: 'image/jpeg' });
    Object.defineProperty(fileInput, 'files', { value: [file1] });
    fileInput.dispatchEvent(new Event('change'));

    controller.clear();
    expect(controller.getFiles().length).toBe(0);
    expect(container.querySelectorAll('.image-uploader__card').length).toBe(0);
  });
});
