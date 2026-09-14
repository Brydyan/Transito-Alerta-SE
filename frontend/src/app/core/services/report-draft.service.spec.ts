(globalThis as unknown as { structuredClone: (val: unknown) => unknown }).structuredClone = (val: unknown) => val;
import 'fake-indexeddb/auto';
import { TestBed } from '@angular/core/testing';
import { ReportDraftService } from './report-draft.service';

describe('ReportDraftService', () => {
  let service: ReportDraftService;

  beforeEach(async () => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(ReportDraftService);
    await service.clearDraft();
  });

  afterEach(async () => {
    await service.clearDraft();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should persist and restore draft including Blob', async () => {
    const fakeBlob = new Blob(['test content'], { type: 'text/plain' });
    await service.saveDraft({
      step: 2,
      title: 'Broken pipe',
      files: [fakeBlob]
    });

    const draft = await service.getDraft();
    expect(draft).toBeDefined();
    expect(draft?.step).toBe(2);
    expect(draft?.title).toBe('Broken pipe');
    expect(draft?.files.length).toBe(1);
    
    // Check blob contents
    const text = await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.readAsText(draft!.files[0]);
    });
    expect(text).toBe('test content');
  });

  it('should update existing draft without overwriting unspecified fields', async () => {
    await service.saveDraft({
      step: 1,
      title: 'Initial title',
      priority: 'high'
    });

    await service.saveDraft({
      step: 2,
      description: 'Some description'
    });

    const draft = await service.getDraft();
    expect(draft?.step).toBe(2);
    expect(draft?.title).toBe('Initial title');
    expect(draft?.priority).toBe('high');
    expect(draft?.description).toBe('Some description');
  });

  it('should clear draft', async () => {
    await service.saveDraft({ step: 1 });
    await service.clearDraft();
    const draft = await service.getDraft();
    expect(draft).toBeUndefined();
  });
});
