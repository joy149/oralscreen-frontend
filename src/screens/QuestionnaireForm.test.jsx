import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import QuestionnaireForm from './QuestionnaireForm';
import { ApiError, api as apiMock } from '../api/client';
import { routerFuture } from '../test/utils';

const navigate = vi.fn();
let patient = { id: 'p1' };

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

vi.mock('../hooks/useSessionRecovery', () => ({ default: () => vi.fn(() => false) }));

const QUESTIONS = [
  'Pain',
  'Bleeding',
  'Difficulty swallowing or chewing',
  'Tobacco use',
  'Alcohol use',
  'Paan / gutkha use',
];

function renderForm({ questionnaireId } = {}) {
  const user = userEvent.setup();
  const path = questionnaireId ? `/questionnaire/${questionnaireId}` : '/questionnaire';
  render(
    <MemoryRouter initialEntries={[path]} future={routerFuture}>
      <Routes>
        <Route path="/questionnaire" element={<QuestionnaireForm />} />
        <Route path="/questionnaire/:questionnaireId" element={<QuestionnaireForm />} />
        <Route path="/" element={<p>Sign in screen</p>} />
      </Routes>
    </MemoryRouter>
  );
  return { user };
}

/** Answers every question so the form becomes submittable. */
async function completeForm(user, { duration = 'DAYS_3_5', yesTo = [] } = {}) {
  await user.selectOptions(screen.getByLabelText('How long have you noticed this?'), duration);
  for (const label of QUESTIONS) {
    const group = screen.getByRole('group', { name: label });
    const answer = yesTo.includes(label) ? 'Yes' : 'No';
    await user.click(within(group).getByRole('button', { name: answer }));
  }
}

beforeEach(() => {
  patient = { id: 'p1' };
  navigate.mockReset();
});

describe('access', () => {
  it('redirects a signed-out visitor starting a fresh questionnaire', () => {
    patient = null;

    renderForm();

    expect(screen.getByText('Sign in screen')).toBeInTheDocument();
  });

  it('still renders when editing an existing questionnaire by id', () => {
    patient = null;
    apiMock.getQuestionnaire.mockResolvedValue({});

    renderForm({ questionnaireId: 'q1' });

    expect(screen.queryByText('Sign in screen')).not.toBeInTheDocument();
  });
});

describe('a fresh questionnaire', () => {
  it('renders every question unanswered', () => {
    renderForm();

    for (const label of QUESTIONS) {
      const group = screen.getByRole('group', { name: label });
      expect(within(group).getByRole('button', { name: 'Yes' })).toHaveAttribute('aria-pressed', 'false');
      expect(within(group).getByRole('button', { name: 'No' })).toHaveAttribute('aria-pressed', 'false');
    }
  });

  it('offers the six duration bands', () => {
    renderForm();

    expect(screen.getByRole('option', { name: '0–2 days' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'More than 1 month' })).toBeInTheDocument();
  });

  it('does not fetch anything', () => {
    renderForm();

    expect(apiMock.getQuestionnaire).not.toHaveBeenCalled();
  });

  it('offers no "back to photos" escape hatch — there are no photos yet', () => {
    renderForm();

    expect(screen.queryByRole('button', { name: 'Back to photos' })).not.toBeInTheDocument();
  });
});

describe('completeness gating', () => {
  it('blocks submission until everything is answered', () => {
    renderForm();

    expect(screen.getByRole('button', { name: 'Continue to photos' })).toBeDisabled();
  });

  it('names both missing pieces when nothing has been answered', () => {
    renderForm();

    expect(screen.getByRole('status')).toHaveTextContent(
      'Select a duration and answer 6 more questions to continue.'
    );
  });

  it('asks only for the duration once every question is answered', async () => {
    const { user } = renderForm();

    for (const label of QUESTIONS) {
      await user.click(within(screen.getByRole('group', { name: label })).getByRole('button', { name: 'No' }));
    }

    expect(screen.getByRole('status')).toHaveTextContent(
      'Select how long you’ve noticed this to continue.'
    );
  });

  it('counts down the remaining questions, singular at one', async () => {
    const { user } = renderForm();
    await user.selectOptions(screen.getByLabelText('How long have you noticed this?'), 'DAYS_3_5');

    for (const label of QUESTIONS.slice(0, 5)) {
      await user.click(within(screen.getByRole('group', { name: label })).getByRole('button', { name: 'No' }));
    }

    expect(screen.getByRole('status')).toHaveTextContent('Answer 1 more question to continue.');
  });

  it('enables submit and drops the requirement note once complete', async () => {
    const { user } = renderForm();

    await completeForm(user);

    expect(screen.getByRole('button', { name: 'Continue to photos' })).toBeEnabled();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('treats an explicit "No" as answered — it is not the same as skipping', async () => {
    const { user } = renderForm();
    const group = screen.getByRole('group', { name: 'Pain' });

    await user.click(within(group).getByRole('button', { name: 'No' }));

    expect(screen.getByRole('status')).toHaveTextContent('answer 5 more questions');
  });
});

describe('submitting a new questionnaire', () => {
  it('sends booleans, the patient id and the trimmed notes', async () => {
    apiMock.submitQuestionnaire.mockResolvedValue({ id: 'q-new' });
    const { user } = renderForm();

    await completeForm(user, { duration: 'MORE_THAN_1_MONTH', yesTo: ['Pain', 'Tobacco use'] });
    await user.type(screen.getByLabelText(/Anything else/), '  a sore spot  ');
    await user.click(screen.getByRole('button', { name: 'Continue to photos' }));

    await waitFor(() =>
      expect(apiMock.submitQuestionnaire).toHaveBeenCalledWith({
        patientId: 'p1',
        durationOfSymptom: 'MORE_THAN_1_MONTH',
        pain: true,
        bleeding: false,
        difficultySwallowingChewing: false,
        tobaccoUse: true,
        alcoholUse: false,
        paanUse: false,
        additionalNotes: 'a sore spot',
      })
    );
  });

  it('omits blank notes rather than sending an empty string', async () => {
    apiMock.submitQuestionnaire.mockResolvedValue({ id: 'q-new' });
    const { user } = renderForm();

    await completeForm(user);
    await user.click(screen.getByRole('button', { name: 'Continue to photos' }));

    await waitFor(() =>
      expect(apiMock.submitQuestionnaire).toHaveBeenCalledWith(
        expect.objectContaining({ additionalNotes: undefined })
      )
    );
  });

  it('moves to the photo step using the id the server assigned', async () => {
    apiMock.submitQuestionnaire.mockResolvedValue({ id: 'q-new' });
    const { user } = renderForm();

    await completeForm(user);
    await user.click(screen.getByRole('button', { name: 'Continue to photos' }));

    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/questionnaire/q-new/photos'));
  });

  it('shows a saving state that blocks a double submit', async () => {
    let resolveSubmit;
    apiMock.submitQuestionnaire.mockReturnValue(new Promise((r) => { resolveSubmit = r; }));
    const { user } = renderForm();

    await completeForm(user);
    await user.click(screen.getByRole('button', { name: 'Continue to photos' }));

    expect(await screen.findByRole('button', { name: 'Saving…' })).toBeDisabled();

    resolveSubmit({ id: 'q-new' });
    await waitFor(() => expect(navigate).toHaveBeenCalled());
  });
});

describe('editing an existing questionnaire', () => {
  const SAVED = {
    id: 'q1',
    durationOfSymptom: 'DAYS_7_10',
    pain: true,
    bleeding: false,
    difficultySwallowingChewing: null,
    tobaccoUse: true,
    alcoholUse: false,
    paanUse: false,
    additionalNotes: 'Started after a filling',
  };

  it('shows a skeleton while loading the saved answers', () => {
    apiMock.getQuestionnaire.mockReturnValue(new Promise(() => {}));

    renderForm({ questionnaireId: 'q1' });

    expect(screen.getByRole('status', { name: 'Loading your answers' })).toBeInTheDocument();
  });

  it('prefills the duration, answers and notes', async () => {
    apiMock.getQuestionnaire.mockResolvedValue(SAVED);

    renderForm({ questionnaireId: 'q1' });

    await waitFor(() =>
      expect(screen.getByLabelText('How long have you noticed this?')).toHaveValue('DAYS_7_10')
    );
    expect(within(screen.getByRole('group', { name: 'Pain' })).getByRole('button', { name: 'Yes' }))
      .toHaveAttribute('aria-pressed', 'true');
    expect(within(screen.getByRole('group', { name: 'Bleeding' })).getByRole('button', { name: 'No' }))
      .toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByLabelText(/Anything else/)).toHaveValue('Started after a filling');
  });

  it('keeps a null answer unanswered rather than defaulting it to No', async () => {
    apiMock.getQuestionnaire.mockResolvedValue(SAVED);

    renderForm({ questionnaireId: 'q1' });

    const group = await screen.findByRole('group', { name: 'Difficulty swallowing or chewing' });
    expect(within(group).getByRole('button', { name: 'No' })).toHaveAttribute('aria-pressed', 'false');
    expect(within(group).getByRole('button', { name: 'Yes' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('status')).toHaveTextContent('Answer 1 more question to continue.');
  });

  it('copes with a saved questionnaire that has no duration or notes', async () => {
    apiMock.getQuestionnaire.mockResolvedValue({ id: 'q1' });

    renderForm({ questionnaireId: 'q1' });

    await waitFor(() =>
      expect(screen.getByLabelText('How long have you noticed this?')).toHaveValue('')
    );
    expect(screen.getByLabelText(/Anything else/)).toHaveValue('');
  });

  it('PUTs the changes and returns to photos with the id from the URL', async () => {
    apiMock.getQuestionnaire.mockResolvedValue(SAVED);
    apiMock.updateQuestionnaire.mockResolvedValue({ id: 'q1' });
    const { user } = renderForm({ questionnaireId: 'q1' });

    const group = await screen.findByRole('group', { name: 'Difficulty swallowing or chewing' });
    await user.click(within(group).getByRole('button', { name: 'No' }));
    await user.click(screen.getByRole('button', { name: 'Save changes & return to photos' }));

    await waitFor(() =>
      expect(apiMock.updateQuestionnaire).toHaveBeenCalledWith(
        'q1',
        expect.objectContaining({ durationOfSymptom: 'DAYS_7_10', pain: true, tobaccoUse: true })
      )
    );
    expect(navigate).toHaveBeenCalledWith('/questionnaire/q1/photos');
    expect(apiMock.submitQuestionnaire).not.toHaveBeenCalled();
  });

  it('offers a way back to photos without saving', async () => {
    apiMock.getQuestionnaire.mockResolvedValue(SAVED);
    const { user } = renderForm({ questionnaireId: 'q1' });

    await user.click(await screen.findByRole('button', { name: 'Back to photos' }));

    expect(navigate).toHaveBeenCalledWith('/questionnaire/q1/photos');
    expect(apiMock.updateQuestionnaire).not.toHaveBeenCalled();
  });
});

describe('error handling', () => {
  it('offers a fresh start when the questionnaire is gone', async () => {
    apiMock.getQuestionnaire.mockRejectedValue(new ApiError('gone', 404, null));
    const { user } = renderForm({ questionnaireId: 'q1' });

    expect(await screen.findByRole('heading', { name: 'Questionnaire not found' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Start a new questionnaire' }));
    expect(navigate).toHaveBeenCalledWith('/questionnaire');
  });

  it('retries the load in place for a server error', async () => {
    apiMock.getQuestionnaire.mockRejectedValueOnce(new ApiError('boom', 500, null));
    const { user } = renderForm({ questionnaireId: 'q1' });

    await screen.findByRole('heading', { name: 'Please review your answers' });

    apiMock.getQuestionnaire.mockResolvedValue({ id: 'q1', durationOfSymptom: 'DAYS_3_5' });
    await user.click(screen.getByRole('button', { name: 'Review answers' }));

    await waitFor(() =>
      expect(screen.getByLabelText('How long have you noticed this?')).toHaveValue('DAYS_3_5')
    );
  });

  it('explains a 400 as a validation problem and returns to the answers', async () => {
    apiMock.submitQuestionnaire.mockRejectedValue(new ApiError('bad input', 400, null));
    const { user } = renderForm();

    await completeForm(user);
    await user.click(screen.getByRole('button', { name: 'Continue to photos' }));

    expect(await screen.findByRole('heading', { name: 'Please review your answers' })).toBeInTheDocument();
    expect(
      screen.getByText('Please make sure every required question has an answer, then try again.')
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Review answers' }));
    expect(screen.getByRole('button', { name: 'Continue to photos' })).toBeInTheDocument();
  });

  it('keeps the answers intact when returning from a submit error', async () => {
    apiMock.submitQuestionnaire.mockRejectedValue(new ApiError('boom', 500, null));
    const { user } = renderForm();

    await completeForm(user, { duration: 'DAYS_10_TO_1_MONTH', yesTo: ['Pain'] });
    await user.click(screen.getByRole('button', { name: 'Continue to photos' }));
    await user.click(await screen.findByRole('button', { name: 'Review answers' }));

    expect(screen.getByLabelText('How long have you noticed this?')).toHaveValue('DAYS_10_TO_1_MONTH');
    expect(within(screen.getByRole('group', { name: 'Pain' })).getByRole('button', { name: 'Yes' }))
      .toHaveAttribute('aria-pressed', 'true');
  });
});
