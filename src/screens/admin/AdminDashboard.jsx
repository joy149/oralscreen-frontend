import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ApiError, api } from '../../api/client';
import PageTransition from '../../components/shared/PageTransition';
import ErrorState from '../../components/shared/ErrorState';
import { QueueSkeleton } from '../../components/shared/Skeleton';
import { useToast } from '../../components/shared/Toast';
import { RefreshCw, CheckCircle2, UserCheck, TrendingUp, ShieldAlert, Clock, Lock, LogOut } from 'lucide-react';
import { readAdminKey, saveAdminKey, clearAdminKey } from '../../config/adminKey';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js';
import { Line, Doughnut } from 'react-chartjs-2';
import oralscreenLogo from '../../assets/oralscreen-mark.png';
import './AdminDashboard.css';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

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

const RISK_LABELS = {
  NO_MILD_RISK: 'No / mild risk',
  MODERATE_RISK: 'Moderate risk',
  HIGH_RISK: 'High risk',
};

const RISK_COLORS = {
  NO_MILD_RISK: '#5b8c6e',
  MODERATE_RISK: '#c98a2c',
  HIGH_RISK: '#b8433a',
};

// Weekday initials for the volume chart. The API returns ISO dates; showing the day name
// beats showing seven identical-looking dates.
function dayLabel(isoDate) {
  const parsed = new Date(`${isoDate}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return isoDate;
  return new Intl.DateTimeFormat('en-IN', { weekday: 'short' }).format(parsed);
}

function formatReviewTime(minutes) {
  if (minutes == null) return null;
  if (minutes < 60) return `${Math.round(minutes)} min`;
  const hours = minutes / 60;
  if (hours < 24) return `${hours.toFixed(1)} hr`;
  return `${(hours / 24).toFixed(1)} days`;
}

export default function AdminDashboard() {
  const navigate = useNavigate();
  const toast = useToast();

  // Typed at runtime, never compiled into the bundle. See src/config/adminKey.js.
  const [adminKey, setAdminKey] = useState(readAdminKey);
  const [keyInput, setKeyInput] = useState('');
  const [unlockError, setUnlockError] = useState('');

  const [doctors, setDoctors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [approvingIds, setApprovingIds] = useState(new Set());
  const [metrics, setMetrics] = useState(null);
  const [metricsError, setMetricsError] = useState(false);

  // Every number below comes from /api/admin/metrics. These charts used to be drawn from
  // literals in this file — a screening curve and a risk split that were made up, and a
  // "14.2 min" triage time — while the real metrics endpoint went uncalled.
  const dailyVolume = metrics?.dailyVolume || [];
  const riskDistribution = metrics?.riskDistribution || {};
  const hasVolume = dailyVolume.some((day) => day.count > 0);
  const hasRiskData = Object.values(riskDistribution).some((count) => count > 0);
  const averageReviewTime = formatReviewTime(metrics?.averageReviewMinutes);

  const lineChartData = {
    labels: dailyVolume.map((day) => dayLabel(day.date)),
    datasets: [
      {
        label: 'Screenings Completed',
        data: dailyVolume.map((day) => day.count),
        borderColor: '#1f6f6b',
        backgroundColor: 'rgba(31, 111, 107, 0.12)',
        fill: true,
        tension: 0.4,
      },
    ],
  };

  const riskKeys = Object.keys(RISK_LABELS).filter((key) => key in riskDistribution);
  const doughnutChartData = {
    labels: riskKeys.map((key) => RISK_LABELS[key]),
    datasets: [
      {
        data: riskKeys.map((key) => riskDistribution[key] || 0),
        backgroundColor: riskKeys.map((key) => RISK_COLORS[key]),
        borderWidth: 0,
      },
    ],
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        labels: {
          color: '#111c1e',
          font: { family: 'Noto Sans', size: 12 },
        },
      },
    },
    scales: {
      x: {
        grid: { display: false },
        ticks: { color: '#546669' },
      },
      y: {
        // Whole screenings only — a "2.5 screenings" gridline is nonsense, and at pilot
        // volume the default tick step produces exactly that.
        beginAtZero: true,
        grid: { color: 'rgba(0,0,0,0.06)' },
        ticks: { color: '#546669', precision: 0 },
      },
    },
  };

  const loadPendingDoctors = useCallback(async () => {
    if (!adminKey) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);

    // Metrics are decorative relative to the approval queue, so they load alongside it and
    // fail on their own: a metrics outage should not hide the doctors waiting for approval.
    api.getAdminMetrics(adminKey)
      .then((payload) => { setMetrics(payload); setMetricsError(false); })
      .catch(() => { setMetrics(null); setMetricsError(true); });

    try {
      const payload = await api.getPendingDoctors(adminKey);
      setDoctors(extractDoctorsList(payload));
    } catch (err) {
      // A rejected key is not a page error — send the admin back to the unlock form, showing
      // the server's own message. Anything else (including a 503 for an unconfigured
      // ADMIN_API_KEY) is a server-side problem: keep the key, show the message as-is.
      if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
        clearAdminKey();
        setAdminKey('');
        setUnlockError(err.message || 'That key was rejected.');
      } else {
        setError(err);
      }
    } finally {
      setLoading(false);
    }
  }, [adminKey]);

  useEffect(() => {
    loadPendingDoctors();
  }, [loadPendingDoctors]);

  const handleUnlock = (event) => {
    event.preventDefault();
    const key = keyInput.trim();
    if (!key) return;
    saveAdminKey(key);
    setAdminKey(key);
    setKeyInput('');
    setUnlockError('');
  };

  const handleLock = () => {
    clearAdminKey();
    setAdminKey('');
    setDoctors([]);
    setUnlockError('');
  };

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

  const header = (
    <header className="admin-shell__header">
      <div className="admin-shell__brand" onClick={() => navigate('/')} role="button" tabIndex={0}>
        <img src={oralscreenLogo} alt="OralScreen" className="admin-shell__logo" />
        <div className="admin-shell__title-group">
          <span className="admin-shell__title">OralScreen</span>
          <span className="admin-shell__badge">Admin Console</span>
        </div>
      </div>
      {adminKey && (
        <button type="button" className="admin-refresh-btn" onClick={handleLock} aria-label="Lock console">
          <LogOut size={18} />
        </button>
      )}
    </header>
  );

  // Nothing loads — and nothing is revealed — until a key is supplied. The key is the gate;
  // the backend enforces it, this form just collects it.
  if (!adminKey) {
    return (
      <div className="admin-shell">
        {header}
        <main className="admin-main">
          <PageTransition>
            <div className="admin-empty">
              <div className="admin-empty__icon-wrapper">
                <Lock size={40} />
              </div>
              <h2>Admin key required</h2>
              <p>Enter the admin API key to manage doctor approvals.</p>
              <form onSubmit={handleUnlock} className="admin-unlock-form">
                <input
                  type="password"
                  value={keyInput}
                  onChange={(e) => setKeyInput(e.target.value)}
                  placeholder="Admin API key"
                  autoComplete="off"
                  aria-label="Admin API key"
                  autoFocus
                />
                <button type="submit" className="admin-btn admin-btn--approve" disabled={!keyInput.trim()}>
                  Unlock
                </button>
              </form>
              {unlockError && <p className="error-text">{unlockError}</p>}
            </div>
          </PageTransition>
        </main>
      </div>
    );
  }

  return (
    <div className="admin-shell">
      {header}

      <main className="admin-main">
        <PageTransition>
          {/* Analytics Overview Charts */}
          <section className="admin-analytics" aria-label="Screening Analytics Overview">
            <div className="admin-analytics__grid">
              <div className="admin-analytics__card">
                <div className="admin-analytics__card-header">
                  <TrendingUp size={18} className="admin-analytics__icon" />
                  <h3>Weekly Screening Volume</h3>
                </div>
                <div className="admin-analytics__chart-wrapper">
                  {hasVolume ? (
                    <Line data={lineChartData} options={chartOptions} />
                  ) : (
                    <p className="admin-analytics__no-data">
                      {metricsError ? 'Metrics unavailable' : 'No screenings in the last 7 days'}
                    </p>
                  )}
                </div>
              </div>

              <div className="admin-analytics__card">
                <div className="admin-analytics__card-header">
                  <ShieldAlert size={18} className="admin-analytics__icon" />
                  <h3>Risk Level Breakdown</h3>
                </div>
                <div className="admin-analytics__chart-wrapper admin-analytics__chart-wrapper--donut">
                  {!hasRiskData ? (
                    <p className="admin-analytics__no-data">
                      {metricsError ? 'Metrics unavailable' : 'No assessments yet'}
                    </p>
                  ) : (
                  <Doughnut
                    data={doughnutChartData}
                    options={{
                      responsive: true,
                      maintainAspectRatio: false,
                      plugins: {
                        legend: {
                          position: 'bottom',
                          labels: {
                            color: '#111c1e',
                            font: { family: 'Noto Sans', size: 11 },
                          },
                        },
                      },
                    }}
                  />
                  )}
                </div>
              </div>

              <div className="admin-analytics__card admin-analytics__card--stat">
                <div className="admin-analytics__card-header">
                  <Clock size={18} className="admin-analytics__icon" />
                  <h3>Doctor Triage Speed</h3>
                </div>
                <div className="admin-analytics__stat-value">
                  {averageReviewTime || '—'}
                </div>
                <p className="admin-analytics__stat-note">
                  {averageReviewTime
                    ? 'Avg time from submission to doctor review'
                    : 'No reviewed screenings yet'}
                </p>
                {metrics && (
                  <p className="admin-analytics__stat-note">
                    {metrics.pendingReview} of {metrics.totalAssessments} awaiting review
                  </p>
                )}
              </div>
            </div>
          </section>

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
                <RefreshCw size={18} />
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
                <CheckCircle2 size={40} />
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
                        aria-label={`Approve ${doctor.name || 'doctor'}`}
                      >
                        {isApproving ? (
                          <>
                            <span className="admin-btn__spinner" />
                            Approving...
                          </>
                        ) : (
                          <>
                            <UserCheck size={18} className="admin-btn__icon" />
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
