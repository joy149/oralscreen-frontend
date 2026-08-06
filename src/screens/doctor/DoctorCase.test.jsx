import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import DoctorCase from './DoctorCase';
import { ApiError, api as apiMock } from '../../api/client';
import { ToastProvider } from '../../components/shared/Toast';
import { routerFuture } from '../../test/utils';

const navigate = vi.fn();
const endSession = vi.fn();

vi.mock('../../api/client', async (importOriginal) => {
  const { mockApiModule } = await import('../../test/apiMock.js');
  return mockApiModule(await importOriginal());
});

vi.mock('react-router-dom', async (importOriginal) => ({
  ...(await importOriginal()),
  useNavigate: () => navigate,
}));

vi.mock('../../context/DoctorSessionContext', () => ({
  useDoctorSession: () => ({ session: { doctorId: 'd1', name: 'Dr Rao' }, endSession }),
}));

const CASE = {
  id: 'a1',
  name: 'Asha Rao',
  patientAge: 34,
  patientSex: 'PREFER_NOT_TO_SAY',
  aiRiskClassification: 'HIGH_RISK',
  patientFacingSummary: 'A white patch was seen on the left cheek.',
  recommendedSpecialistDisplayName: 'Oral Medicine',
  doctorSummary: 'Leukoplakia-like lesion, buccal mucosa.',
  clinicalReasoning: 'Homogeneous white plaque that does not scrape off.',
  aiConfidenceScore: 0.87,
  questionnaireResponse: {
    durationOfSymptom: 'DAYS_7_10',
    pain: true,
    bleeding: false,
    difficultySwallowingChewing: null,
    tobaccoUse: true,
    alcoholUse: false,
    paanUse: true,
    additionalNotes: 'Noticed after a dental filling.',
    images: [{ id: 'img-1' }, { id: 'img-2' }],
  },
};

function renderCase({ handedOver } = {}) {
  const user = userEvent.setup();
  render(
    <MemoryRouter
      initialEntries={[
        { pathname: '/doctor/case/a1', state: handedOver ? { assessment: handedOver } : undefined },
      ]}
      future={routerFuture}
    >
      <ToastProvider>
        <Routes>
          <Route path="/doctor/case/:assessmentId" element={<DoctorCase />} />
        </Routes>
      </ToastProvider>
    </MemoryRouter>
  );
  return { user };
}

/** The value of the <dd> that follows the <dt> with this label. */
function fact(label) {
  return screen.getByText(label).closest('div').querySelector('dd').textContent;
}

beforeEach(() => {
  navigate.mockReset();
  endSession.mockReset();
  apiMock.getDoctorAssessment.mockResolvedValue(CASE);
  apiMock.getDoctorImageBlob.mockResolvedValue(new Blob(['png']));
  apiMock.submitDoctorReview.mockResolvedValue({});
  apiMock.resolveApiUrl.mockImplementation((url) => url);
});

describe('loading', () => {
  it('shows a skeleton and fetches the case named in the route', () => {
    apiMock.getDoctorAssessment.mockReturnValue(new Promise(() => {}));

    renderCase();

    expect(screen.getByRole('status', { name: 'Loading case details' })).toBeInTheDocument();
    expect(apiMock.getDoctorAssessment).toHaveBeenCalledWith('a1');
  });

  it('returns to the queue on demand', async () => {
    const { user } = renderCase();
    await screen.findByRole('heading', { level: 1, name: 'Asha Rao' });

    await user.click(screen.getByRole('button', { name: 'Back to queue' }));

    expect(navigate).toHaveBeenCalledWith('/doctor');
  });

  it.each(['assessment', 'aiAssessment', 'data', 'result'])(
    'merges a %s-wrapped payload over the outer object',
    async (key) => {
      apiMock.getDoctorAssessment.mockResolvedValue({
        id: 'a1',
        [key]: { name: 'Bala Iyer', aiRiskClassification: 'MODERATE_RISK' },
      });

      renderCase();

      expect(await screen.findByRole('heading', { level: 1, name: 'Bala Iyer' })).toBeInTheDocument();
    }
  );

  it('ignores an array under a wrapper key rather than spreading it', async () => {
    apiMock.getDoctorAssessment.mockResolvedValue({ name: 'Asha Rao', data: ['nope'] });

    renderCase();

    expect(await screen.findByRole('heading', { level: 1, name: 'Asha Rao' })).toBeInTheDocument();
  });
});

describe('the case detail', () => {
  it('shows the patient name, age and sex', async () => {
    renderCase();

    expect(await screen.findByRole('heading', { level: 1, name: 'Asha Rao' })).toBeInTheDocument();
    expect(screen.getByText('34 years / PREFER NOT TO SAY')).toBeInTheDocument();
  });

  it('falls back when the patient is unidentified', async () => {
    apiMock.getDoctorAssessment.mockResolvedValue({ id: 'a1' });

    renderCase();

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Patient assessment' })
    ).toBeInTheDocument();
    expect(screen.getByText('Patient details unavailable')).toBeInTheDocument();
  });

  it('shows the AI summary and suggested specialist', async () => {
    renderCase();

    expect(await screen.findByText('A white patch was seen on the left cheek.')).toBeInTheDocument();
    expect(fact('Suggested specialist')).toBe('Oral Medicine');
  });

  it('falls back when no patient-facing summary was produced', async () => {
    apiMock.getDoctorAssessment.mockResolvedValue({ id: 'a1' });

    renderCase();

    expect(await screen.findByText('No patient-facing summary was provided.')).toBeInTheDocument();
    expect(fact('Suggested specialist')).toBe('Not specified');
  });

  it('translates the duration code into a readable band', async () => {
    renderCase();

    await screen.findByRole('heading', { level: 1, name: 'Asha Rao' });
    expect(fact('Duration')).toBe('7-10 days');
  });

  it('humanises an unrecognised duration code rather than showing the raw enum', async () => {
    apiMock.getDoctorAssessment.mockResolvedValue({
      id: 'a1',
      questionnaireResponse: { durationOfSymptom: 'SOME_NEW_BAND' },
    });

    renderCase();

    await screen.findByRole('heading', { level: 1, name: 'Patient assessment' });
    expect(fact('Duration')).toBe('SOME NEW BAND');
  });

  it('distinguishes Yes, No and an unanswered question', async () => {
    renderCase();

    await screen.findByRole('heading', { level: 1, name: 'Asha Rao' });
    expect(fact('Pain')).toBe('Yes');
    expect(fact('Bleeding')).toBe('No');
    // Never answered is deliberately not collapsed into "No".
    expect(fact('Swallowing / chewing difficulty')).toBe('Not recorded');
    expect(fact('Tobacco use')).toBe('Yes');
    expect(fact('Paan / gutkha use')).toBe('Yes');
  });

  it('shows the free-text patient notes', async () => {
    renderCase();

    expect(await screen.findByText('Noticed after a dental filling.')).toBeInTheDocument();
  });

  it('omits the notes block when there are none', async () => {
    apiMock.getDoctorAssessment.mockResolvedValue({ id: 'a1', questionnaireResponse: {} });

    renderCase();

    await screen.findByRole('heading', { level: 1, name: 'Patient assessment' });
    expect(screen.queryByRole('heading', { name: 'Patient notes' })).not.toBeInTheDocument();
  });
});

describe('the AI reasoning block', () => {
  it('shows the doctor summary and rounds a 0–1 confidence to a percentage', async () => {
    renderCase();

    expect(await screen.findByText('Leukoplakia-like lesion, buccal mucosa.')).toBeInTheDocument();
    expect(screen.getByText('AI confidence 87%')).toBeInTheDocument();
  });

  it('accepts a confidence already expressed as a percentage', async () => {
    apiMock.getDoctorAssessment.mockResolvedValue({ ...CASE, aiConfidenceScore: 87 });

    renderCase();

    expect(await screen.findByText('AI confidence 87%')).toBeInTheDocument();
  });

  it('omits the confidence when it is not a number', async () => {
    apiMock.getDoctorAssessment.mockResolvedValue({ ...CASE, aiConfidenceScore: 'high' });

    renderCase();

    await screen.findByText('Leukoplakia-like lesion, buccal mucosa.');
    expect(screen.queryByText(/AI confidence/)).not.toBeInTheDocument();
  });

  it('falls back when no summary was generated', async () => {
    apiMock.getDoctorAssessment.mockResolvedValue({ id: 'a1' });

    renderCase();

    expect(await screen.findByText('No doctor summary was generated by AI.')).toBeInTheDocument();
  });

  it('keeps the clinical reasoning collapsed until asked for', async () => {
    const { user } = renderCase();
    await screen.findByText('Leukoplakia-like lesion, buccal mucosa.');

    const toggle = screen.getByRole('button', { name: /View AI clinical reasoning/ });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText(/Homogeneous white plaque/)).not.toBeInTheDocument();

    await user.click(toggle);
    expect(screen.getByText(/Homogeneous white plaque/)).toBeInTheDocument();
    expect(toggle).toHaveAttribute('aria-expanded', 'true');

    await user.click(toggle);
    expect(screen.queryByText(/Homogeneous white plaque/)).not.toBeInTheDocument();
  });

  it('offers no toggle when there is no reasoning to show', async () => {
    apiMock.getDoctorAssessment.mockResolvedValue({ ...CASE, clinicalReasoning: null });

    renderCase();

    await screen.findByText('Leukoplakia-like lesion, buccal mucosa.');
    expect(screen.queryByRole('button', { name: /View AI clinical reasoning/ })).not.toBeInTheDocument();
  });
});

describe('the screening photos', () => {
  it('fetches each image as an authenticated blob', async () => {
    renderCase();

    await waitFor(() => expect(apiMock.getDoctorImageBlob).toHaveBeenCalledWith('img-1'));
    expect(await screen.findByAltText('Screening photo 1')).toBeInTheDocument();
    expect(await screen.findByAltText('Screening photo 2')).toBeInTheDocument();
  });

  it.each(['url', 'imageUrl', 'downloadUrl', 'presignedUrl'])(
    'uses a direct %s without a blob request',
    async (key) => {
      apiMock.getDoctorAssessment.mockResolvedValue({
        ...CASE,
        questionnaireResponse: { images: [{ [key]: '/api/images/x' }] },
      });

      renderCase();

      expect(await screen.findByAltText('Screening photo 1')).toHaveAttribute(
        'src',
        '/api/images/x'
      );
      expect(apiMock.getDoctorImageBlob).not.toHaveBeenCalled();
    }
  );

  it.each(['imageAssets'])('reads photos from the %s key too', async (key) => {
    apiMock.getDoctorAssessment.mockResolvedValue({
      ...CASE,
      questionnaireResponse: { [key]: [{ id: 'img-9' }] },
    });

    renderCase();

    await waitFor(() => expect(apiMock.getDoctorImageBlob).toHaveBeenCalledWith('img-9'));
  });

  it('falls back to images on the assessment itself', async () => {
    apiMock.getDoctorAssessment.mockResolvedValue({
      id: 'a1',
      images: [{ id: 'img-7' }],
    });

    renderCase();

    await waitFor(() => expect(apiMock.getDoctorImageBlob).toHaveBeenCalledWith('img-7'));
  });

  it('says so when a case has no photos', async () => {
    apiMock.getDoctorAssessment.mockResolvedValue({ id: 'a1', questionnaireResponse: {} });

    renderCase();

    expect(await screen.findByText('No screening photos were returned.')).toBeInTheDocument();
  });

  it('marks an image unavailable when its fetch fails', async () => {
    apiMock.getDoctorImageBlob.mockRejectedValue(new ApiError('gone', 404, null));

    renderCase();

    expect(await screen.findAllByText('Image unavailable')).toHaveLength(2);
  });

  it('shows a placeholder for an image with neither a URL nor an id', async () => {
    apiMock.getDoctorAssessment.mockResolvedValue({
      ...CASE,
      questionnaireResponse: { images: [{}] },
    });

    renderCase();

    expect(await screen.findByText('Image unavailable')).toBeInTheDocument();
  });
});

describe('the lightbox', () => {
  async function openLightbox(user) {
    const photo = await screen.findByAltText('Screening photo 1');
    await user.click(photo.closest('button'));
    return screen.getByRole('dialog', { name: 'Clinical photo viewer' });
  }

  it('opens on a photo click', async () => {
    const { user } = renderCase();

    expect(await openLightbox(user)).toBeInTheDocument();
    expect(screen.getByText('Clinical Image Inspection')).toBeInTheDocument();
  });

  it('zooms in and out within bounds', async () => {
    const { user } = renderCase();
    const box = await openLightbox(user);

    expect(within(box).getByText('100%')).toBeInTheDocument();

    await user.click(within(box).getByTitle('Zoom In'));
    expect(within(box).getByText('150%')).toBeInTheDocument();

    await user.click(within(box).getByTitle('Zoom Out'));
    await user.click(within(box).getByTitle('Zoom Out'));
    // Clamped at 100% — it never zooms below the natural size.
    expect(within(box).getByText('100%')).toBeInTheDocument();
  });

  it('clamps zoom at 350%', async () => {
    const { user } = renderCase();
    const box = await openLightbox(user);

    for (let i = 0; i < 8; i += 1) {
      await user.click(within(box).getByTitle('Zoom In'));
    }

    expect(within(box).getByText('350%')).toBeInTheDocument();
  });

  it('rotates in 90-degree steps, wrapping at 360', async () => {
    const { user } = renderCase();
    const box = await openLightbox(user);
    const image = within(box).getByAltText('Screening photo 1');

    await user.click(within(box).getByTitle('Rotate 90deg'));
    expect(image).toHaveStyle({ transform: 'scale(1) rotate(90deg)' });

    for (let i = 0; i < 3; i += 1) {
      await user.click(within(box).getByTitle('Rotate 90deg'));
    }
    expect(image).toHaveStyle({ transform: 'scale(1) rotate(0deg)' });
  });

  it('offers side-by-side comparison when the case has more than one photo', async () => {
    const { user } = renderCase();
    const box = await openLightbox(user);

    await user.click(within(box).getByRole('button', { name: /Compare/ }));

    expect(within(box).getByAltText('Comparison photo')).toBeInTheDocument();

    await user.click(within(box).getByRole('button', { name: /Single View/ }));
    expect(within(box).queryByAltText('Comparison photo')).not.toBeInTheDocument();
  });

  it('offers no comparison for a single-photo case', async () => {
    apiMock.getDoctorAssessment.mockResolvedValue({
      ...CASE,
      questionnaireResponse: { images: [{ id: 'img-1' }] },
    });
    const { user } = renderCase();
    const box = await openLightbox(user);

    expect(within(box).queryByRole('button', { name: /Compare/ })).not.toBeInTheDocument();
  });

  it('closes on Escape', async () => {
    const { user } = renderCase();
    await openLightbox(user);

    await user.keyboard('{Escape}');

    expect(screen.queryByRole('dialog', { name: 'Clinical photo viewer' })).not.toBeInTheDocument();
  });

  it('closes from the button, resetting zoom and rotation', async () => {
    const { user } = renderCase();
    const box = await openLightbox(user);
    await user.click(within(box).getByTitle('Zoom In'));

    await user.click(within(box).getByRole('button', { name: 'Close lightbox' }));
    expect(screen.queryByRole('dialog', { name: 'Clinical photo viewer' })).not.toBeInTheDocument();

    const reopened = await openLightbox(user);
    expect(within(reopened).getByText('100%')).toBeInTheDocument();
  });
});

describe('recording a review', () => {
  it('starts empty for an unreviewed case and blocks saving', async () => {
    const { user } = renderCase();
    await screen.findByRole('heading', { level: 1, name: 'Asha Rao' });

    expect(screen.getByLabelText('Risk classification')).toHaveValue('');
    expect(screen.getByRole('button', { name: 'Save review' })).toBeDisabled();
    expect(user).toBeDefined();
  });

  it('prefills an existing review', async () => {
    apiMock.getDoctorAssessment.mockResolvedValue({
      ...CASE,
      doctorRiskClassification: 'MODERATE_RISK',
      doctorNotes: 'Reviewed; recall in 3 months.',
    });

    renderCase();

    await waitFor(() =>
      expect(screen.getByLabelText('Risk classification')).toHaveValue('MODERATE_RISK')
    );
    expect(screen.getByLabelText('Clinical notes')).toHaveValue('Reviewed; recall in 3 months.');
  });

  it('reads a review nested under doctorReview', async () => {
    apiMock.getDoctorAssessment.mockResolvedValue({
      ...CASE,
      doctorReview: { doctorRiskClassification: 'HIGH_RISK', doctorNotes: 'Urgent referral.' },
    });

    renderCase();

    await waitFor(() =>
      expect(screen.getByLabelText('Risk classification')).toHaveValue('HIGH_RISK')
    );
    expect(screen.getByLabelText('Clinical notes')).toHaveValue('Urgent referral.');
  });

  it('warns whose assessment is on record before it gets replaced', async () => {
    apiMock.getDoctorAssessment.mockResolvedValue({
      ...CASE,
      reviewedByDoctorName: 'Dr Iyer',
      doctorReviewedAt: '2026-07-03T09:00:00Z',
    });

    renderCase();

    const notice = await screen.findByText(/Saving replaces it/);
    expect(notice).toHaveTextContent('Dr Iyer');
    expect(notice).toHaveTextContent('3 Jul 2026');
  });

  it('omits the review date when only a name is recorded', async () => {
    apiMock.getDoctorAssessment.mockResolvedValue({ ...CASE, reviewedByDoctorName: 'Dr Iyer' });

    renderCase();

    const notice = await screen.findByText(/Saving replaces it/);
    expect(notice).toHaveTextContent('Dr Iyer');
    expect(notice).not.toHaveTextContent(' on ');
  });

  it('submits the classification and trimmed notes, then confirms', async () => {
    const { user } = renderCase();
    await screen.findByRole('heading', { level: 1, name: 'Asha Rao' });

    await user.selectOptions(screen.getByLabelText('Risk classification'), 'HIGH_RISK');
    await user.type(screen.getByLabelText('Clinical notes'), '  Refer urgently.  ');
    await user.click(screen.getByRole('button', { name: 'Save review' }));

    await waitFor(() =>
      expect(apiMock.submitDoctorReview).toHaveBeenCalledWith('a1', {
        doctorRiskClassification: 'HIGH_RISK',
        doctorNotes: 'Refer urgently.',
      })
    );
    expect(await screen.findByText('Review saved successfully')).toBeInTheDocument();
    expect(screen.getByText('Review saved. You can update it again at any time.')).toBeInTheDocument();
  });

  it('offers a route back to the queue once saved', async () => {
    const { user } = renderCase();
    await screen.findByRole('heading', { level: 1, name: 'Asha Rao' });

    await user.selectOptions(screen.getByLabelText('Risk classification'), 'HIGH_RISK');
    await user.click(screen.getByRole('button', { name: 'Save review' }));
    await screen.findByText('Review saved. You can update it again at any time.');

    await user.click(screen.getAllByRole('button', { name: 'Back to queue' })[1]);
    expect(navigate).toHaveBeenCalledWith('/doctor');
  });

  it('clears the saved confirmation as soon as the form is edited again', async () => {
    const { user } = renderCase();
    await screen.findByRole('heading', { level: 1, name: 'Asha Rao' });

    await user.selectOptions(screen.getByLabelText('Risk classification'), 'HIGH_RISK');
    await user.click(screen.getByRole('button', { name: 'Save review' }));
    await screen.findByText('Review saved. You can update it again at any time.');

    await user.type(screen.getByLabelText('Clinical notes'), 'more');

    expect(
      screen.queryByText('Review saved. You can update it again at any time.')
    ).not.toBeInTheDocument();
  });

  it('shows a saving state that blocks a double submit', async () => {
    let resolveSave;
    apiMock.submitDoctorReview.mockReturnValue(new Promise((r) => { resolveSave = r; }));
    const { user } = renderCase();
    await screen.findByRole('heading', { level: 1, name: 'Asha Rao' });

    await user.selectOptions(screen.getByLabelText('Risk classification'), 'HIGH_RISK');
    await user.click(screen.getByRole('button', { name: 'Save review' }));

    expect(await screen.findByRole('button', { name: 'Saving review...' })).toBeDisabled();

    resolveSave({});
    await screen.findByRole('button', { name: 'Save review' });
  });

  it('reports a failed save inline and via a toast, keeping the form intact', async () => {
    apiMock.submitDoctorReview.mockRejectedValue(new ApiError('boom', 500, null));
    const { user } = renderCase();
    await screen.findByRole('heading', { level: 1, name: 'Asha Rao' });

    await user.selectOptions(screen.getByLabelText('Risk classification'), 'HIGH_RISK');
    await user.type(screen.getByLabelText('Clinical notes'), 'Refer urgently.');
    await user.click(screen.getByRole('button', { name: 'Save review' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The review could not be saved. Please try again.'
    );
    expect(screen.getByLabelText('Clinical notes')).toHaveValue('Refer urgently.');
  });
});

describe('keyboard shortcuts', () => {
  it.each([
    ['1', 'NO_MILD_RISK'],
    ['2', 'MODERATE_RISK'],
    ['3', 'HIGH_RISK'],
  ])('key %s selects %s', async (key, expected) => {
    const { user } = renderCase();
    await screen.findByRole('heading', { level: 1, name: 'Asha Rao' });

    await user.keyboard(key);

    expect(screen.getByLabelText('Risk classification')).toHaveValue(expected);
  });

  it('stays out of the way while the notes field has focus', async () => {
    const { user } = renderCase();
    await screen.findByRole('heading', { level: 1, name: 'Asha Rao' });

    await user.click(screen.getByLabelText('Clinical notes'));
    await user.keyboard('3');

    expect(screen.getByLabelText('Risk classification')).toHaveValue('');
    expect(screen.getByLabelText('Clinical notes')).toHaveValue('3');
  });

  it('is inert while the lightbox is open', async () => {
    const { user } = renderCase();
    const photo = await screen.findByAltText('Screening photo 1');
    await user.click(photo.closest('button'));

    await user.keyboard('3');

    expect(screen.getByLabelText('Risk classification')).toHaveValue('');
  });

  it('submits the review on Ctrl+Enter', async () => {
    const { user } = renderCase();
    await screen.findByRole('heading', { level: 1, name: 'Asha Rao' });

    await user.keyboard('3');
    await user.keyboard('{Control>}{Enter}{/Control}');

    await waitFor(() =>
      expect(apiMock.submitDoctorReview).toHaveBeenCalledWith('a1', {
        doctorRiskClassification: 'HIGH_RISK',
        doctorNotes: '',
      })
    );
  });
});

describe('error handling', () => {
  it('distinguishes a missing case from a general failure', async () => {
    apiMock.getDoctorAssessment.mockRejectedValue(new ApiError('gone', 404, null));

    renderCase();

    expect(await screen.findByRole('heading', { name: 'Case not found' })).toBeInTheDocument();
    expect(
      screen.getByText('This assessment does not exist or is no longer available.')
    ).toBeInTheDocument();
  });

  it('retries a failed load', async () => {
    apiMock.getDoctorAssessment.mockRejectedValueOnce(new ApiError('boom', 500, null));
    const { user } = renderCase();

    await screen.findByRole('heading', { name: 'Case unavailable' });

    apiMock.getDoctorAssessment.mockResolvedValue(CASE);
    await user.click(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByRole('heading', { level: 1, name: 'Asha Rao' })).toBeInTheDocument();
  });

  it('ends the session and returns to login on a 401', async () => {
    apiMock.getDoctorAssessment.mockRejectedValue(new ApiError('Unauthorized', 401, null));

    renderCase();

    await waitFor(() => expect(endSession).toHaveBeenCalledTimes(1));
    expect(navigate).toHaveBeenCalledWith('/doctor/login', { replace: true });
  });

  it('keeps the session on a 403 — not approved is not the same as expired', async () => {
    apiMock.getDoctorAssessment.mockRejectedValue(new ApiError('Forbidden', 403, null));

    renderCase();

    expect(await screen.findByRole('heading', { name: 'Case unavailable' })).toBeInTheDocument();
    expect(endSession).not.toHaveBeenCalled();
  });

  it('signs the doctor out when an image request 401s', async () => {
    apiMock.getDoctorImageBlob.mockRejectedValue(new ApiError('Unauthorized', 401, null));

    renderCase();

    await waitFor(() => expect(endSession).toHaveBeenCalled());
  });
});

describe('arriving from the queue', () => {
  it('renders the handed-over row data immediately, then refines it with the full fetch', async () => {
    let resolveFetch;
    apiMock.getDoctorAssessment.mockReturnValue(new Promise((r) => { resolveFetch = r; }));

    renderCase({ handedOver: { id: 'a1', name: 'Asha Rao', aiRiskClassification: 'HIGH_RISK' } });

    // The skeleton is showing, but the row data is already in state for when it clears.
    expect(screen.getByRole('status', { name: 'Loading case details' })).toBeInTheDocument();

    resolveFetch({ patientFacingSummary: 'A white patch was seen.' });

    expect(await screen.findByRole('heading', { level: 1, name: 'Asha Rao' })).toBeInTheDocument();
    expect(screen.getByText('A white patch was seen.')).toBeInTheDocument();
  });
});
