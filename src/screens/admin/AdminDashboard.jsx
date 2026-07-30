import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ApiError, api } from '../../api/client';
import PageTransition from '../../components/shared/PageTransition';
import ErrorState from '../../components/shared/ErrorState';
import { QueueSkeleton } from '../../components/shared/Skeleton';
import { useToast } from '../../components/shared/Toast';
import oralscreenLogo from '../../assets/oralscreen_icon.jpg';
import './AdminDashboard.css';

function extractDoctorsList(payload) {
  if (Array.isArray(payload)) return payload;
  for (const key of ['content', 'doctors', 'data', 'items']) {
    if (Array.isArray(payload?.[key])) return payload[key];
  }
  return [];
}

function formatDate(timestamp) {
  if (!timestamp) return 'N/A';
  try {
    const d = new Date(timestamp);
    if (isNaN(d.getTime())) return String(timestamp);
    return new Intl.DateTimeFormat('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(d);
  } catch (_) {
    return String(timestamp);
  }
}

function getInitials(name) {
  if (!name) return 'DR';
  const parts = name.replace(/^dr\.?\s+/i, '').trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return (parts[0]?.substring(0, 2) || 'DR').toUpperCase();
}

export default function AdminDashboard() {
  const navigate = useNavigate();
  const toast = useToast();

  const adminKey = import.meta.env.VITE_ADMIN_KEY || '';

  const [doctors, setDoctors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [approvingIds, setApprovingIds] = useState(new Set());

  const loadPendingDoctors = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const payload = await api.getPendingDoctors(adminKey);
      const list = extractDoctorsList(payload);
      setDoctors(list);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [adminKey]);

  useEffect(() => {
    loadPendingDoctors();
  }, [loadPendingDoctors]);

  const handleApprove = async (doctor) => {
    if (!doctor.id || approvingIds.has(doctor.id)) return;

    setApprovingIds((prev) => new Set(prev).add(doctor.id));

    try {
      await api.approveDoctor(doctor.id, adminKey);
      toast.success(`Approved ${doctor.name || 'Doctor'}`);
      setDoctors((prev) => prev.filter((d) => d.id !== doctor.id));
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Failed to approve doctor';
      toast.error(msg);
    } finally {
      setApprovingIds((prev) => {
        const next = new Set(prev);
        next.delete(doctor.id);
        return next;
      });
    }
  };

  return (
    <div className="admin-shell">
      <header className="admin-shell__header">
        <div className="admin-shell__brand" onClick={() => navigate('/')} role="button" tabIndex={0}>
          <img src={oralscreenLogo} alt="OralScreen" className="admin-shell__logo" />
          <div className="admin-shell__title-group">
            <span className="admin-shell__title">OralScreen</span>
            <span className="admin-shell__badge">Admin Console</span>
          </div>
        </div>
      </header>

      <main className="admin-main">
        <PageTransition>
          <div className="admin-dashboard__heading">
            <div>
              <p className="admin-dashboard__eyebrow">Medical Practitioner Approval</p>
              <h1>Pending Doctors</h1>
            </div>
            <div className="admin-dashboard__header-right">
              {!loading && !error && (
                <span className="admin-dashboard__count-badge">
                  {doctors.length} {doctors.length === 1 ? 'Pending Request' : 'Pending Requests'}
                </span>
              )}
              <button
                type="button"
                className={`admin-refresh-btn ${loading ? 'is-loading' : ''}`}
                onClick={loadPendingDoctors}
                disabled={loading}
                aria-label="Refresh doctor list"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              </button>
            </div>
          </div>

          {loading && <QueueSkeleton />}

          {error && (
            <div className="admin-state">
              <ErrorState
                title="Could not fetch pending doctors"
                message={error instanceof ApiError ? error.message : 'Failed to connect to backend server.'}
                onRetry={loadPendingDoctors}
              />
            </div>
          )}

          {!loading && !error && doctors.length === 0 && (
            <div className="admin-empty">
              <div className="admin-empty__icon-wrapper">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h2>All Caught Up!</h2>
              <p>There are currently no doctors waiting for registration approval.</p>
            </div>
          )}

          {!loading && !error && doctors.length > 0 && (
            <div className="admin-doctor-grid">
              {doctors.map((doctor) => {
                const isApproving = approvingIds.has(doctor.id);
                return (
                  <div key={doctor.id || doctor.registrationId} className="admin-doctor-card">
                    <div className="admin-doctor-card__header">
                      <div className="admin-doctor-card__avatar">
                        {getInitials(doctor.name)}
                      </div>
                      <div className="admin-doctor-card__identity">
                        <h3>{doctor.name || 'Unnamed Doctor'}</h3>
                        <span className="admin-doctor-card__status-pill">
                          Pending Approval
                        </span>
                      </div>
                    </div>

                    <div className="admin-doctor-card__details">
                      <div className="admin-doctor-card__detail-item">
                        <span className="admin-doctor-card__label">Phone Number</span>
                        <span className="admin-doctor-card__value">{doctor.phoneNumber || 'N/A'}</span>
                      </div>

                      <div className="admin-doctor-card__detail-item">
                        <span className="admin-doctor-card__label">Medical Registration ID</span>
                        <span className="admin-doctor-card__value admin-doctor-card__code">
                          {doctor.registrationId || 'N/A'}
                        </span>
                      </div>

                      <div className="admin-doctor-card__detail-item">
                        <span className="admin-doctor-card__label">Registration Date</span>
                        <span className="admin-doctor-card__value">
                          {formatDate(doctor.createdAt)}
                        </span>
                      </div>
                    </div>

                    <div className="admin-doctor-card__footer">
                      <button
                        type="button"
                        className="admin-btn admin-btn--approve"
                        onClick={() => handleApprove(doctor)}
                        disabled={isApproving}
                      >
                        {isApproving ? (
                          <>
                            <span className="admin-btn__spinner" />
                            Approving...
                          </>
                        ) : (
                          <>
                            <svg className="admin-btn__icon" viewBox="0 0 20 20" fill="currentColor">
                              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                            </svg>
                            Approve Doctor
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </PageTransition>
      </main>
    </div>
  );
}
