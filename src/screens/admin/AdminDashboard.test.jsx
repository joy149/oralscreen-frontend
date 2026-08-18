import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AdminDashboard from './AdminDashboard';
import { ApiError, api as apiMock } from '../../api/client';
import { ToastProvider } from '../../components/shared/Toast';
import { routerFuture } from '../../test/utils';

const navigate = vi.fn();

vi.mock('../../api/client', async (importOriginal) => {
  const { mockApiModule } = await import('../../test/apiMock.js');
  return mockApiModule(await importOriginal());
});

vi.mock('react-router-dom', async (importOriginal) => ({
  ...(await importOriginal()),
  useNavigate: () => navigate,
}));

// chart.js needs a real canvas; jsdom has none. The charts are rendered as identifiable
// stubs so the tests can assert *which* chart appears and what data it was handed,
// without exercising chart.js itself.
vi.mock('react-chartjs-2', () => ({
  Line: ({ data }) => <div data-testid="line-chart" data-chart={JSON.stringify(data)} />,
  Doughnut: ({ data }) => <div data-testid="doughnut-chart" data-chart={JSON.stringify(data)} />,
}));

const KEY_STORAGE = 'oralscreen.adminKey';

const DOCTORS = [
  {
    id: 'd1',
    name: 'Dr Asha Rao',
    phoneNumber: '+919876543210',
    registrationId: 'MCI-1234',
    createdAt: '2026-07-01T09:30:00Z',
  },
  { id: 'd2', name: 'Bala', registrationId: 'MCI-9999' },
];

const METRICS = {
  dailyVolume: [
    { date: '2026-08-03', count: 4 },
    { date: '2026-08-04', count: 7 },
  ],
  riskDistribution: { NO_MILD_RISK: 5, MODERATE_RISK: 3, HIGH_RISK: 2 },
  averageReviewMinutes: 42,
  pendingReview: 3,
  totalAssessments: 10,
};

function renderAdmin() {
  const user = userEvent.setup();
  render(
    <MemoryRouter initialEntries={['/doctor/admin']} future={routerFuture}>
      <ToastProvider>
        <Routes>
          <Route path="/doctor/admin" element={<AdminDashboard />} />
        </Routes>
      </ToastProvider>
    </MemoryRouter>
  );
  return { user };
}

/** Renders with the console already unlocked. */
function renderUnlocked() {
  sessionStorage.setItem(KEY_STORAGE, 'secret-key');
  return renderAdmin();
}

function chartData(testId) {
  return JSON.parse(screen.getByTestId(testId).dataset.chart);
}

beforeEach(() => {
  navigate.mockReset();
  apiMock.getPendingDoctors.mockResolvedValue(DOCTORS);
  apiMock.getAdminMetrics.mockResolvedValue(METRICS);
  apiMock.approveDoctor.mockResolvedValue({});
});

describe('the key gate', () => {
  it('reveals nothing until a key is supplied', () => {
    renderAdmin();

    expect(screen.getByRole('heading', { name: 'Admin key required' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Pending Doctors' })).not.toBeInTheDocument();
    expect(apiMock.getPendingDoctors).not.toHaveBeenCalled();
    expect(apiMock.getAdminMetrics).not.toHaveBeenCalled();
  });

  it('masks the key field', () => {
    renderAdmin();

    expect(screen.getByLabelText('Admin API key')).toHaveAttribute('type', 'password');
  });

  it('holds Unlock until something is typed', async () => {
    const { user } = renderAdmin();

    expect(screen.getByRole('button', { name: 'Unlock' })).toBeDisabled();

    await user.type(screen.getByLabelText('Admin API key'), 'secret-key');
    expect(screen.getByRole('button', { name: 'Unlock' })).toBeEnabled();
  });

  it('rejects a whitespace-only key', async () => {
    const { user } = renderAdmin();

    await user.type(screen.getByLabelText('Admin API key'), '   ');

    expect(screen.getByRole('button', { name: 'Unlock' })).toBeDisabled();
  });

  it('unlocks, loads the queue and keeps the key only for this tab', async () => {
    const { user } = renderAdmin();

    await user.type(screen.getByLabelText('Admin API key'), '  secret-key  ');
    await user.click(screen.getByRole('button', { name: 'Unlock' }));

    expect(await screen.findByRole('heading', { name: 'Pending Doctors' })).toBeInTheDocument();
    expect(apiMock.getPendingDoctors).toHaveBeenCalledWith('secret-key');

    // sessionStorage, never localStorage — the key must die with the tab.
    expect(sessionStorage.getItem(KEY_STORAGE)).toBe('secret-key');
    expect(localStorage.getItem(KEY_STORAGE)).toBeNull();
  });

  it('restores a key already held for this tab', async () => {
    renderUnlocked();

    expect(await screen.findByRole('heading', { name: 'Pending Doctors' })).toBeInTheDocument();
    expect(apiMock.getPendingDoctors).toHaveBeenCalledWith('secret-key');
  });

  it('locks the console again, clearing the stored key', async () => {
    const { user } = renderUnlocked();
    await screen.findByRole('heading', { name: 'Pending Doctors' });

    await user.click(screen.getByRole('button', { name: 'Lock console' }));

    expect(screen.getByRole('heading', { name: 'Admin key required' })).toBeInTheDocument();
    expect(sessionStorage.getItem(KEY_STORAGE)).toBeNull();
  });

  it('offers no lock control before unlocking', () => {
    renderAdmin();

    expect(screen.queryByRole('button', { name: 'Lock console' })).not.toBeInTheDocument();
  });

  it.each([401, 403])('drops a key the server rejects with %i and shows its message', async (status) => {
    apiMock.getPendingDoctors.mockRejectedValue(new ApiError('That key was rejected.', status, null));

    renderUnlocked();

    expect(await screen.findByText('That key was rejected.')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Admin key required' })).toBeInTheDocument();
    expect(sessionStorage.getItem(KEY_STORAGE)).toBeNull();
  });

  it('falls back to generic copy for a rejection with no message', async () => {
    apiMock.getPendingDoctors.mockRejectedValue(new ApiError('', 401, null));

    renderUnlocked();

    expect(await screen.findByText('That key was rejected.')).toBeInTheDocument();
  });

  it('keeps the key for a server-side failure and shows the message as a page error', async () => {
    apiMock.getPendingDoctors.mockRejectedValue(
      new ApiError('ADMIN_API_KEY is not configured', 503, null)
    );

    renderUnlocked();

    expect(
      await screen.findByRole('heading', { name: 'Could not fetch pending doctors' })
    ).toBeInTheDocument();
    expect(screen.getByText('ADMIN_API_KEY is not configured')).toBeInTheDocument();
    expect(sessionStorage.getItem(KEY_STORAGE)).toBe('secret-key');
  });

  it('shows generic copy for a non-ApiError failure', async () => {
    apiMock.getPendingDoctors.mockRejectedValue(new TypeError('Failed to fetch'));

    renderUnlocked();

    expect(await screen.findByText('Failed to connect to backend server.')).toBeInTheDocument();
  });

  it('navigates home from the brand', async () => {
    const { user } = renderAdmin();

    await user.click(screen.getByRole('button', { name: /OralScreen/ }));

    expect(navigate).toHaveBeenCalledWith('/');
  });
});

describe('the pending doctor list', () => {
  it('shows each doctor with their contact and registration details', async () => {
    renderUnlocked();

    expect(await screen.findByRole('heading', { name: 'Dr Asha Rao' })).toBeInTheDocument();
    expect(screen.getByText('+919876543210')).toBeInTheDocument();
    expect(screen.getByText('MCI-1234')).toBeInTheDocument();
    expect(screen.getByText('1 Jul 2026, 03:00 pm')).toBeInTheDocument();
  });

  it('counts the pending requests, pluralising correctly', async () => {
    renderUnlocked();

    expect(await screen.findByText('2 Pending Requests')).toBeInTheDocument();
  });

  it('uses the singular for one request', async () => {
    apiMock.getPendingDoctors.mockResolvedValue([DOCTORS[0]]);

    renderUnlocked();

    expect(await screen.findByText('1 Pending Request')).toBeInTheDocument();
  });

  it('falls back to N/A for missing contact details', async () => {
    renderUnlocked();

    await screen.findByRole('heading', { name: 'Bala' });
    const card = screen.getByRole('heading', { name: 'Bala' }).closest('.admin-doctor-card');
    expect(within(card).getAllByText('N/A')).toHaveLength(2); // phone and registration date
  });

  it('names an unnamed doctor', async () => {
    apiMock.getPendingDoctors.mockResolvedValue([{ id: 'd3', registrationId: 'MCI-1' }]);

    renderUnlocked();

    expect(await screen.findByRole('heading', { name: 'Unnamed Doctor' })).toBeInTheDocument();
  });

  it.each([
    ['Dr Asha Rao', 'AR'],
    ['Dr. Asha Rao', 'AR'],
    ['Bala', 'BA'],
    ['', 'DR'],
  ])('renders initials for "%s" as %s', async (name, initials) => {
    apiMock.getPendingDoctors.mockResolvedValue([{ id: 'd1', name }]);

    renderUnlocked();

    expect(await screen.findByText(initials)).toBeInTheDocument();
  });

  it('renders an unparseable registration date as given rather than "Invalid Date"', async () => {
    apiMock.getPendingDoctors.mockResolvedValue([{ id: 'd1', createdAt: 'sometime' }]);

    renderUnlocked();

    expect(await screen.findByText('sometime')).toBeInTheDocument();
  });

  it.each(['content', 'doctors', 'data', 'items'])('unwraps a %s-wrapped page', async (key) => {
    apiMock.getPendingDoctors.mockResolvedValue({ [key]: DOCTORS });

    renderUnlocked();

    expect(await screen.findByRole('heading', { name: 'Dr Asha Rao' })).toBeInTheDocument();
  });

  it('treats an unrecognised payload shape as an empty queue', async () => {
    apiMock.getPendingDoctors.mockResolvedValue({ nope: true });

    renderUnlocked();

    expect(await screen.findByRole('heading', { name: 'All Caught Up!' })).toBeInTheDocument();
  });

  it('shows a skeleton while loading', () => {
    apiMock.getPendingDoctors.mockReturnValue(new Promise(() => {}));

    renderUnlocked();

    expect(screen.getByRole('status', { name: 'Loading screening cases' })).toBeInTheDocument();
  });

  it('refreshes on demand', async () => {
    const { user } = renderUnlocked();
    await screen.findByRole('heading', { name: 'Dr Asha Rao' });

    apiMock.getPendingDoctors.mockResolvedValue([]);
    await user.click(screen.getByRole('button', { name: 'Refresh doctor list' }));

    expect(await screen.findByRole('heading', { name: 'All Caught Up!' })).toBeInTheDocument();
  });

  it('retries after a failed load', async () => {
    apiMock.getPendingDoctors.mockRejectedValueOnce(new ApiError('boom', 500, null));
    const { user } = renderUnlocked();

    await screen.findByRole('heading', { name: 'Could not fetch pending doctors' });

    apiMock.getPendingDoctors.mockResolvedValue(DOCTORS);
    await user.click(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByRole('heading', { name: 'Dr Asha Rao' })).toBeInTheDocument();
  });
});

describe('approving a doctor', () => {
  it('approves with the typed key and drops the card from the list', async () => {
    const { user } = renderUnlocked();
    await screen.findByRole('heading', { name: 'Dr Asha Rao' });

    await user.click(screen.getByRole('button', { name: 'Approve Dr Asha Rao' }));

    await waitFor(() => expect(apiMock.approveDoctor).toHaveBeenCalledWith('d1', 'secret-key'));
    expect(await screen.findByText('Approved Dr Asha Rao')).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.queryByRole('heading', { name: 'Dr Asha Rao' })).not.toBeInTheDocument()
    );
    expect(screen.getByRole('heading', { name: 'Bala' })).toBeInTheDocument();
  });

  it('shows a per-card approving state and blocks a second click', async () => {
    let resolveApprove;
    apiMock.approveDoctor.mockReturnValue(new Promise((r) => { resolveApprove = r; }));
    const { user } = renderUnlocked();
    await screen.findByRole('heading', { name: 'Dr Asha Rao' });

    await user.click(screen.getByRole('button', { name: 'Approve Dr Asha Rao' }));

    const button = await screen.findByRole('button', { name: 'Approve Dr Asha Rao' });
    expect(button).toBeDisabled();
    expect(button).toHaveTextContent('Approving...');
    // The other card stays actionable.
    expect(screen.getByRole('button', { name: 'Approve Bala' })).toBeEnabled();

    resolveApprove({});
    await waitFor(() => expect(apiMock.approveDoctor).toHaveBeenCalledTimes(1));
  });

  it('surfaces the server message when approval fails, keeping the card', async () => {
    apiMock.approveDoctor.mockRejectedValue(new ApiError('Doctor already approved', 409, null));
    const { user } = renderUnlocked();
    await screen.findByRole('heading', { name: 'Dr Asha Rao' });

    await user.click(screen.getByRole('button', { name: 'Approve Dr Asha Rao' }));

    expect(await screen.findByText('Doctor already approved')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Dr Asha Rao' })).toBeInTheDocument();
  });

  it('shows generic copy for a non-ApiError failure', async () => {
    apiMock.approveDoctor.mockRejectedValue(new TypeError('Failed to fetch'));
    const { user } = renderUnlocked();
    await screen.findByRole('heading', { name: 'Dr Asha Rao' });

    await user.click(screen.getByRole('button', { name: 'Approve Dr Asha Rao' }));

    expect(await screen.findByText('Failed to approve doctor')).toBeInTheDocument();
  });

  it('does nothing for a record with no id', async () => {
    apiMock.getPendingDoctors.mockResolvedValue([{ name: 'No Id', registrationId: 'MCI-1' }]);
    const { user } = renderUnlocked();
    await screen.findByRole('heading', { name: 'No Id' });

    await user.click(screen.getByRole('button', { name: 'Approve No Id' }));

    expect(apiMock.approveDoctor).not.toHaveBeenCalled();
  });
});

describe('the analytics panel', () => {
  it('plots the daily volume with weekday labels', async () => {
    renderUnlocked();

    await waitFor(() => expect(screen.getByTestId('line-chart')).toBeInTheDocument());
    const data = chartData('line-chart');
    expect(data.labels).toEqual(['Mon', 'Tue']);
    expect(data.datasets[0].data).toEqual([4, 7]);
  });

  it('leaves an unparseable date as-is rather than showing "Invalid Date"', async () => {
    apiMock.getAdminMetrics.mockResolvedValue({
      ...METRICS,
      dailyVolume: [{ date: 'not-a-date', count: 3 }],
    });

    renderUnlocked();

    await waitFor(() => expect(chartData('line-chart').labels).toEqual(['not-a-date']));
  });

  it('breaks down risk with the tiers the payload actually carries', async () => {
    renderUnlocked();

    await waitFor(() => expect(screen.getByTestId('doughnut-chart')).toBeInTheDocument());
    const data = chartData('doughnut-chart');
    expect(data.labels).toEqual(['No / mild risk', 'Moderate risk', 'High risk']);
    expect(data.datasets[0].data).toEqual([5, 3, 2]);
  });

  it('omits a tier the payload does not mention', async () => {
    apiMock.getAdminMetrics.mockResolvedValue({
      ...METRICS,
      riskDistribution: { HIGH_RISK: 2 },
    });

    renderUnlocked();

    await waitFor(() => expect(chartData('doughnut-chart').labels).toEqual(['High risk']));
  });

  it.each([
    [42, '42 min'],
    [90, '1.5 hr'],
    [60 * 36, '1.5 days'],
  ])('formats %i average review minutes as "%s"', async (minutes, expected) => {
    apiMock.getAdminMetrics.mockResolvedValue({ ...METRICS, averageReviewMinutes: minutes });

    renderUnlocked();

    expect(await screen.findByText(expected)).toBeInTheDocument();
  });

  it('shows the review backlog', async () => {
    renderUnlocked();

    expect(await screen.findByText('3 of 10 awaiting review')).toBeInTheDocument();
  });

  it('says there is nothing to show rather than inventing numbers', async () => {
    apiMock.getAdminMetrics.mockResolvedValue({
      dailyVolume: [{ date: '2026-08-03', count: 0 }],
      riskDistribution: { HIGH_RISK: 0 },
      averageReviewMinutes: null,
    });

    renderUnlocked();

    expect(await screen.findByText('No screenings in the last 7 days')).toBeInTheDocument();
    expect(screen.getByText('No assessments yet')).toBeInTheDocument();
    expect(screen.getByText('No reviewed screenings yet')).toBeInTheDocument();
    expect(screen.queryByTestId('line-chart')).not.toBeInTheDocument();
  });

  it('marks the charts unavailable when the metrics call fails', async () => {
    apiMock.getAdminMetrics.mockRejectedValue(new ApiError('boom', 500, null));

    renderUnlocked();

    expect(await screen.findAllByText('Metrics unavailable')).toHaveLength(2);
  });

  it('still shows the approval queue when metrics are down', async () => {
    apiMock.getAdminMetrics.mockRejectedValue(new ApiError('boom', 500, null));

    renderUnlocked();

    // Metrics are decorative next to doctors waiting for approval — an outage in one
    // must not hide the other.
    expect(await screen.findByRole('heading', { name: 'Dr Asha Rao' })).toBeInTheDocument();
  });
});
