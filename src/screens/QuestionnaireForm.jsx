import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import AppShell from '../components/layout/AppShell';
import ErrorState from '../components/shared/ErrorState';
import { QuestionnaireSkeleton } from '../components/shared/Skeleton';
import PageTransition from '../components/shared/PageTransition';
import ChoiceGroup from '../components/shared/ChoiceGroup';
import { api } from '../api/client';
import { usePatient } from '../context/PatientContext';
import './QuestionnaireForm.css';

const DURATION_OPTIONS = [
  { value: 'DAYS_0_2', label: '0–2 days' },
  { value: 'DAYS_3_5', label: '3–5 days' },
  { value: 'DAYS_5_7', label: '5–7 days' },
  { value: 'DAYS_7_10', label: '7–10 days' },
  { value: 'DAYS_10_TO_1_MONTH', label: '10 days – 1 month' },
  { value: 'MORE_THAN_1_MONTH', label: 'More than 1 month' },
];

const SYMPTOMS = [
  { key: 'pain', label: 'Pain', hint: 'Aching or soreness in the area' },
  { key: 'bleeding', label: 'Bleeding', hint: 'Gums or the area bleed' },
  { key: 'difficultySwallowingChewing', label: 'Difficulty swallowing or chewing' },
];

const HABITS = [
  { key: 'tobaccoUse', label: 'Tobacco use', hint: 'Smoking or chewing tobacco' },
  { key: 'alcoholUse', label: 'Alcohol use' },
  { key: 'paanUse', label: 'Paan / gutkha use' },
];

const ALL_QUESTIONS = [...SYMPTOMS, ...HABITS];

export default function QuestionnaireForm() {
  const navigate = useNavigate();
  const { questionnaireId } = useParams();
  const { patient } = usePatient();

  const [durationOfSymptom, setDurationOfSymptom] = useState('');
  // null = not yet answered, which is deliberately distinct from an explicit
  // "No". The old switch-based form defaulted every question to false, so a
  // patient who simply scrolled past submitted six silent negatives.
  const [answers, setAnswers] = useState(
    Object.fromEntries(ALL_QUESTIONS.map(({ key }) => [key, null]))
  );
  const [additionalNotes, setAdditionalNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [errorSource, setErrorSource] = useState(null);
  const [loading, setLoading] = useState(Boolean(questionnaireId));
  const [loadRetry, setLoadRetry] = useState(0);

  useEffect(() => {
    if (!questionnaireId) return undefined;

    let cancelled = false;
    setLoading(true);
    setError(null);
    setErrorSource(null);

    api.getQuestionnaire(questionnaireId)
      .then((questionnaire) => {
        if (cancelled) return;
        setDurationOfSymptom(questionnaire.durationOfSymptom || '');
        setAnswers(Object.fromEntries(
          ALL_QUESTIONS.map(({ key }) => [
            key,
            questionnaire[key] == null ? null : Boolean(questionnaire[key]),
          ])
        ));
        setAdditionalNotes(questionnaire.additionalNotes || '');
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err);
          setErrorSource('load');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [questionnaireId, loadRetry]);

  if (!patient && !questionnaireId) {
    navigate('/');
    return null;
  }

  function answer(key, value) {
    setAnswers((prev) => ({ ...prev, [key]: value }));
  }

  const unanswered = ALL_QUESTIONS.filter(({ key }) => answers[key] == null).length;
  const isComplete = Boolean(durationOfSymptom) && unanswered === 0;

  async function handleSubmit(e) {
    e.preventDefault();
    if (!isComplete) return;
    setError(null);
    setErrorSource(null);
    setSubmitting(true);
    try {
      // The API contract is booleans, so send booleans. The null state is a
      // client-side completeness guard, not a wire value.
      const data = {
        durationOfSymptom,
        ...Object.fromEntries(ALL_QUESTIONS.map(({ key }) => [key, answers[key] === true])),
        additionalNotes: additionalNotes.trim() || undefined,
      };
      const questionnaire = questionnaireId
        ? await api.updateQuestionnaire(questionnaireId, data)
        : await api.submitQuestionnaire({ patientId: patient.id, ...data });
      navigate(`/questionnaire/${questionnaireId || questionnaire.id}/photos`);
    } catch (err) {
      setError(err);
      setErrorSource('submit');
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <AppShell step={1} totalSteps={3}>
        <QuestionnaireSkeleton />
      </AppShell>
    );
  }

  if (error) {
    const questionnaireNotFound = error.status === 404;
    const invalidInput = error.status === 400;
    return (
      <AppShell step={1} totalSteps={3}>
        <ErrorState
          title={questionnaireNotFound ? 'Questionnaire not found' : 'Please review your answers'}
          message={questionnaireNotFound
            ? 'This questionnaire is no longer available. Please start a new one.'
            : invalidInput
              ? 'Please make sure every required question has an answer, then try again.'
              : undefined}
          retryLabel={questionnaireNotFound ? 'Start a new questionnaire' : 'Review answers'}
          onRetry={() => questionnaireNotFound
            ? navigate('/questionnaire')
            : errorSource === 'load'
              ? setLoadRetry((value) => value + 1)
              : setError(null)}
        />
      </AppShell>
    );
  }

  return (
    <AppShell step={1} totalSteps={3}>
      <PageTransition>
        <div className="screen">
          <h1>Tell us what's going on</h1>
          <p className="questionnaire-form__subhead">This helps the AI and the doctor understand your case.</p>

          <form onSubmit={handleSubmit} className="questionnaire-form">
            <div className="field">
              <label htmlFor="duration">How long have you noticed this?</label>
              <select
                id="duration"
                value={durationOfSymptom}
                onChange={(e) => setDurationOfSymptom(e.target.value)}
              >
                <option value="" disabled>
                  Select duration
                </option>
                {DURATION_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <section className="questionnaire-form__group" aria-labelledby="symptoms-heading">
              <h2 className="questionnaire-form__group-title" id="symptoms-heading">
                Are you experiencing any of these?
              </h2>
              <div className="card questionnaire-form__questions">
                {SYMPTOMS.map((q) => (
                  <ChoiceGroup
                    key={q.key}
                    id={q.key}
                    label={q.label}
                    hint={q.hint}
                    value={answers[q.key]}
                    onChange={(value) => answer(q.key, value)}
                  />
                ))}
              </div>
            </section>

            <section className="questionnaire-form__group" aria-labelledby="habits-heading">
              <h2 className="questionnaire-form__group-title" id="habits-heading">
                Do any of these apply to you?
              </h2>
              <p className="questionnaire-form__group-note">
                These affect oral cancer risk, so an honest answer helps the dentist. Nothing here is shared outside your care team.
              </p>
              <div className="card questionnaire-form__questions">
                {HABITS.map((q) => (
                  <ChoiceGroup
                    key={q.key}
                    id={q.key}
                    label={q.label}
                    hint={q.hint}
                    value={answers[q.key]}
                    onChange={(value) => answer(q.key, value)}
                  />
                ))}
              </div>
            </section>

            <div className="field">
              <label htmlFor="notes">Anything else you'd like to add? (optional)</label>
              <textarea
                id="notes"
                value={additionalNotes}
                onChange={(e) => setAdditionalNotes(e.target.value)}
                placeholder="Describe what you're noticing, in your own words"
              />
            </div>

            <div className="questionnaire-form__actions">
              {questionnaireId && (
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => navigate(`/questionnaire/${questionnaireId}/photos`)}
                  disabled={submitting}
                >
                  Back to photos
                </button>
              )}
              <button type="submit" className="btn btn-primary" disabled={!isComplete || submitting}>
                {submitting ? 'Saving…' : questionnaireId ? 'Save changes & return to photos' : 'Continue to photos'}
              </button>
            </div>

            {/* A disabled control should state its requirement, not just refuse. */}
            {!isComplete && !submitting && (
              <p className="questionnaire-form__requirement" role="status">
                {!durationOfSymptom && unanswered > 0
                  ? `Select a duration and answer ${unanswered} more question${unanswered === 1 ? '' : 's'} to continue.`
                  : !durationOfSymptom
                    ? 'Select how long you’ve noticed this to continue.'
                    : `Answer ${unanswered} more question${unanswered === 1 ? '' : 's'} to continue.`}
              </p>
            )}
          </form>
        </div>
      </PageTransition>
    </AppShell>
  );
}
