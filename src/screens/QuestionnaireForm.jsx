import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import AppShell from '../components/layout/AppShell';
import ErrorState from '../components/shared/ErrorState';
import LoadingState from '../components/shared/LoadingState';
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

const TOGGLES = [
  { key: 'pain', label: 'Pain' },
  { key: 'bleeding', label: 'Bleeding' },
  { key: 'difficultySwallowingChewing', label: 'Difficulty swallowing or chewing' },
  { key: 'tobaccoUse', label: 'Tobacco use' },
  { key: 'alcoholUse', label: 'Alcohol use' },
  { key: 'paanUse', label: 'Paan / gutkha use' },
];

export default function QuestionnaireForm() {
  const navigate = useNavigate();
  const { questionnaireId } = useParams();
  const { patient } = usePatient();

  const [durationOfSymptom, setDurationOfSymptom] = useState('');
  const [toggles, setToggles] = useState(
    Object.fromEntries(TOGGLES.map(({ key }) => [key, false]))
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
        setToggles(Object.fromEntries(
          TOGGLES.map(({ key }) => [key, Boolean(questionnaire[key])])
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

  function toggle(key) {
    setToggles((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  const isComplete = Boolean(durationOfSymptom);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!isComplete) return;
    setError(null);
    setErrorSource(null);
    setSubmitting(true);
    try {
      const data = {
        durationOfSymptom,
        ...toggles,
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
        <LoadingState message="Loading your answers…" />
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

          <div className="card questionnaire-form__toggles">
            {TOGGLES.map((t) => (
              <div className="toggle-row" key={t.key}>
                <span>{t.label}</span>
                <label className="switch">
                  <input
                    type="checkbox"
                    checked={toggles[t.key]}
                    onChange={() => toggle(t.key)}
                  />
                  <span className="track" />
                  <span className="thumb" />
                </label>
              </div>
            ))}
          </div>

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
        </form>
      </div>
    </AppShell>
  );
}
