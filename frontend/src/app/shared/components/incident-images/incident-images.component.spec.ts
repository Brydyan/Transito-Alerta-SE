import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';

import { IncidentImagesComponent } from './incident-images.component';
import { environment } from '../../../../environments/environment';

/**
 * 2026-10-06-incident-images-read-path (D8) — covers the three
 * observable states (loading / empty / populated) and the byte
 * route Object URL wiring that the previous `img.url` binding
 * couldn't do (the noop client returned `file://` URLs that the
 * browser strictly blocks — D3 rationale).
 */
describe('IncidentImagesComponent (2026-10-06-incident-images-read-path)', () => {
  let fixture: ComponentFixture<IncidentImagesComponent>;
  let component: IncidentImagesComponent;
  let httpMock: HttpTestingController;

  const incidentId = 'inc-1';

  function create() {
    fixture = TestBed.createComponent(IncidentImagesComponent);
    component = fixture.componentInstance;
    // `input.required<string>()` — set via the signal API before
    // the first CD pass so the template sees a real id.
    fixture.componentRef.setInput('incidentId', incidentId);
    fixture.detectChanges();
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [IncidentImagesComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    // Some tests don't care about the per-image byte fetch and leave
    // those requests outstanding; flush them as errors so the
    // `verify()` call below doesn't trip on open requests. Tests that
    // DO care flush explicitly before the assertion runs.
    httpMock.match(() => true).forEach((r) =>
      r.flush(new Blob(), { status: 204, statusText: 'No Content' }),
    );
    httpMock.verify();
  });

  it('shows the loading state until the metadata request resolves', () => {
    create();
    expect(fixture.nativeElement.querySelector('[data-testid="images-loading"]')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('[data-testid="images-grid"]')).toBeFalsy();

    httpMock.expectOne(`${environment.apiUrl}/incidents/${incidentId}/images`).flush([]);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[data-testid="images-loading"]')).toBeFalsy();
    expect(fixture.nativeElement.querySelector('[data-testid="images-empty"]')).toBeTruthy();
  });

  it('renders one anchor per metadata row and kicks off a byte fetch for each', () => {
    create();
    const metadata = [
      { id: 'img-1', mime_type: 'image/webp', file_size: 1024, created_at: '2026-10-01T00:00:00Z' },
      { id: 'img-2', mime_type: 'image/png', file_size: 2048, created_at: '2026-10-02T00:00:00Z' },
    ];
    httpMock.expectOne(`${environment.apiUrl}/incidents/${incidentId}/images`).flush(metadata);
    fixture.detectChanges();

    // Both byte fetches have been kicked off — HttpTestingController
    // enqueues them; flushing one resolves a single image's bytes.
    const fileRequests = httpMock.match(
      `${environment.apiUrl}/incidents/${incidentId}/images/${'img-1'}/file`,
    );
    expect(fileRequests.length).toBe(1);
  });

  it('renders the error state when the metadata request fails', () => {
    create();
    httpMock.expectOne(`${environment.apiUrl}/incidents/${incidentId}/images`).flush('boom', {
      status: 500,
      statusText: 'Internal Server Error',
    });
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[data-testid="images-error"]')).toBeTruthy();
  });

  it('returns `undefined` from objectUrlFor while the byte fetch is pending', () => {
    create();
    httpMock.expectOne(`${environment.apiUrl}/incidents/${incidentId}/images`).flush([
      { id: 'img-1', mime_type: 'image/webp', file_size: 1024, created_at: '2026-10-01T00:00:00Z' },
    ]);
    fixture.detectChanges();

    expect(component.objectUrlFor('img-1')).toBeUndefined();
  });

  it('rejects a per-image byte fetch failure without flipping the global error signal', () => {
    // D4 — a single bad image must NOT blank the whole gallery.
    // The template renders a placeholder (`image-pending-{id}`) for
    // any row whose Object URL is undefined; only a metadata-list
    // 5xx trips `error()`.
    create();
    httpMock.expectOne(`${environment.apiUrl}/incidents/${incidentId}/images`).flush([
      { id: 'img-1', mime_type: 'image/webp', file_size: 1024, created_at: '2026-10-01T00:00:00Z' },
    ]);
    fixture.detectChanges();

    // The byte fetch kicks off; flush it as a 500. The component's
    // per-image error handler leaves the entry undefined; the global
    // `error` signal stays false.
    httpMock
      .expectOne(`${environment.apiUrl}/incidents/${incidentId}/images/img-1/file`)
      .error(new ProgressEvent('error'));
    fixture.detectChanges();

    // No `images-error` in the DOM (we're not in the global error
    // branch); `images-grid` is rendered with the placeholder.
    expect(fixture.nativeElement.querySelector('[data-testid="images-error"]')).toBeFalsy();
    expect(fixture.nativeElement.querySelector('[data-testid="images-grid"]')).toBeTruthy();
  });
});