/**
 * sc-334 Phase 2 — RED tests for `ShapefileImportDialogComponent`.
 *
 * Covers task 2.5 (a-d) from `openspec/changes/geo-zones-shapefile-import/tasks.md`:
 *   (a) file type `.zip` accepted (no rejection, no error message)
 *   (b) file > 10 MB rejected with error message before POST
 *   (c) `UploadProgress` event advances the progress signal to the loaded value
 *   (d) `Response` event resets progress and exposes the import envelope
 *
 * Plus client-side validation from task 2.9 (non-zip rejected by extension /
 * MIME type with a user-facing error message).
 *
 * These tests must FAIL before the dialog implementation (RED) and PASS once
 * the implementation is complete (GREEN, task 2.8).
 */

import { ComponentRef } from '@angular/core';
import { render, screen, fireEvent } from '@testing-library/angular';
import { Subject } from 'rxjs';
import { HttpEvent, HttpEventType } from '@angular/common/http';

import { ShapefileImportDialogComponent } from './shapefile-import-dialog.component';
import { GeoZoneService } from '../../services/geo-zone.service';
import { ToastService } from '../../../../../shared/components/toast/toast.service';

const TEN_MB = 10 * 1024 * 1024;

describe('ShapefileImportDialogComponent (sc-334)', () => {
  let importSubject: Subject<HttpEvent<unknown>>;
  let mockGeoZoneService: { importShapefile: jest.Mock; getFormData: jest.Mock };
  let mockToastService: { success: jest.Mock; error: jest.Mock };

  const buildZipFile = (sizeBytes: number, name = 'cantons.zip'): File => {
    const blob = new Blob([new ArrayBuffer(sizeBytes)], {
      type: 'application/zip',
    });
    return new File([blob], name, { type: 'application/zip' });
  };

  beforeEach(() => {
    importSubject = new Subject<HttpEvent<unknown>>();
    mockGeoZoneService = {
      importShapefile: jest.fn().mockReturnValue(importSubject.asObservable()),
      getFormData: jest.fn(),
    };
    mockToastService = { success: jest.fn(), error: jest.fn() };
  });

  const setup = async () => {
    const result = await render(ShapefileImportDialogComponent, {
      providers: [
        { provide: GeoZoneService, useValue: mockGeoZoneService },
        { provide: ToastService, useValue: mockToastService },
      ],
    });
    return result;
  };

  // ── (a) zip accepted ───────────────────────────────────────────────────

  it('(a) accepts a .zip file under 10 MB and clears the error', async () => {
    const { fixture } = await setup();
    const component = fixture.componentInstance;

    const fileInput = screen.getByLabelText(/archivo/i) as HTMLInputElement;
    const zip = buildZipFile(1024);
    Object.defineProperty(fileInput, 'files', { value: [zip] });
    fireEvent.change(fileInput);

    expect(component.file()).toBe(zip);
    expect(component.error()).toBeNull();
  });

  // ── (b) > 10 MB rejected ───────────────────────────────────────────────

  it('(b) rejects a file larger than 10 MB with a user-facing error and never POSTs', async () => {
    const { fixture } = await setup();
    const component = fixture.componentInstance;

    const fileInput = screen.getByLabelText(/archivo/i) as HTMLInputElement;
    const oversized = buildZipFile(TEN_MB + 1);
    Object.defineProperty(fileInput, 'files', { value: [oversized] });
    fireEvent.change(fileInput);

    expect(component.error()).toMatch(/10\s*MB|demasiado|excede/i);
    expect(component.file()).toBeNull();
    expect(mockGeoZoneService.importShapefile).not.toHaveBeenCalled();
  });

  // ── task 2.9 client-side validation — non-zip rejected ─────────────────

  it('rejects a non-zip file by extension / MIME type before POST', async () => {
    const { fixture } = await setup();
    const component = fixture.componentInstance;

    const fileInput = screen.getByLabelText(/archivo/i) as HTMLInputElement;
    const notAZip = new File([new ArrayBuffer(1024)], 'data.csv', {
      type: 'text/csv',
    });
    Object.defineProperty(fileInput, 'files', { value: [notAZip] });
    fireEvent.change(fileInput);

    expect(component.error()).toMatch(/zip/i);
    expect(component.file()).toBeNull();
    expect(mockGeoZoneService.importShapefile).not.toHaveBeenCalled();
  });

  // ── (c) UploadProgress event advances progress signal ──────────────────

  it('(c) UploadProgress event advances the progress signal to loaded/total*100', async () => {
    const { fixture } = await setup();
    const component = fixture.componentInstance;

    // First pick a valid file so the submit button enables.
    const fileInput = screen.getByLabelText(/archivo/i) as HTMLInputElement;
    Object.defineProperty(fileInput, 'files', {
      value: [buildZipFile(2048)],
    });
    fireEvent.change(fileInput);

    const submit = screen.getByRole('button', { name: /importar/i });
    fireEvent.click(submit);

    expect(mockGeoZoneService.importShapefile).toHaveBeenCalled();
    importSubject.next({
      type: HttpEventType.UploadProgress,
      loaded: 50,
      total: 100,
    });

    expect(component.progress()).toBe(50);
  });

  // ── (d) Response event resets progress + exposes envelope ──────────────

  it('(d) Response event resets progress to 0 and stores the envelope', async () => {
    const { fixture } = await setup();
    const component = fixture.componentInstance;

    const fileInput = screen.getByLabelText(/archivo/i) as HTMLInputElement;
    Object.defineProperty(fileInput, 'files', {
      value: [buildZipFile(2048)],
    });
    fireEvent.change(fileInput);

    const submit = screen.getByRole('button', { name: /importar/i });
    fireEvent.click(submit);

    // Drive progress to 50 first
    importSubject.next({
      type: HttpEventType.UploadProgress,
      loaded: 50,
      total: 100,
    });
    expect(component.progress()).toBe(50);

    importSubject.next({
      type: HttpEventType.Response,
      body: { imported: 3, skipped: 0, errors: [], warnings: [] },
      status: 200,
      statusText: 'OK',
      headers: {} as Record<string, string>,
      url: '/api/geo-zones/import',
    } as unknown as HttpEvent<unknown>);

    expect(component.progress()).toBe(0);
    expect(component.result()?.imported).toBe(3);
    expect(component.result()?.errors).toHaveLength(0);
    expect(component.isSubmitting()).toBe(false);
  });

  // ── Level dropdown wired to backend query param ────────────────────────

  it('forwards the selected level to the service on submit', async () => {
    const { fixture } = await setup();
    const component = fixture.componentInstance;

    component.level.set('canton');

    const fileInput = screen.getByLabelText(/archivo/i) as HTMLInputElement;
    Object.defineProperty(fileInput, 'files', {
      value: [buildZipFile(2048)],
    });
    fireEvent.change(fileInput);

    const submit = screen.getByRole('button', { name: /importar/i });
    fireEvent.click(submit);

    const [, params] = mockGeoZoneService.importShapefile.mock.calls[0];
    expect(params.level).toBe('canton');
    expect(params.auto_parent).toBe(true);
    expect(params.name_column).toBe('NAME');
    expect(params.code_column).toBe('CODE');
  });

  // ── Cancel emits a closed event so the parent can hide the dialog ──────

  it('emits closed when the user cancels', async () => {
    const { fixture } = await setup();

    let closedEmitted = false;
    (
      fixture.componentRef as ComponentRef<ShapefileImportDialogComponent>
    ).instance.closed.subscribe(() => {
      closedEmitted = true;
    });

    const cancel = screen.getByRole('button', { name: /cancelar/i });
    fireEvent.click(cancel);

    expect(closedEmitted).toBe(true);
    expect(mockGeoZoneService.importShapefile).not.toHaveBeenCalled();
  });
});
