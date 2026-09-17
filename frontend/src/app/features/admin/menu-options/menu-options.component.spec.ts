import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { MenuOptionsComponent } from './menu-options.component';

describe('MenuOptionsComponent', () => {
  let component: MenuOptionsComponent;
  let fixture: ComponentFixture<MenuOptionsComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [HttpClientTestingModule, MenuOptionsComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(MenuOptionsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('creates the component', () => {
    expect(component).toBeTruthy();
  });

  it('has no option selected initially', () => {
    expect(component.selectedOptionId()).toBeNull();
  });

  it('selects an option when tree emits selection', () => {
    component.onTreeSelect('a1');
    expect(component.selectedOptionId()).toBe('a1');
  });

  it('clears selection when "back" is triggered', () => {
    component.onTreeSelect('a1');
    expect(component.selectedOptionId()).toBe('a1');
    component.onBackToList();
    expect(component.selectedOptionId()).toBeNull();
  });

  it('sets form mode to create when tree emits create request', () => {
    component.onTreeCreate('parent-1');
    expect(component.isCreating()).toBe(true);
    expect(component.formParentId()).toBe('parent-1');
  });

  it('sets form mode to create at root when parentId is null', () => {
    component.onTreeCreate(null);
    expect(component.isCreating()).toBe(true);
    expect(component.formParentId()).toBeNull();
  });

  it('returns to list view after saving', () => {
    component.onTreeSelect('a1');
    component.onBackToList();
    expect(component.selectedOptionId()).toBeNull();
  });
});
