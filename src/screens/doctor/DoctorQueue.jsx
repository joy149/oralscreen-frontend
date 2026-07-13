import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ApiError, api } from '../../api/client';
import DoctorShell from '../../components/doctor/DoctorShell';
import RiskTier from '../../components/doctor/RiskTier';
import ErrorState from '../../components/shared/ErrorState';
import LoadingState from '../../components/shared/LoadingState';
import { useDoctorSession } from '../../context/DoctorSessionContext';
import './DoctorQueue.css';

function queueItems(payload) {
  if (Array.isArray(payload)) return payload;
  for (const key of ['content', 'assessments', 'queue', 'data']) {
    if (Array.isArray(payload?.[key])) return payload[key];
  }
  return [];
}

function relativeTime(value) {
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return 'Unknown';
  const seconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if (seconds < 60) return 'Just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
  return new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short' }).format(timestamp);
}

export default function DoctorQueue() {
  const navigate = useNavigate();
  const { session, endSession } = useDoctorSession();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadQueue = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const payload = await api.getDoctorQueue(session.token);
      setItems(queueItems(payload));
    } catch (err) {
      if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
        endSession();
        navigate('/doctor/login', { replace: true });
        return;
      }
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [endSession, navigate, session.token]);

  useEffect(() => { loadQueue(); }, [loadQueue]);

  return (
    <DoctorShell>
      <div className="doctor-queue__heading">
        <div>
          <p>Review workspace</p>
          <h1>Screening queue</h1>
        </div>
        {!loading && !error && <span>{items.length} {items.length === 1 ? 'case' : 'cases'}</span>}
      </div>

      {loading && <LoadingState message="Loading screening cases..." />}
      {error && (
        <div className="doctor-queue__state">
          <ErrorState title="Queue unavailable" message="The screening queue could not be loaded." onRetry={loadQueue} />
        </div>
      )}

      {!loading && !error && items.length === 0 && (
        <div className="doctor-queue__empty">
          <h2>No cases waiting</h2>
          <p>New screening assessments will appear here.</p>
        </div>
      )}

      {!loading && !error && items.length > 0 && (
        <div className="doctor-queue__table" role="table" aria-label="Screening cases">
          <div className="doctor-queue__row doctor-queue__row--header" role="row">
            <span role="columnheader">Patient</span>
            <span role="columnheader">Submitted</span>
            <span role="columnheader">Risk</span>
            <span role="columnheader">Status</span>
            <span aria-hidden="true" />
          </div>
          {items.map((assessment) => {
            const reviewed = Boolean(assessment.doctorRiskClassification);
            return (
              <button
                type="button"
                className="doctor-queue__row doctor-queue__row--case"
                role="row"
                key={assessment.id}
                onClick={() => navigate(`/doctor/case/${assessment.id}`, {
                  state: { assessment },
                })}
              >
                <span className="doctor-queue__patient" role="cell">
                  <strong>{assessment.name || assessment.patientName || 'Unnamed patient'}</strong>
                  <small>{[assessment.patientAge != null ? `${assessment.patientAge} years` : null, assessment.patientSex?.replaceAll?.('_', ' ')].filter(Boolean).join(' / ') || 'Details unavailable'}</small>
                </span>
                <span role="cell" title={assessment.createdAt ? new Date(assessment.createdAt).toLocaleString() : ''}>{relativeTime(assessment.createdAt)}</span>
                <span role="cell"><RiskTier classification={assessment.aiRiskClassification} /></span>
                <span role="cell" className={reviewed ? 'is-reviewed' : 'is-awaiting'}>{reviewed ? 'Reviewed' : 'Awaiting review'}</span>
                <span className="doctor-queue__arrow" aria-hidden="true">&#8250;</span>
              </button>
            );
          })}
        </div>
      )}
    </DoctorShell>
  );
}
