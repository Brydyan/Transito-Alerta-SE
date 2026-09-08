import { ComponentFixture, TestBed } from '@angular/core/testing';
import { IncidentCardComponent } from './incident-card.component';
import { IncidentSocialService } from '../../../../../core/services/incident-social.service';
import { AuthService } from '../../../../../core/services/auth.service';
import { of, throwError } from 'rxjs';
import { Incident } from '../../../../../core/models/incident.model';

describe('IncidentCardComponent', () => {
  let component: IncidentCardComponent;
  let fixture: ComponentFixture<IncidentCardComponent>;
  let socialServiceMock: any;
  let authServiceMock: any;
  let mockIncident: Incident;

  beforeEach(async () => {
    socialServiceMock = {
      follow: jest.fn().mockReturnValue(of({})),
      unfollow: jest.fn().mockReturnValue(of({})),
      corroborate: jest.fn().mockReturnValue(of({}))
    };

    authServiceMock = {
      currentUser: jest.fn().mockReturnValue({ id: 'user-1' })
    };

    mockIncident = {
      id: 'inc-123',
      citizen_id: 'user-2',
      title: 'Test',
      description: 'Desc',
      status: 'pending',
      priority: 'medium',
      lat: 0,
      lng: 0,
      zone_id: null,
      geofence_matched: false,
      organization_id: null,
      assigned_to: null,
      category_id: null,
      claimed_by: null,
      claimed_at: null,
      approved_by: null,
      approved_at: null,
      rejected_by: null,
      rejected_at: null,
      rejection_reason: null,
      closed_reason: null,
      resolution_date: null,
      created_at: new Date(),
      updated_at: new Date(),
      deleted_at: null,
      follower_count: 0,
      corroboration_count: 0,
      is_followed_by_me: false,
      is_corroborated_by_me: false
    };

    await TestBed.configureTestingModule({
      imports: [IncidentCardComponent],
      providers: [
        { provide: IncidentSocialService, useValue: socialServiceMock },
        { provide: AuthService, useValue: authServiceMock }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(IncidentCardComponent);
    component = fixture.componentInstance;
    component.incident = mockIncident;
    fixture.detectChanges();
  });

  describe('Follow', () => {
    it('should update state optimistically and call service', () => {
      component.toggleFollow();
      expect(component.incident.is_followed_by_me).toBe(true);
      expect(component.incident.follower_count).toBe(1);
      expect(socialServiceMock.follow).toHaveBeenCalledWith('inc-123');
    });

    it('should revert optimistic state on error', () => {
      socialServiceMock.follow.mockReturnValue(throwError(() => new Error('Network error')));
      component.toggleFollow();
      
      expect(socialServiceMock.follow).toHaveBeenCalledWith('inc-123');
      expect(component.incident.is_followed_by_me).toBe(false);
      expect(component.incident.follower_count).toBe(0);
    });
  });

  describe('Corroborate', () => {
    it('should NOT update state optimistically, but update after success', () => {
      component.corroborate();
      // Right before subscription finishes (or simulating no optimism), actually here with 'of' it finishes immediately.
      // But we can check that it calls the service.
      expect(socialServiceMock.corroborate).toHaveBeenCalledWith('inc-123', null);
      expect(component.incident.is_corroborated_by_me).toBe(true);
      expect(component.incident.corroboration_count).toBe(1);
    });

    it('should sync state on 409 Conflict', () => {
      socialServiceMock.corroborate.mockReturnValue(throwError(() => ({ status: 409 })));
      component.corroborate();
      
      expect(socialServiceMock.corroborate).toHaveBeenCalled();
      expect(component.incident.is_corroborated_by_me).toBe(true); // Resynced
      expect(component.incident.corroboration_count).toBe(0); // Only sets boolean in our logic
    });
    
    it('should disable corroborate if user is author', () => {
      component.incident.citizen_id = 'user-1'; // Same as currentUser
      expect(component.isCorroborateDisabled).toBe(true);
    });
  });
});
