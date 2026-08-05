import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import AppShell from '../components/layout/AppShell';
import PageTransition from '../components/shared/PageTransition';
import ErrorState from '../components/shared/ErrorState';
import Skeleton from '../components/shared/Skeleton';
import RiskTier from '../components/doctor/RiskTier';
import { api } from '../api/client';
import { usePatient } from '../context/PatientContext';
import './PastAssessments.css';

function relativeTime(value) {
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return 'Unknown date';
  const seconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if (seconds < 60) return 'Just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
  return new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }).format(timestamp);
}

// A response that isn't a bare array (e.g. wrapped in { content: [...] }) shouldn't
// crash the list — normalize defensively, mirroring DoctorQueue's queueItems().
function assessmentItems(payload) {
  if (Array.isArray(payload)) return payload;
  for (const key of ['content', 'assessments', 'data']) {
    if (Array.isArray(payload?.[key])) return payload[key];
  }
  return [];
}

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
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadAssessments = useCallback(async () => {
    if (!patient) return;
    setLoading(true);
    setError(null);
    try {
      const payload = await api.getPatientAssessments(patient.id);
      setItems(assessmentItems(payload));
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [patient]);

  useEffect(() => { loadAssessments(); }, [loadAssessments]);

  if (!patient) {
    navigate('/');
    return null;
  }

  return (
    <AppShell back title="Past assessments">
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
