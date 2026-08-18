import { useCallback, useEffect, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import AppShell from '../components/layout/AppShell';
import PageTransition from '../components/shared/PageTransition';
import ErrorState from '../components/shared/ErrorState';
import Skeleton from '../components/shared/Skeleton';
import RiskTier from '../components/doctor/RiskTier';
import { api } from '../api/client';
import { usePatient } from '../context/PatientContext';
import useSessionRecovery from '../hooks/useSessionRecovery';
import relativeTime from '../utils/relativeTime';
import { assessmentItems, byNewestFirst } from '../utils/assessments';
import './PastAssessments.css';

function ListSkeleton() {
  return (
    <div className="past-assessments__list" aria-label="Loading past assessments" role="status">
      {Array.from({ length: 3 }).map((_, i) => (
        <div className="card past-assessments__row" key={i}>
          <div className="past-assessments__row-main">
            <Skeleton width="50%" height={16} />
            <Skeleton width="35%" height={12} style={{ marginTop: 8 }} />
          </div>
          <Skeleton width={72} height={24} rounded />
        </div>
      ))}
    </div>
  );
}

export default function PastAssessments() {
  const navigate = useNavigate();
  const { patient } = usePatient();
  const handleAuthError = useSessionRecovery();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadAssessments = useCallback(async () => {
    if (!patient) return;
    setLoading(true);
    setError(null);
    try {
      const payload = await api.getPatientAssessments(patient.id);
      // Same ordering as the home screen's recent rows. Left to the endpoint's own order,
      // the two could disagree about which screening is the latest.
      setItems(byNewestFirst(assessmentItems(payload)));
    } catch (err) {
      if (!handleAuthError(err)) setError(err);
    } finally {
      setLoading(false);
    }
  }, [handleAuthError, patient]);

  useEffect(() => { loadAssessments(); }, [loadAssessments]);

  // Redirect as a render result, not as a side effect during render — calling navigate()
  // inline updates the router while this component is still rendering, which React warns
  // about and which double-invokes under StrictMode.
  if (!patient) {
    return <Navigate to="/start" replace />;
  }

  // Explicit `back` path for the same reason as PatientProfile — and here history-back was
  // worse: arriving from a result detail, which itself backs out to this list, made "back"
  // return to the screen the patient had just left.
  return (
    <AppShell back="/" title="Past assessments">
      <PageTransition>
        <div className="screen past-assessments">
          <div className="past-assessments__intro">
            <p>Every screening you've submitted, and your doctor's review once it's in.</p>
          </div>

          {loading && <ListSkeleton />}

          {!loading && error && (
            <ErrorState
              title="Assessments unavailable"
              message="We couldn't load your assessment history."
              onRetry={loadAssessments}
            />
          )}

          {!loading && !error && items.length === 0 && (
            <div className="card past-assessments__empty">
              <h2>No assessments yet</h2>
              <p>Once you complete a screening, it will show up here.</p>
              <button type="button" className="btn btn-primary" onClick={() => navigate('/questionnaire')}>
                Start a screening
              </button>
            </div>
          )}

          {!loading && !error && items.length > 0 && (
            <div className="past-assessments__list">
              {items.map((assessment) => {
                const reviewed = Boolean(assessment.doctorRiskClassification);
                return (
                  <button
                    type="button"
                    key={assessment.id}
                    className="card past-assessments__row"
                    onClick={() => navigate(`/assessments/${assessment.id}`)}
                  >
                    <div className="past-assessments__row-main">
                      <strong>{relativeTime(assessment.createdAt)}</strong>
                      <span className={reviewed ? 'is-reviewed' : 'is-awaiting'}>
                        <span className="status-dot" aria-hidden="true" />
                        {reviewed ? 'Reviewed by doctor' : 'Awaiting doctor review'}
                      </span>
                    </div>
                    <RiskTier classification={assessment.aiRiskClassification} />
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </PageTransition>
    </AppShell>
  );
}
