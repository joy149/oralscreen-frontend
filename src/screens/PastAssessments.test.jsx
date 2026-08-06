import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import PastAssessments from './PastAssessments';
import { ApiError, api as apiMock } from '../api/client';
import { routerFuture } from '../test/utils';

const navigate = vi.fn();
const handleAuthError = vi.fn(() => false);
let patient = { id: 'p1', phoneNumber: '+919876543210' };

vi.mock('../api/client', async (importOriginal) => {
  const { mockApiModule } = await import('../test/apiMock.js');
  return mockApiModule(await importOriginal());
});

vi.mock('react-router-dom', async (importOriginal) => ({
  ...(await importOriginal()),
  useNavigate: () => navigate,
}));

vi.mock('../context/PatientContext', () => ({
  usePatient: () => ({ patient, setPatient: vi.fn(), clearPatient: vi.fn() }),
}));

vi.mock('../hooks/useSessionRecovery', () => ({ default: () => handleAuthError }));

function renderList() {
  const user = userEvent.setup();
  render(
    <MemoryRouter initialEntries={['/assessments']} future={routerFuture}>
      <Routes>
        <Route path="/assessments" element={<PastAssessments />} />
        <Route path="/" element={<p>Sign in screen</p>} />
      </Routes>
    </MemoryRouter>
  );
  return { user };
}

const NOW = new Date('2026-08-06T12:00:00Z');

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true, now: NOW });
  patient = { id: 'p1', phoneNumber: '+919876543210' };
  navigate.mockReset();
  handleAuthError.mockReturnValue(false);
});

afterEach(() => {
  vi.useRealTimers();
});

/** ISO string for `secondsAgo` before the frozen clock. */
function ago(secondsAgo) {
  return new Date(NOW.getTime() - secondsAgo * 1000).toISOString();
}

describe('access', () => {
  it('redirects a signed-out visitor to sign-in', () => {
    patient = null;

    renderList();

    expect(screen.getByText('Sign in screen')).toBeInTheDocument();
  });
});

describe('loading', () => {
  it('shows a skeleton list while fetching', () => {
    apiMock.getPatientAssessments.mockReturnValue(new Promise(() => {}));

    renderList();

    expect(screen.getByRole('status', { name: 'Loading past assessments' })).toBeInTheDocument();
  });

  it('requests the signed-in patient’s own assessments', async () => {
    apiMock.getPatientAssessments.mockResolvedValue([]);

    renderList();

    await waitFor(() => expect(apiMock.getPatientAssessments).toHaveBeenCalledWith('p1'));
  });
});

describe('the empty state', () => {
  it('invites the patient to start a screening', async () => {
    apiMock.getPatientAssessments.mockResolvedValue([]);
    const { user } = renderList();

    expect(await screen.findByRole('heading', { name: 'No assessments yet' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Start a screening' }));
    expect(navigate).toHaveBeenCalledWith('/questionnaire');
  });
});

describe('normalising the payload', () => {
  it.each(['content', 'assessments', 'data'])('unwraps a %s-wrapped page', async (key) => {
    apiMock.getPatientAssessments.mockResolvedValue({
      [key]: [{ id: 'a1', createdAt: ago(30), aiRiskClassification: 'HIGH_RISK' }],
    });

    renderList();

    expect(await screen.findByText('Just now')).toBeInTheDocument();
  });

  it('treats an unrecognised payload shape as empty rather than crashing', async () => {
    apiMock.getPatientAssessments.mockResolvedValue({ unexpected: 'shape' });

    renderList();

    expect(await screen.findByRole('heading', { name: 'No assessments yet' })).toBeInTheDocument();
  });

  it('treats a null payload as empty', async () => {
    apiMock.getPatientAssessments.mockResolvedValue(null);

    renderList();

    expect(await screen.findByRole('heading', { name: 'No assessments yet' })).toBeInTheDocument();
  });
});

describe('relative timestamps', () => {
  it.each([
    ['seconds ago', 30, 'Just now'],
    ['minutes ago', 60 * 5, '5m ago'],
    ['hours ago', 3600 * 3, '3h ago'],
    ['days ago', 86400 * 2, '2d ago'],
  ])('renders %s as "%s"', async (_label, secondsAgo, expected) => {
    apiMock.getPatientAssessments.mockResolvedValue([{ id: 'a1', createdAt: ago(secondsAgo) }]);

    renderList();

    expect(await screen.findByText(expected)).toBeInTheDocument();
  });

  it('switches to an absolute date beyond a week', async () => {
    apiMock.getPatientAssessments.mockResolvedValue([
      { id: 'a1', createdAt: '2026-01-15T09:00:00Z' },
    ]);

    renderList();

    expect(await screen.findByText('15 Jan 2026')).toBeInTheDocument();
  });

  it('says "Unknown date" for an unparseable timestamp', async () => {
    apiMock.getPatientAssessments.mockResolvedValue([{ id: 'a1', createdAt: 'not-a-date' }]);

    renderList();

    expect(await screen.findByText('Unknown date')).toBeInTheDocument();
  });

  it('never renders a negative age for a clock-skewed future timestamp', async () => {
    apiMock.getPatientAssessments.mockResolvedValue([{ id: 'a1', createdAt: ago(-600) }]);

    renderList();

    expect(await screen.findByText('Just now')).toBeInTheDocument();
  });
});

describe('the list', () => {
  it('marks a reviewed screening and one still awaiting review', async () => {
    apiMock.getPatientAssessments.mockResolvedValue([
      {
        id: 'a1',
        createdAt: ago(60 * 10),
        aiRiskClassification: 'HIGH_RISK',
        doctorRiskClassification: 'MODERATE_RISK',
      },
      { id: 'a2', createdAt: ago(60 * 20), aiRiskClassification: 'NO_MILD_RISK' },
    ]);

    renderList();

    expect(await screen.findByText('Reviewed by doctor')).toBeInTheDocument();
    expect(screen.getByText('Awaiting doctor review')).toBeInTheDocument();
  });

  it('shows the AI risk tier for each row', async () => {
    apiMock.getPatientAssessments.mockResolvedValue([
      { id: 'a1', createdAt: ago(60), aiRiskClassification: 'HIGH_RISK' },
    ]);

    renderList();

    expect(await screen.findByText('High')).toBeInTheDocument();
  });

  it('opens the detail screen for the row that was tapped', async () => {
    apiMock.getPatientAssessments.mockResolvedValue([
      { id: 'a1', createdAt: ago(60) },
      { id: 'a2', createdAt: ago(120) },
    ]);
    const { user } = renderList();

    const rows = await screen.findAllByRole('button', { name: /ago/ });
    await user.click(rows[1]);

    expect(navigate).toHaveBeenCalledWith('/assessments/a2');
  });
});

describe('when the fetch fails', () => {
  it('offers a retry that reloads the list', async () => {
    apiMock.getPatientAssessments.mockRejectedValueOnce(new ApiError('boom', 500, null));
    const { user } = renderList();

    expect(await screen.findByRole('heading', { name: 'Assessments unavailable' })).toBeInTheDocument();

    apiMock.getPatientAssessments.mockResolvedValue([{ id: 'a1', createdAt: ago(30) }]);
    await user.click(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByText('Just now')).toBeInTheDocument();
  });

  it('hands an expired session to the recovery hook instead of showing an error', async () => {
    handleAuthError.mockReturnValue(true);
    apiMock.getPatientAssessments.mockRejectedValue(new ApiError('Unauthorized', 401, null));

    renderList();

    await waitFor(() => expect(handleAuthError).toHaveBeenCalled());
    expect(screen.queryByRole('heading', { name: 'Assessments unavailable' })).not.toBeInTheDocument();
  });
});
