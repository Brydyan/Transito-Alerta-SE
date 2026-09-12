import { ComponentFixture, TestBed } from '@angular/core/testing';
import { IncidentCardComponent } from './incident-card.component';
import { IncidentSocialService } from '../../../../../core/services/incident-social.service';
import { AuthService } from '../../../../../core/services/auth.service';
import { of, throwError } from 'rxjs';
import { Incident } from '../../../../../core/models/incident.model';

describe('IncidentCardComponent', () => {
  let component: IncidentCardComponent;
  let fixture: ComponentFixture<IncidentCardComponent>;
  let socialServiceMock: { follow: jest.Mock; unfollow: jest.Mock; corroborate: jest.Mock };
  let authServiceMock: { currentUser: jest.Mock };
  let mockIncident: Incident;

  // Stable timestamp for fixtures created mid-test: keeps `relativeAge`
  // deterministic across multiple detectChanges in the same test.
  const FIXED_CREATED_AT = new Date(Date.now() - 5 * 60_000);

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

  describe('Reverse geocoding cache (FIX-02)', () => {
    it('reuses a single fetch for the same coordinates', async () => {
      const fetchMock = jest.fn().mockResolvedValue({
        json: async () => ({ display_name: 'Barrio Test, Ciudad' }),
      });
      Object.defineProperty(window, 'fetch', {
        value: fetchMock,
        writable: true,
        configurable: true,
      });

      // Fresh fixture: set `incident` BEFORE the first `detectChanges`
      // (mutating a post-checked fixture triggers NG0100).
      const firstFixture = TestBed.createComponent(IncidentCardComponent);
      firstFixture.componentInstance.incident = {
        ...mockIncident,
        lat: -34.1,
        lng: -58.4,
        created_at: FIXED_CREATED_AT,
      };
      firstFixture.detectChanges();
      await Promise.resolve(); // let the in-flight fetch settle

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('nominatim.openstreetmap.org/reverse?lat=-34.1&lon=-58.4'),
      );

      // Re-run ngOnInit on the same component instance (same coordinates):
      // the second pass must hit the cache and NOT issue a new fetch.
      firstFixture.componentInstance.ngOnInit();
      await Promise.resolve();

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(firstFixture.componentInstance.locationName()).toBe('Barrio Test, Ciudad');
    });

    it('falls back to raw coordinates when Nominatim fails or rate-limits', async () => {
      Object.defineProperty(window, 'fetch', {
        value: jest.fn().mockRejectedValue(new Error('Rate limited')),
        writable: true,
        configurable: true,
      });

      // The paginated feed returns geom.coordinates, not flat lat/lng.
      const firstFixture = TestBed.createComponent(IncidentCardComponent);
      firstFixture.componentInstance.incident = {
        ...mockIncident,
        lat: 0,
        lng: 0,
        geom: { type: 'Point', coordinates: [-57.4, -35.1] },
        created_at: FIXED_CREATED_AT,
      } as Incident;
      firstFixture.detectChanges();
      await Promise.resolve();
      await Promise.resolve();

      // Fetch failed → locationName stays null, but the new getter
      // derives formatted coordinates from geom so the template never
      // shows a bare "," anymore.
      expect(firstFixture.componentInstance.locationName()).toBeNull();
      expect(firstFixture.componentInstance.locationText).toBe('-35.1000, -57.4000');
    });

    it('extracts parish and county from addressdetails', async () => {
      const fetchMock = jest.fn().mockResolvedValue({
        json: async () => ({
          display_name: 'Punta Carola, La Libertad, Santa Elena, EC',
          address: {
            parish: 'Punta Carola',
            county: 'La Libertad',
            state: 'Santa Elena',
          },
        }),
      });
      Object.defineProperty(window, 'fetch', {
        value: fetchMock,
        writable: true,
        configurable: true,
      });

      const firstFixture = TestBed.createComponent(IncidentCardComponent);
      firstFixture.componentInstance.incident = {
        ...mockIncident,
        lat: -2.22,
        lng: -80.86,
        created_at: FIXED_CREATED_AT,
      };
      firstFixture.detectChanges();
      await Promise.resolve();

      expect(firstFixture.componentInstance.locationName()).toBe('Punta Carola, La Libertad');
    });

    it('derives coordinates from geom when flat lat/lng are missing', async () => {
      const fetchMock = jest.fn().mockResolvedValue({
        json: async () => ({ display_name: 'Salinas, Ecuador' }),
      });
      Object.defineProperty(window, 'fetch', {
        value: fetchMock,
        writable: true,
        configurable: true,
      });

      const firstFixture = TestBed.createComponent(IncidentCardComponent);
      firstFixture.componentInstance.incident = {
        ...mockIncident,
        lat: 0,
        lng: 0,
        geom: { type: 'Point', coordinates: [-80.45, -2.20] },
        created_at: FIXED_CREATED_AT,
      } as Incident;
      firstFixture.detectChanges();
      await Promise.resolve();

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('lat=-2.2&lon=-80.45'),
      );
    });
  });
});
