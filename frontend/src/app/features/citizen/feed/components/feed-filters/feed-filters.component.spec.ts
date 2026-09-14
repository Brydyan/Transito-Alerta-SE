import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FeedFiltersComponent } from './feed-filters.component';
import { IncidentCategoryService } from '../../../../catalogs/incident-categories/services/incident-category.service';
import { of } from 'rxjs';

describe('FeedFiltersComponent', () => {
  let component: FeedFiltersComponent;
  let fixture: ComponentFixture<FeedFiltersComponent>;
  let categoryServiceMock: { list: jest.Mock };

  beforeEach(async () => {
    categoryServiceMock = {
      list: jest.fn().mockReturnValue(of({
        items: [
          { id: 'cat-1', name: 'Root', parent_id: null },
          { id: 'cat-1-1', name: 'Child 1', parent_id: 'cat-1' },
          { id: 'cat-1-2', name: 'Child 2', parent_id: 'cat-1' }
        ],
        total: 3
      }))
    };

    await TestBed.configureTestingModule({
      imports: [FeedFiltersComponent],
      providers: [
        { provide: IncidentCategoryService, useValue: categoryServiceMock }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(FeedFiltersComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should build tree correctly', () => {
    expect(component.categoryNodes().length).toBe(1);
    expect(component.categoryNodes()[0].children.length).toBe(2);
  });

  it('should set parent indeterminate when only some children are selected', () => {
    const root = component.categoryNodes()[0];
    const child1 = root.children[0];
    
    // Select only first child
    component.toggleNode(child1);
    
    expect(child1.selected).toBe(true);
    expect(root.selected).toBe(false);
    expect(root.indeterminate).toBe(true);
  });

  it('should select parent when all children are selected', () => {
    const root = component.categoryNodes()[0];
    const child1 = root.children[0];
    const child2 = root.children[1];
    
    // Select first
    component.toggleNode(child1);
    // Select second
    component.toggleNode(child2);
    
    expect(child1.selected).toBe(true);
    expect(child2.selected).toBe(true);
    expect(root.selected).toBe(true);
    expect(root.indeterminate).toBe(false);
  });

  it('should select all children when parent is selected', () => {
    const root = component.categoryNodes()[0];
    
    component.toggleNode(root);
    
    expect(root.selected).toBe(true);
    expect(root.indeterminate).toBe(false);
    expect(root.children[0].selected).toBe(true);
    expect(root.children[1].selected).toBe(true);
  });
});
