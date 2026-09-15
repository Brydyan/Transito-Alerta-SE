import { ComponentFixture, TestBed } from '@angular/core/testing';
import { EndpointPickerComponent } from './endpoint-picker.component';

describe('EndpointPickerComponent', () => {
  let component: EndpointPickerComponent;
  let fixture: ComponentFixture<EndpointPickerComponent>;

  const mockAvailable = [
    { id: 'e1', method: 'GET', path: '/api/users', description: 'List users' },
    { id: 'e2', method: 'POST', path: '/api/users', description: 'Create user' },
    { id: 'e3', method: 'GET', path: '/api/incidents', description: 'List incidents' },
    { id: 'e4', method: 'DELETE', path: '/api/users/:id', description: 'Delete user' },
  ];

  const mockAssigned = [
    { id: 'e1', method: 'GET', path: '/api/users', description: 'List users' },
  ];

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [EndpointPickerComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(EndpointPickerComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('availableEndpoints', mockAvailable);
    fixture.componentRef.setInput('assignedEndpoints', mockAssigned);
    fixture.detectChanges();
  });

  it('renders available endpoints excluding assigned ones', () => {
    const items = component.filteredAvailable();
    expect(items.length).toBe(3);
    expect(items.map((e) => e.id)).not.toContain('e1');
  });

  it('renders assigned endpoints', () => {
    const items = component.filteredAssigned();
    expect(items.length).toBe(1);
    expect(items[0].id).toBe('e1');
  });

  it('filters available endpoints by search query', () => {
    component.availableSearch.set('users');
    const items = component.filteredAvailable();
    expect(items.length).toBe(2); // POST /api/users + DELETE /api/users/:id
  });

  it('filters assigned endpoints by search query', () => {
    component.assignedSearch.set('users');
    const items = component.filteredAssigned();
    expect(items.length).toBe(1);
  });

  it('moves an endpoint from available to assigned', () => {
    let emitted: string[] | null = null;
    component.assignedChange.subscribe((ids) => (emitted = ids));

    component.moveToAssigned('e2');
    expect(emitted).toEqual(['e1', 'e2']);
  });

  it('moves an endpoint from assigned to available', () => {
    let emitted: string[] | null = null;
    component.assignedChange.subscribe((ids) => (emitted = ids));

    component.moveToAvailable('e1');
    expect(emitted).toEqual([]);
  });

  it('does not duplicate when moving already-assigned endpoint', () => {
    let emitted: string[] | null = null;
    component.assignedChange.subscribe((ids) => (emitted = ids));

    component.moveToAssigned('e1'); // already assigned — no-op, no emission
    expect(emitted).toBeNull();
  });

  it('shows assigned count', () => {
    expect(component.assignedCount()).toBe(1);
  });

  it('moves all filtered available to assigned', () => {
    component.availableSearch.set('user');
    let emitted: string[] | null = null;
    component.assignedChange.subscribe((ids) => (emitted = ids));

    component.moveAllToAssigned();
    // e2 (POST /users) and e4 (DELETE /users/:id) + existing e1
    expect(emitted?.length).toBe(3);
  });

  it('moves all assigned to available', () => {
    let emitted: string[] | null = null;
    component.assignedChange.subscribe((ids) => (emitted = ids));

    component.moveAllToAvailable();
    expect(emitted).toEqual([]);
  });
});
