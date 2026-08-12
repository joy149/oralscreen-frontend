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
    <MemoryRouter initialEntries={['/']} future={routerFuture}>
      <Routes>
        <Route path="/" element={<PatientHome />} />
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

describe('awaiting review', () => {
  it('surfaces the newest unreviewed screening regardless of payload order', async () => {
    apiMock.getPatientAssessments.mockResolvedValue([
      unreviewed('old', 60 * 60 * 24 * 3),
      reviewed('reviewed', 60 * 60),
      unreviewed('newest', 60 * 30),
    ]);
    const { user } = renderHome();

    const card = await screen.findByRole('button', { name: /with your dentist now/i });
    expect(within(card).getByText(/submitted 30m ago/i)).toBeInTheDocument();

    await user.click(card);
    expect(navigate).toHaveBeenCalledWith('/assessments/newest');
  });

  it('stays hidden when every screening has been reviewed', async () => {
    apiMock.getPatientAssessments.mockResolvedValue([reviewed('a1', 60)]);
    renderHome();

    await screen.findByText(/reviewed by doctor/i);
    expect(screen.queryByText(/with your dentist now/i)).not.toBeInTheDocument();
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
