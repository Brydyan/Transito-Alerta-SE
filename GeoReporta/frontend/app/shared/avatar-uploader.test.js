/**
 * avatar-uploader helper unit tests.
 *
 * Covers click-to-open behaviour, blob URL lifecycle on file selection /
 * replacement / clear / destroy, and the ignore-target exception (used
 * when callers layer a remove button on top of the avatar wrap).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mountAvatarUploader } from './avatar-uploader.js';

const _mockBlobUrl = 'blob:mock-avatar-url';
const _mockCreateObjectURL = vi.fn(() => _mockBlobUrl);
const _mockRevokeObjectURL = vi.fn();

function _makeFakeFile(name = 'avatar.jpg', type = 'image/jpeg', size = 1024) {
  const file = new File([new Uint8Array(size)], name, { type });
  Object.defineProperty(file, 'size', { value: size, configurable: true });
  return file;
}

function _setInputFile(file) {
  const input = document.getElementById('input');
  Object.defineProperty(input, 'files', { value: [file], configurable: true });
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

describe('mountAvatarUploader', () => {
  beforeEach(() => {
    globalThis.URL = {
      createObjectURL: _mockCreateObjectURL,
      revokeObjectURL: _mockRevokeObjectURL,
    };
    document.body.innerHTML = `
      <div id="wrap">
        <img id="preview" src="#" style="display:none" />
        <button id="remove" type="button" data-avatar-ignore>x</button>
      </div>
      <input id="input" type="file" />
    `;
  });

  it('returns null when any required element is missing', () => {
    const ctrl = mountAvatarUploader({
      wrap: '#missing',
      preview: '#preview',
      input: '#input',
    });
    expect(ctrl).toBeNull();
  });

  it('opens file input when wrap is clicked', () => {
    const inputClickSpy = vi.spyOn(document.getElementById('input'), 'click');
    const ctrl = mountAvatarUploader({
      wrap: '#wrap',
      preview: '#preview',
      input: '#input',
    });
    document
      .getElementById('wrap')
      .dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(inputClickSpy).toHaveBeenCalledTimes(1);
    ctrl.destroy();
  });

  it('does NOT open file input when click target is data-avatar-ignore', () => {
    const inputClickSpy = vi.spyOn(document.getElementById('input'), 'click');
    const ctrl = mountAvatarUploader({
      wrap: '#wrap',
      preview: '#preview',
      input: '#input',
    });
    document
      .getElementById('remove')
      .dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(inputClickSpy).not.toHaveBeenCalled();
    ctrl.destroy();
  });

  it('shows preview and creates a blob URL on file selection', () => {
    const ctrl = mountAvatarUploader({
      wrap: '#wrap',
      preview: '#preview',
      input: '#input',
    });
    const file = _makeFakeFile();
    _setInputFile(file);

    expect(_mockCreateObjectURL).toHaveBeenCalledWith(file);
    expect(document.getElementById('preview').src).toBe(_mockBlobUrl);
    expect(document.getElementById('preview').style.display).toBe('block');
    ctrl.destroy();
  });

  it('replaces previous blob URL when a new file is selected (no leak)', () => {
    const ctrl = mountAvatarUploader({
      wrap: '#wrap',
      preview: '#preview',
      input: '#input',
    });
    _setInputFile(_makeFakeFile('a.jpg'));
    const revokeCountBefore = _mockRevokeObjectURL.mock.calls.length;
    _setInputFile(_makeFakeFile('b.jpg'));
    expect(_mockRevokeObjectURL.mock.calls.length).toBeGreaterThan(
      revokeCountBefore,
    );
    ctrl.destroy();
  });

  it('hides preview and revokes URL when input change has no file', () => {
    const ctrl = mountAvatarUploader({
      wrap: '#wrap',
      preview: '#preview',
      input: '#input',
    });
    _setInputFile(_makeFakeFile());
    Object.defineProperty(document.getElementById('input'), 'files', {
      value: [],
      configurable: true,
    });
    document
      .getElementById('input')
      .dispatchEvent(new Event('change', { bubbles: true }));
    expect(document.getElementById('preview').getAttribute('src')).toBe('');
    expect(document.getElementById('preview').style.display).toBe('none');
    ctrl.destroy();
  });

  it('applies accept attribute from ACCEPTED_MIME_TYPES', () => {
    mountAvatarUploader({
      wrap: '#wrap',
      preview: '#preview',
      input: '#input',
    });
    expect(document.getElementById('input').accept).toBe(
      'image/jpeg,image/png,image/webp',
    );
  });

  it('getFile() returns the currently selected File or null', () => {
    const ctrl = mountAvatarUploader({
      wrap: '#wrap',
      preview: '#preview',
      input: '#input',
    });
    expect(ctrl.getFile()).toBeNull();

    const file = _makeFakeFile();
    _setInputFile(file);
    expect(ctrl.getFile()).toBe(file);
    ctrl.destroy();
  });

  it('clear() clears preview and revokes object URL', () => {
    const ctrl = mountAvatarUploader({
      wrap: '#wrap',
      preview: '#preview',
      input: '#input',
    });
    _setInputFile(_makeFakeFile());

    ctrl.clear();

    expect(document.getElementById('preview').getAttribute('src')).toBeNull();
    expect(document.getElementById('preview').style.display).toBe('none');
    expect(document.getElementById('input').value).toBe('');
    expect(_mockRevokeObjectURL).toHaveBeenCalled();
  });

  it('setPreviewFromUrl() updates preview to a server URL and revokes object URL', () => {
    const ctrl = mountAvatarUploader({
      wrap: '#wrap',
      preview: '#preview',
      input: '#input',
    });
    _setInputFile(_makeFakeFile());

    const revokeCountBefore = _mockRevokeObjectURL.mock.calls.length;
    ctrl.setPreviewFromUrl('/storage/users/5/abc.webp');

    expect(document.getElementById('preview').getAttribute('src')).toBe(
      '/storage/users/5/abc.webp',
    );
    expect(document.getElementById('preview').style.display).toBe('block');
    expect(document.getElementById('input').value).toBe('');
    expect(_mockRevokeObjectURL.mock.calls.length).toBeGreaterThan(
      revokeCountBefore,
    );
    ctrl.destroy();
  });

  it('destroy() removes listeners and revokes any open object URL', () => {
    const ctrl = mountAvatarUploader({
      wrap: '#wrap',
      preview: '#preview',
      input: '#input',
    });
    _setInputFile(_makeFakeFile());

    const wrapRemoveSpy = vi.spyOn(
      document.getElementById('wrap'),
      'removeEventListener',
    );
    const inputRemoveSpy = vi.spyOn(
      document.getElementById('input'),
      'removeEventListener',
    );

    ctrl.destroy();

    expect(wrapRemoveSpy).toHaveBeenCalledWith('click', expect.any(Function));
    expect(inputRemoveSpy).toHaveBeenCalledWith('change', expect.any(Function));
    expect(_mockRevokeObjectURL).toHaveBeenCalled();
  });
});
