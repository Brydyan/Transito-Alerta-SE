const mockHttp = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
}));

vi.mock('../../../core/http.service.js', () => ({
  http: mockHttp,
}));

const assignedIncident = {
  id: 11,
  title: 'Semáforo sin energía',
  status: 'in_progress',
  priority: 'high',
  created_at: '2026-07-26T12:00:00.000Z',
  location: { id: 4, path: 'Ecuador > Santa Elena' },
  distance_km: 1.25,
};

const nearbyIncident = {
  id: 12,
  title: 'Luminaria averiada',
  status: 'pending',
  created_at: '2026-07-26T13:00:00.000Z',
  location: { id: 4, path: 'Ecuador > Santa Elena' },
  distance_km: 0.48,
};

function response(overrides = {}) {
  return {
    has_recent_location: true,
    nearby_radius_km: 10,
    assigned_incidents: {
      data: [assignedIncident],
      meta: {
        current_page: 1,
        last_page: 1,
        per_page: 10,
        total: 1,
      },
    },
    nearby_recommendations: [nearbyIncident],
    summary_counts: {
      total_assigned: 1,
      by_status: { pending: 0, in_progress: 1, resolved: 0 },
      average_resolution_time: { days: 1, hours: 3, seconds: 97200 },
    },
    filter_options: {
      locations: [{ id: 4, path: 'Ecuador > Santa Elena' }],
    },
    ...overrides,
  };
}

describe('operator dashboard', () => {
  let component;

  beforeAll(async () => {
    component = (await import('./operator-dashboard.component.js')).default;
  });

  beforeEach(() => {
    vi.clearAllMocks();
    window.location.hash = '';
    document.body.innerHTML = component.template;
    mockHttp.get.mockResolvedValue(response());
    mockHttp.post.mockResolvedValue({ status: 'success' });
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: {
        getCurrentPosition: vi.fn(),
      },
    });
  });

  afterEach(() => {
    component.onDestroy();
  });

  it('renders translated summary, assigned incidents, and nearby recommendations', async () => {
    await component.onInit();

    expect(mockHttp.get).toHaveBeenCalledWith(
      '/operator/dashboard?page=1&per_page=10',
    );
    expect(document.getElementById('operator-stat-assigned').textContent).toBe(
      '1',
    );
    expect(document.getElementById('operator-stat-average').textContent).toBe(
      '1 d 3 h',
    );
    expect(
      document.getElementById('operator-assigned-list').textContent,
    ).toContain('Semáforo sin energía');
    expect(
      document.getElementById('operator-nearby-list').textContent,
    ).toContain('Luminaria averiada');
    expect(
      document.getElementById('operator-assigned-list').textContent,
    ).toContain('Abrir');
  });

  it('shows the GPS prompt and nearby empty state when no recent position exists', async () => {
    mockHttp.get.mockResolvedValue(
      response({
        has_recent_location: false,
        nearby_recommendations: [],
      }),
    );

    await component.onInit();

    expect(
      document.getElementById('operator-dashboard-gps-prompt').hidden,
    ).toBe(false);
    expect(
      document.getElementById('operator-nearby-empty-title').textContent,
    ).toBe('Necesitamos una ubicación reciente');
  });

  it('shows an error state and retries the dashboard request', async () => {
    mockHttp.get
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValueOnce(response());

    await component.onInit();

    expect(document.getElementById('operator-dashboard-error').hidden).toBe(
      false,
    );
    document.getElementById('operator-dashboard-retry').click();

    await vi.waitFor(() => {
      expect(mockHttp.get).toHaveBeenCalledTimes(2);
      expect(document.getElementById('operator-dashboard-content').hidden).toBe(
        false,
      );
    });
  });

  it('updates the operator location and refreshes nearby recommendations', async () => {
    mockHttp.get
      .mockResolvedValueOnce(
        response({ has_recent_location: false, nearby_recommendations: [] }),
      )
      .mockResolvedValueOnce(response());
    navigator.geolocation.getCurrentPosition.mockImplementation((success) => {
      success({ coords: { latitude: -2.2267, longitude: -80.8587 } });
    });

    await component.onInit();
    document.getElementById('operator-location-enable').click();

    await vi.waitFor(() => {
      expect(mockHttp.post).toHaveBeenCalledWith('/operator/location', {
        lat: -2.2267,
        lng: -80.8587,
      });
      expect(mockHttp.get).toHaveBeenCalledTimes(2);
      expect(
        document.getElementById('operator-dashboard-gps-prompt').hidden,
      ).toBe(true);
    });
  });
});
