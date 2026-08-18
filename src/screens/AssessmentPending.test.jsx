import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AssessmentPending from './AssessmentPending';
import { ApiError, api as apiMock } from '../api/client';
import { routerFuture } from '../test/utils';

const navigate = vi.fn();
const handleAuthError = vi.fn(() => false);

vi.mock('../api/client', async (importOriginal) => {
  const { mockApiModule } = await import('../test/apiMock.js');
  return mockApiModule(await importOriginal());
});

vi.mock('react-router-dom', async (importOriginal) => ({
  ...(await importOriginal()),
  useNavigate: () => navigate,
}));

vi.mock('../context/PatientContext', () => ({
  usePatient: () => ({ patient: { id: 'p1' }, setPatient: vi.fn(), clearPatient: vi.fn() }),
}));

vi.mock('../hooks/useSessionRecovery', () => ({ default: () => handleAuthError }));

/**
 * `handedOver` mirrors the normal path: PhotoUpload passes the assessment through
 * navigation state. Omit it to exercise the refresh/shared-link recovery path.
 */
function renderResult({ questionnaireId = 'q1', handedOver } = {}) {
  const user = userEvent.setup();
  render(
    <MemoryRouter
      initialEntries={[
        {
          pathname: `/questionnaire/${questionnaireId}/assessment`,
          state: handedOver ? { assessment: handedOver } : undefined,
        },
      ]}
      future={routerFuture}
    >
      <Routes>
        <Route path="/questionnaire/:questionnaireId/assessment" element={<AssessmentPending />} />
      </Routes>
    </MemoryRouter>
  );
  return { user };
}

const RESULT = {
  aiRiskClassification: 'MODERATE_RISK',
  patientFacingSummary: 'A white patch was seen on the left cheek.',
  recommendedSpecialistDisplayName: 'Oral Medicine',
  homeCareRecommendations: ['Brush twice daily', 'Avoid tobacco'],
};

beforeEach(() => {
  navigate.mockReset();
  handleAuthError.mockReturnValue(false);
});

describe('arriving with the result in navigation state', () => {
  it('renders it immediately without a spinner or a fetch', () => {
    renderResult({ handedOver: RESULT });

    expect(screen.getByRole('heading', { level: 1, name: 'Your result' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Moderate risk' })).toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(apiMock.getQuestionnaireAssessment).not.toHaveBeenCalled();
  });

  it('leads with the verdict, then the supporting material', () => {
    renderResult({ handedOver: RESULT });

    expect(screen.getByRole('heading', { name: 'Why we flagged this' })).toBeInTheDocument();
    expect(screen.getByText('A white patch was seen on the left cheek.')).toBeInTheDocument();
    expect(screen.getByText('Oral Medicine')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Daily Home Care Tips' })).toBeInTheDocument();
  });

  it('always states that this is not a diagnosis', () => {
    renderResult({ handedOver: RESULT });

    expect(screen.getByText('A preliminary AI read — not a diagnosis.')).toBeInTheDocument();
    expect(screen.getByText(/does not replace an in-person examination/)).toBeInTheDocument();
  });

  it('links onward to the full history', async () => {
    const { user } = renderResult({ handedOver: RESULT });

    await user.click(screen.getByRole('button', { name: 'View all my screenings' }));

    expect(navigate).toHaveBeenCalledWith('/assessments');
  });
});

describe('recovering the result after a refresh', () => {
  it('shows a loading state and then fetches by questionnaire id', async () => {
    let resolveFetch;
    apiMock.getQuestionnaireAssessment.mockReturnValue(new Promise((r) => { resolveFetch = r; }));

    renderResult({ questionnaireId: 'q-42' });

    expect(screen.getByRole('status')).toHaveTextContent('Loading your result…');
    expect(apiMock.getQuestionnaireAssessment).toHaveBeenCalledWith('q-42');

    resolveFetch(RESULT);
    expect(await screen.findByRole('heading', { level: 2, name: 'Moderate risk' })).toBeInTheDocument();
  });

  it('retries in place when the load fails', async () => {
    apiMock.getQuestionnaireAssessment.mockRejectedValueOnce(new ApiError('boom', 500, null));
    const { user } = renderResult();

    expect(await screen.findByRole('heading', { name: 'We could not load that result' })).toBeInTheDocument();
    expect(screen.getByText('Your result is saved. Please try again in a moment.')).toBeInTheDocument();

    apiMock.getQuestionnaireAssessment.mockResolvedValue(RESULT);
    await user.click(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByRole('heading', { level: 2, name: 'Moderate risk' })).toBeInTheDocument();
  });

  it('sends an unassessed screening back to photos to resume, not restart', async () => {
    apiMock.getQuestionnaireAssessment.mockResolvedValue(null);
    const { user } = renderResult({ questionnaireId: 'q-42' });

    expect(
      await screen.findByRole('heading', { name: 'This screening has no result yet' })
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Continue screening' }));
    expect(navigate).toHaveBeenCalledWith('/questionnaire/q-42/photos');
  });

  it('hands an expired session to the recovery hook', async () => {
    handleAuthError.mockReturnValue(true);
    apiMock.getQuestionnaireAssessment.mockRejectedValue(new ApiError('Unauthorized', 401, null));

    renderResult();

    await waitFor(() => expect(handleAuthError).toHaveBeenCalled());
    expect(
      await screen.findByRole('heading', { name: 'This screening has no result yet' })
    ).toBeInTheDocument();
  });
});

describe('reading fields out of varying payload shapes', () => {
  it.each(['data', 'assessment', 'result', 'assessmentResult', 'aiAssessment'])(
    'unwraps a %s-wrapped payload',
    (key) => {
      renderResult({ handedOver: { [key]: { aiRiskClassification: 'HIGH_RISK' } } });

      expect(screen.getByRole('heading', { level: 2, name: 'High risk' })).toBeInTheDocument();
    }
  );

  it('unwraps a nested wrapper', () => {
    renderResult({ handedOver: { data: { result: { risk_classification: 'HIGH_RISK' } } } });

    expect(screen.getByRole('heading', { level: 2, name: 'High risk' })).toBeInTheDocument();
  });

  it('accepts snake_case field names', () => {
    renderResult({
      handedOver: {
        risk_classification: 'NO_MILD_RISK',
        patient_facing_summary: 'Nothing concerning was seen.',
        recommended_specialist_display_name: 'General Dentistry',
        home_care_recommendations: ['Floss nightly'],
      },
    });

    expect(screen.getByRole('heading', { level: 2, name: 'No / mild risk' })).toBeInTheDocument();
    expect(screen.getByText('Nothing concerning was seen.')).toBeInTheDocument();
    expect(screen.getByText('General Dentistry')).toBeInTheDocument();
    expect(screen.getByText('Floss nightly')).toBeInTheDocument();
  });

  it('falls back through the specialist aliases to the bare code', () => {
    renderResult({
      handedOver: { aiRiskClassification: 'HIGH_RISK', recommended_specialist_code: 'ORAL_MED' },
    });

    expect(screen.getByText('ORAL_MED')).toBeInTheDocument();
  });

  it.each(['homeCareTips', 'home_care_tips', 'homeCare', 'home_care'])(
    'accepts %s as the home-care key',
    (key) => {
      renderResult({ handedOver: { aiRiskClassification: 'HIGH_RISK', [key]: ['Rinse daily'] } });

      expect(screen.getByText('Rinse daily')).toBeInTheDocument();
    }
  );

  it('omits the optional sections when the payload carries only a verdict', () => {
    renderResult({ handedOver: { aiRiskClassification: 'NO_MILD_RISK' } });

    expect(screen.queryByRole('heading', { name: 'Why we flagged this' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Daily Home Care Tips' })).not.toBeInTheDocument();
    expect(screen.queryByText('Suggested specialist')).not.toBeInTheDocument();
  });

  it('shows the unavailable card rather than crashing on an unreadable verdict', () => {
    renderResult({ handedOver: { somethingElse: true } });

    expect(screen.getByRole('heading', { name: 'Result unavailable' })).toBeInTheDocument();
  });
});

describe('the "what happens next" timeline', () => {
  it('always promises a dentist review with the configured SLA', () => {
    renderResult({ handedOver: RESULT });

    expect(screen.getByText(/usually within 24 hours/)).toBeInTheDocument();
  });

  it('points at Past assessments rather than promising an SMS that is never sent', () => {
    renderResult({ handedOver: RESULT });

    expect(screen.getByText(/saved under Past assessments/)).toBeInTheDocument();
    expect(screen.queryByText(/text message|SMS/i)).not.toBeInTheDocument();
  });

  it.each(['MODERATE_RISK', 'HIGH_RISK'])('adds a booking step for %s', (classification) => {
    renderResult({ handedOver: { aiRiskClassification: classification } });

    expect(screen.getByText('Book an in-person examination')).toBeInTheDocument();
  });

  it('omits the booking step for a low-risk result', () => {
    renderResult({ handedOver: { aiRiskClassification: 'NO_MILD_RISK' } });

    expect(screen.queryByText('Book an in-person examination')).not.toBeInTheDocument();
  });

  it('offers no call button when no clinic number is configured, and says so', () => {
    // VITE_CLINIC_PHONE is unset in the test env, and a bracketed placeholder counts as
    // unset too — a dead "Book now" button is worse than none.
    renderResult({ handedOver: { aiRiskClassification: 'HIGH_RISK' } });

    expect(screen.queryByRole('link', { name: /Call to book/ })).not.toBeInTheDocument();
    expect(screen.getByText(/Contact your dental clinic to arrange a visit/)).toBeInTheDocument();
  });
});
