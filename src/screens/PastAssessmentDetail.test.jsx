import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import PastAssessmentDetail from './PastAssessmentDetail';
import { ApiError, api as apiMock } from '../api/client';
import { routerFuture } from '../test/utils';

const handleAuthError = vi.fn(() => false);
let patient = { id: 'p1' };

vi.mock('../api/client', async (importOriginal) => {
  const { mockApiModule } = await import('../test/apiMock.js');
  return mockApiModule(await importOriginal());
});

vi.mock('../context/PatientContext', () => ({
  usePatient: () => ({ patient, setPatient: vi.fn(), clearPatient: vi.fn() }),
}));

vi.mock('../hooks/useSessionRecovery', () => ({ default: () => handleAuthError }));

function renderDetail(id = 'a1') {
  const user = userEvent.setup();
  render(
    <MemoryRouter initialEntries={[`/assessments/${id}`]} future={routerFuture}>
      <Routes>
        <Route path="/assessments/:assessmentId" element={<PastAssessmentDetail />} />
        <Route path="/" element={<p>Sign in screen</p>} />
      </Routes>
    </MemoryRouter>
  );
  return { user };
}

const REVIEWED = {
  id: 'a1',
  createdAt: '2026-07-01T09:00:00Z',
  aiRiskClassification: 'MODERATE_RISK',
  patientFacingSummary: 'A small white patch was seen on the left cheek.',
  recommendedSpecialistDisplayName: 'Oral Medicine',
  homeCareRecommendations: 'Brush twice daily and avoid tobacco.',
  doctorRiskClassification: 'HIGH_RISK',
  reviewedByDoctorName: 'Dr Rao',
  doctorReviewedAt: '2026-07-03T09:00:00Z',
  doctorNotes: 'Please attend the clinic within a week.',
};

beforeEach(() => {
  patient = { id: 'p1' };
  handleAuthError.mockReturnValue(false);
});

describe('access', () => {
  it('redirects a signed-out visitor to sign-in', () => {
    patient = null;

    renderDetail();

    expect(screen.getByText('Sign in screen')).toBeInTheDocument();
  });
});

describe('loading', () => {
  it('shows a skeleton while fetching', () => {
    apiMock.getAssessment.mockReturnValue(new Promise(() => {}));

    renderDetail();

    expect(screen.getByRole('status', { name: 'Loading assessment' })).toBeInTheDocument();
  });

  it('fetches the assessment named in the route', async () => {
    apiMock.getAssessment.mockResolvedValue(REVIEWED);

    renderDetail('a-42');

    await waitFor(() => expect(apiMock.getAssessment).toHaveBeenCalledWith('a-42'));
  });
});

describe('a fully reviewed assessment', () => {
  beforeEach(() => {
    apiMock.getAssessment.mockResolvedValue(REVIEWED);
  });

  it('shows the screening date and the AI risk tier', async () => {
    renderDetail();

    expect(await screen.findByText('1 July 2026')).toBeInTheDocument();
    expect(screen.getByText('Moderate')).toBeInTheDocument();
  });

  it('shows the patient-facing summary and suggested specialist', async () => {
    renderDetail();

    expect(await screen.findByText(/A small white patch/)).toBeInTheDocument();
    expect(screen.getByText('Oral Medicine')).toBeInTheDocument();
  });

  it('shows the home-care section', async () => {
    renderDetail();

    expect(await screen.findByRole('heading', { name: 'Home care recommendations' })).toBeInTheDocument();
    expect(screen.getByText('Brush twice daily and avoid tobacco.')).toBeInTheDocument();
  });

  it("shows the doctor's verdict, name, review date and notes", async () => {
    renderDetail();

    expect(await screen.findByText('Dr Rao')).toBeInTheDocument();
    expect(screen.getByText('High')).toBeInTheDocument();
    expect(screen.getByText('3 July 2026')).toBeInTheDocument();
    expect(screen.getByText('Please attend the clinic within a week.')).toBeInTheDocument();
  });
});

describe('gaps in the payload', () => {
  it('falls back when no summary was produced', async () => {
    apiMock.getAssessment.mockResolvedValue({ ...REVIEWED, patientFacingSummary: null });

    renderDetail();

    expect(
      await screen.findByText('No summary was provided for this screening.')
    ).toBeInTheDocument();
  });

  it('falls back when no specialist was suggested', async () => {
    apiMock.getAssessment.mockResolvedValue({
      ...REVIEWED,
      recommendedSpecialistDisplayName: null,
    });

    renderDetail();

    expect(await screen.findByText('Not specified')).toBeInTheDocument();
  });

  it('omits the home-care section entirely when there is none', async () => {
    apiMock.getAssessment.mockResolvedValue({ ...REVIEWED, homeCareRecommendations: null });

    renderDetail();

    await screen.findByText('Oral Medicine');
    expect(
      screen.queryByRole('heading', { name: 'Home care recommendations' })
    ).not.toBeInTheDocument();
  });

  it('omits the reviewer name and date when the review carries neither', async () => {
    apiMock.getAssessment.mockResolvedValue({
      ...REVIEWED,
      reviewedByDoctorName: null,
      doctorReviewedAt: null,
      doctorNotes: null,
    });

    renderDetail();

    await screen.findByText('Oral Medicine');
    expect(screen.queryByText('Reviewed by')).not.toBeInTheDocument();
    expect(screen.queryByText('Reviewed on')).not.toBeInTheDocument();
  });
});

describe('an assessment awaiting review', () => {
  it('says so instead of showing an empty notes section', async () => {
    apiMock.getAssessment.mockResolvedValue({
      ...REVIEWED,
      doctorRiskClassification: null,
      reviewedByDoctorName: null,
      doctorReviewedAt: null,
      doctorNotes: null,
    });

    renderDetail();

    expect(
      await screen.findByText("A doctor hasn't reviewed this screening yet. Check back soon.")
    ).toBeInTheDocument();
    expect(screen.queryByText('Dr Rao')).not.toBeInTheDocument();
  });
});

describe('when the fetch fails', () => {
  it('distinguishes a missing assessment from a general failure', async () => {
    apiMock.getAssessment.mockRejectedValue(new ApiError('gone', 404, null));

    renderDetail();

    expect(await screen.findByRole('heading', { name: 'Assessment not found' })).toBeInTheDocument();
    expect(
      screen.getByText('This assessment does not exist or is no longer available.')
    ).toBeInTheDocument();
  });

  it('shows generic copy for a server error', async () => {
    apiMock.getAssessment.mockRejectedValue(new ApiError('boom', 500, null));

    renderDetail();

    expect(await screen.findByRole('heading', { name: 'Assessment unavailable' })).toBeInTheDocument();
    expect(screen.getByText('We could not load this assessment.')).toBeInTheDocument();
  });

  it('retries on demand', async () => {
    apiMock.getAssessment.mockRejectedValueOnce(new ApiError('boom', 500, null));
    const { user } = renderDetail();

    await screen.findByRole('heading', { name: 'Assessment unavailable' });

    apiMock.getAssessment.mockResolvedValue(REVIEWED);
    await user.click(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByText('Oral Medicine')).toBeInTheDocument();
  });

  it('hands an expired session to the recovery hook', async () => {
    handleAuthError.mockReturnValue(true);
    apiMock.getAssessment.mockRejectedValue(new ApiError('Unauthorized', 401, null));

    renderDetail();

    await waitFor(() => expect(handleAuthError).toHaveBeenCalled());
    expect(screen.queryByRole('heading', { name: /unavailable|not found/i })).not.toBeInTheDocument();
  });
});
