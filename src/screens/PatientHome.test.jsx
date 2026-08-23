import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import PatientHome from './PatientHome';
import { ApiError, api as apiMock } from '../api/client';
import { routerFuture } from '../test/utils';

const navigate = vi.fn();
const handleAuthError = vi.fn(() => false);
let patient = { id: 'p1', name: 'Asha Menon', phoneNumber: '+919876543210' };

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

function renderHome() {
  const user = userEvent.setup();
  render(
    <MemoryRouter initialEntries={['/home']} future={routerFuture}>
      <Routes>
        <Route path="/home" element={<PatientHome />} />
        <Route path="/start" element={<p>Sign in screen</p>} />
      </Routes>
    </MemoryRouter>
  );
  return { user };
}

const NOW = new Date('2026-08-12T12:00:00Z');

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true, now: NOW });
  patient = { id: 'p1', name: 'Asha Menon', phoneNumber: '+919876543210' };
  navigate.mockReset();
  handleAuthError.mockReset();
  handleAuthError.mockReturnValue(false);
});

afterEach(() => {
  vi.useRealTimers();
});

/** ISO string for `secondsAgo` before the frozen clock. */
function ago(secondsAgo) {
  return new Date(NOW.getTime() - secondsAgo * 1000).toISOString();
}

const reviewed = (id, secondsAgo) => ({
  id,
  createdAt: ago(secondsAgo),
  aiRiskClassification: 'HIGH_RISK',
  doctorRiskClassification: 'MODERATE_RISK',
});

const unreviewed = (id, secondsAgo) => ({
  id,
  createdAt: ago(secondsAgo),
  aiRiskClassification: 'HIGH_RISK',
});

// Submitted, but the AI read has not come back yet. A real state: `AssessmentPending`
// handles exactly this, and it is what puts the rail on its third stage rather than
// its fourth.
const preAi = (id, secondsAgo) => ({ id, createdAt: ago(secondsAgo) });

/**
 * This screen used to be the signed-in half of `/`, so it carried no guard: the route
 * chose between it and the public landing page on exactly this condition, and redirecting
 * would have looped. It lives at `/home` now, and guards like every other patient screen.
 */
describe('access', () => {
  it('redirects a signed-out visitor to sign-in', () => {
    patient = null;

    renderHome();

    expect(screen.getByText('Sign in screen')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /start a new screening/i })).not.toBeInTheDocument();
  });

  it('does not call the assessments endpoint without a patient', () => {
    patient = null;

    renderHome();

    expect(apiMock.getPatientAssessments).not.toHaveBeenCalled();
  });
});

describe('starting a screening', () => {
  it('offers the start action even before assessments load', async () => {
    // Never resolves — the CTA must not be gated on the history request.
    apiMock.getPatientAssessments.mockReturnValue(new Promise(() => {}));
    const { user } = renderHome();

    await user.click(screen.getByRole('button', { name: /start a new screening/i }));
    expect(navigate).toHaveBeenCalledWith('/questionnaire');
  });

  it('survives the history request failing', async () => {
    apiMock.getPatientAssessments.mockRejectedValue(new Error('network down'));
    const { user } = renderHome();

    await screen.findByText(/couldn't load your screening history/i);
    await user.click(screen.getByRole('button', { name: /start a new screening/i }));
    expect(navigate).toHaveBeenCalledWith('/questionnaire');
  });

  it('retries the history request without a reload', async () => {
    apiMock.getPatientAssessments.mockRejectedValueOnce(new Error('network down'));
    apiMock.getPatientAssessments.mockResolvedValueOnce([reviewed('a1', 60)]);
    const { user } = renderHome();

    await user.click(await screen.findByRole('button', { name: /try again/i }));
    expect(await screen.findByText(/reviewed by doctor/i)).toBeInTheDocument();
  });
});

describe('greeting', () => {
  it('uses the patient first name', async () => {
    apiMock.getPatientAssessments.mockResolvedValue([]);
    renderHome();
    expect(await screen.findByRole('heading', { name: 'Hello, Asha' })).toBeInTheDocument();
  });

  it('falls back to a bare greeting when the name is missing', async () => {
    patient = { id: 'p1', phoneNumber: '+919876543210' };
    apiMock.getPatientAssessments.mockResolvedValue([]);
    renderHome();
    expect(await screen.findByRole('heading', { name: 'Hello' })).toBeInTheDocument();
  });
});

/**
 * The progress rail. It replaced a single amber card that said "with your dentist now" and
 * looked identical an hour after submitting and a week after submitting.
 *
 * <p>The stage states are derived, not fetched — no endpoint reports them. An assessment
 * record cannot exist before the answers and photos are in, because `PhotoUpload` is what
 * creates it, so the first two stages are complete whenever there is a record at all. The
 * last two read the two fields the list response already carries.
 */
describe('the screening rail', () => {
  function railStages() {
    return [...document.querySelectorAll('.patient-home__stage')].map((el) => ({
      label: el.querySelector('.patient-home__stage-label').textContent,
      when: el.querySelector('.patient-home__stage-when').textContent,
      done: el.classList.contains('is-done'),
      current: el.classList.contains('is-current'),
    }));
  }

  it('surfaces the newest unreviewed screening regardless of payload order', async () => {
    apiMock.getPatientAssessments.mockResolvedValue([
      unreviewed('old', 60 * 60 * 24 * 3),
      reviewed('reviewed', 60 * 60),
      unreviewed('newest', 60 * 30),
    ]);
    const { user } = renderHome();

    const rail = await screen.findByRole('region', { name: /progress of your latest screening/i });
    expect(within(rail).getByRole('heading', { name: /your screening from 30m ago/i })).toBeInTheDocument();

    await user.click(within(rail).getByRole('button', { name: /open/i }));
    expect(navigate).toHaveBeenCalledWith('/assessments/newest');
  });

  it('walks the four stages in order', async () => {
    apiMock.getPatientAssessments.mockResolvedValue([unreviewed('a1', 60 * 30)]);
    renderHome();
    await screen.findByRole('region', { name: /progress of your latest screening/i });

    expect(railStages().map((s) => s.label)).toEqual([
      'Answers received',
      'Photos processed',
      'Initial AI assessment',
      'Dentist review',
    ]);
  });

  it('stops on the dentist once the AI read is back', async () => {
    apiMock.getPatientAssessments.mockResolvedValue([unreviewed('a1', 60 * 30)]);
    renderHome();
    await screen.findByRole('region', { name: /progress of your latest screening/i });

    const stages = railStages();
    expect(stages.map((s) => s.done)).toEqual([true, true, true, false]);
    expect(stages[3].current).toBe(true);
    expect(stages[3].when).toBe('In progress');
  });

  it('stops on the AI read while it is still running', async () => {
    apiMock.getPatientAssessments.mockResolvedValue([preAi('a1', 60 * 30)]);
    renderHome();
    await screen.findByRole('region', { name: /progress of your latest screening/i });

    const stages = railStages();
    expect(stages.map((s) => s.done)).toEqual([true, true, false, false]);
    expect(stages[2].current).toBe(true);
    expect(stages[3].when).toBe('Not started');
  });

  /**
   * Only `createdAt` and `doctorReviewedAt` exist. The two middle stages report their state
   * in words rather than inventing a time for themselves — that is the one thing here that
   * would want a backend change, and this asserts we did not fake it in the meantime.
   */
  it('shows a real time only where the record carries one', async () => {
    apiMock.getPatientAssessments.mockResolvedValue([unreviewed('a1', 60 * 30)]);
    renderHome();
    await screen.findByRole('region', { name: /progress of your latest screening/i });

    expect(railStages().map((s) => s.when)).toEqual(['30m ago', 'Done', 'Done', 'In progress']);
  });

  it('makes no promise about when the dentist will get to it', async () => {
    apiMock.getPatientAssessments.mockResolvedValue([unreviewed('a1', 60 * 30)]);
    renderHome();
    const rail = await screen.findByRole('region', { name: /progress of your latest screening/i });

    expect(rail.textContent).not.toMatch(/hour|day|soon|shortly|within/i);
  });

  it('stays hidden when every screening has been reviewed', async () => {
    apiMock.getPatientAssessments.mockResolvedValue([reviewed('a1', 60)]);
    renderHome();

    await screen.findByText(/reviewed by doctor/i);
    expect(screen.queryByRole('region', { name: /progress of your latest screening/i })).not.toBeInTheDocument();
  });
});

describe('recent screenings', () => {
  it('shows the three newest, newest first', async () => {
    apiMock.getPatientAssessments.mockResolvedValue([
      reviewed('a3', 60 * 60 * 3),
      reviewed('a1', 30),
      reviewed('a4', 60 * 60 * 24 * 2),
      reviewed('a2', 60 * 30),
    ]);
    renderHome();

    await screen.findByText('Just now');
    const rows = screen.getAllByRole('button', { name: /reviewed by doctor/i });
    expect(rows).toHaveLength(3);
    expect(rows.map((row) => within(row).getByText(/ago|just now/i).textContent))
      .toEqual(['Just now', '30m ago', '3h ago']);
  });

  it('links to see-all only when there are more than three', async () => {
    apiMock.getPatientAssessments.mockResolvedValue([
      reviewed('a1', 60), reviewed('a2', 120), reviewed('a3', 180),
    ]);
    renderHome();

    expect(await screen.findAllByText(/reviewed by doctor/i)).toHaveLength(3);
    expect(screen.queryByRole('button', { name: /see all/i })).not.toBeInTheDocument();
  });

  it('offers see-all past three', async () => {
    apiMock.getPatientAssessments.mockResolvedValue([
      reviewed('a1', 60), reviewed('a2', 120), reviewed('a3', 180), reviewed('a4', 240),
    ]);
    const { user } = renderHome();

    await user.click(await screen.findByRole('button', { name: /see all 4/i }));
    expect(navigate).toHaveBeenCalledWith('/assessments');
  });

  it('keeps the AI risk tier off the landing screen', async () => {
    apiMock.getPatientAssessments.mockResolvedValue([unreviewed('a1', 60)]);
    renderHome();

    await screen.findAllByText(/awaiting doctor review/i);
    // The tier is a decision the patient opts into by opening the assessment, not
    // something the app hands them on open.
    expect(screen.queryByText(/^high$/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/not assessed/i)).not.toBeInTheDocument();
  });

  it('invites a first screening when there is no history', async () => {
    apiMock.getPatientAssessments.mockResolvedValue([]);
    renderHome();
    expect(await screen.findByText(/nothing here yet/i)).toBeInTheDocument();
  });

  it('accepts a wrapped payload', async () => {
    apiMock.getPatientAssessments.mockResolvedValue({ content: [reviewed('a1', 60)] });
    renderHome();
    expect(await screen.findByText(/reviewed by doctor/i)).toBeInTheDocument();
  });
});

describe('session recovery', () => {
  it('hands a 401 to the recovery hook instead of showing an error', async () => {
    handleAuthError.mockReturnValue(true);
    apiMock.getPatientAssessments.mockRejectedValue(new ApiError('Unauthorized', 401));
    renderHome();

    await waitFor(() => expect(handleAuthError).toHaveBeenCalled());
    expect(screen.queryByText(/couldn't load your screening history/i)).not.toBeInTheDocument();
  });
});
