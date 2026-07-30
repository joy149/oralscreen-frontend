import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ApiError, api } from '../../api/client';
import DoctorShell from '../../components/doctor/DoctorShell';
import RiskTier from '../../components/doctor/RiskTier';
import ErrorState from '../../components/shared/ErrorState';
import { QueueSkeleton } from '../../components/shared/Skeleton';
import PageTransition from '../../components/shared/PageTransition';
import { useDoctorSession } from '../../context/DoctorSessionContext';
import './DoctorQueue.css';

const RISK_OPTIONS = [
  { value: 'HIGH_RISK', label: 'High' },
  { value: 'MODERATE_RISK', label: 'Moderate' },
  { value: 'NO_MILD_RISK', label: 'No / mild' },
];

const STATUS_OPTIONS = [
  { value: 'AWAITING', label: 'Awaiting review' },
  { value: 'REVIEWED', label: 'Reviewed' },
];

// All three comparators return a plain ascending order; direction is applied
// separately via dirFactor. patient/risk are lexicographic (string compare),
// submitted is chronological (timestamp compare) — not a severity ranking.
const SORT_COMPARATORS = {
  submitted: (a, b) => new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime(),
  risk: (a, b) => (a.aiRiskClassification || '').localeCompare(b.aiRiskClassification || ''),
  patient: (a, b) => (a.name || a.patientName || '').localeCompare(b.name || b.patientName || ''),
};

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

function SortableHeader({ label, sortKey, activeSort, activeDir, onSort, className }) {
  const isActive = activeSort === sortKey;
  return (
    <span
      role="columnheader"
      className={className}
      aria-sort={isActive ? (activeDir === 'asc' ? 'ascending' : 'descending') : 'none'}
    >
      <button
        type="button"
        className={`doctor-queue__sort-btn${isActive ? ' is-active' : ''}`}
        onClick={() => onSort(sortKey)}
      >
        {label}
        <span className="doctor-queue__sort-icon" aria-hidden="true">
          {isActive ? (activeDir === 'asc' ? '\u2191' : '\u2193') : '\u2195'}
        </span>
      </button>
    </span>
  );
}

export default function DoctorQueue() {
  const navigate = useNavigate();
  const { session, endSession } = useDoctorSession();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [riskFilter, setRiskFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  // Sort key + direction live in one object so toggling is a single,
  // unambiguous state transition — no nested setState calls.
  const [sort, setSort] = useState({ key: 'submitted', dir: 'asc' });

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

  const riskCounts = useMemo(() => {
    const counts = { HIGH_RISK: 0, MODERATE_RISK: 0, NO_MILD_RISK: 0 };
    for (const item of items) {
      if (counts[item.aiRiskClassification] != null) counts[item.aiRiskClassification] += 1;
    }
    return counts;
  }, [items]);

  const statusCounts = useMemo(() => {
    const counts = { AWAITING: 0, REVIEWED: 0 };
    for (const item of items) {
      if (item.doctorRiskClassification) counts.REVIEWED += 1;
      else counts.AWAITING += 1;
    }
    return counts;
  }, [items]);

  const visibleItems = useMemo(() => {
    const filtered = items.filter((item) => {
      const matchesRisk = riskFilter === 'ALL' || item.aiRiskClassification === riskFilter;
      const reviewed = Boolean(item.doctorRiskClassification);
      const matchesStatus =
        statusFilter === 'ALL' ||
        (statusFilter === 'REVIEWED' ? reviewed : !reviewed);
      return matchesRisk && matchesStatus;
    });
    const comparator = SORT_COMPARATORS[sort.key] || SORT_COMPARATORS.submitted;
    const dirFactor = sort.dir === 'asc' ? 1 : -1;
    return [...filtered].sort((a, b) => comparator(a, b) * dirFactor);
  }, [items, riskFilter, statusFilter, sort]);

  const filtersActive = riskFilter !== 'ALL' || statusFilter !== 'ALL';

  const handleSort = useCallback((key) => {
    setSort((prev) => (
      prev.key === key
        ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
        : { key, dir: 'asc' }
    ));
  }, []);

  const clearFilters = useCallback(() => {
    setRiskFilter('ALL');
    setStatusFilter('ALL');
  }, []);

  const [focusedIndex, setFocusedIndex] = useState(-1);

  useEffect(() => {
    function handleKeyDown(e) {
      if (['input', 'textarea', 'select'].includes(document.activeElement?.tagName?.toLowerCase())) return;
      if (visibleItems.length === 0) return;

      if (e.key === 'j' || e.key === 'ArrowDown') {
        e.preventDefault();
        setFocusedIndex((prev) => Math.min(prev + 1, visibleItems.length - 1));
      } else if (e.key === 'k' || e.key === 'ArrowUp') {
        e.preventDefault();
        setFocusedIndex((prev) => Math.max(prev - 1, 0));
      } else if (e.key === 'Enter' && focusedIndex >= 0 && visibleItems[focusedIndex]) {
        e.preventDefault();
        const target = visibleItems[focusedIndex];
        const caseId = target.id || target.assessmentId;
        if (caseId) navigate(`/doctor/case/${caseId}`);
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [visibleItems, focusedIndex, navigate]);

  return (
    <DoctorShell>
      <PageTransition>
        <div className="doctor-queue__heading">
          <div>
            <p>Review workspace</p>
            <h1>Screening queue</h1>
          </div>
          {!loading && !error && (
            <span>
              {filtersActive ? `${visibleItems.length} of ${items.length}` : items.length}{' '}
              {items.length === 1 ? 'case' : 'cases'}
            </span>
          )}
        </div>

        {!loading && !error && items.length > 0 && (
          <div className="doctor-queue__toolbar">
            <div className="doctor-queue__filter-group" role="group" aria-label="Filter by risk">
              <button
                type="button"
                className={`doctor-queue__pill${riskFilter === 'ALL' ? ' is-active' : ''}`}
                onClick={() => setRiskFilter('ALL')}
              >
                All risk
              </button>
              {RISK_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={`doctor-queue__pill${riskFilter === option.value ? ' is-active' : ''}`}
                  onClick={() => setRiskFilter(riskFilter === option.value ? 'ALL' : option.value)}
                >
                  <span className={`doctor-queue__pill-dot doctor-queue__pill-dot--${option.value}`} aria-hidden="true" />
                  {option.label}
                  <span className="doctor-queue__pill-count">{riskCounts[option.value] ?? 0}</span>
                </button>
              ))}
            </div>

            <div className="doctor-queue__filter-group" role="group" aria-label="Filter by status">
              {STATUS_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={`doctor-queue__pill${statusFilter === option.value ? ' is-active' : ''}`}
                  onClick={() => setStatusFilter(statusFilter === option.value ? 'ALL' : option.value)}
                >
                  {option.label}
                  <span className="doctor-queue__pill-count">{statusCounts[option.value] ?? 0}</span>
                </button>
              ))}
            </div>

            {filtersActive && (
              <button type="button" className="doctor-queue__clear" onClick={clearFilters}>
                Clear filters
              </button>
            )}
          </div>
        )}

        {loading && <QueueSkeleton />}
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

        {!loading && !error && items.length > 0 && visibleItems.length === 0 && (
          <div className="doctor-queue__empty">
            <h2>No cases match these filters</h2>
            <p>Try a different risk or status filter.</p>
            <button type="button" className="doctor-queue__clear" onClick={clearFilters}>
              Clear filters
            </button>
          </div>
        )}

        {!loading && !error && visibleItems.length > 0 && (
          <div className="doctor-queue__table" role="table" aria-label="Screening cases">
            <div className="doctor-queue__row doctor-queue__row--header" role="row">
              <SortableHeader
                label="Patient"
                sortKey="patient"
                activeSort={sort.key}
                activeDir={sort.dir}
                onSort={handleSort}
              />
              <SortableHeader
                label="Submitted"
                sortKey="submitted"
                activeSort={sort.key}
                activeDir={sort.dir}
                onSort={handleSort}
                className="doctor-queue__col--submitted"
              />
              <SortableHeader
                label="Risk"
                sortKey="risk"
                activeSort={sort.key}
                activeDir={sort.dir}
                onSort={handleSort}
                className="doctor-queue__col--risk"
              />
              <span role="columnheader">Status</span>
              <span aria-hidden="true" />
            </div>
            {visibleItems.map((assessment) => {
              const reviewed = Boolean(assessment.doctorRiskClassification);
              return (
                <button
                  type="button"
                  className="doctor-queue__row doctor-queue__row--case"
                  data-risk={assessment.aiRiskClassification}
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
                  <span
                    role="cell"
                    className="doctor-queue__col--submitted"
                    title={assessment.createdAt ? new Date(assessment.createdAt).toLocaleString() : ''}
                  >
                    {relativeTime(assessment.createdAt)}
                  </span>
                  <span role="cell" className="doctor-queue__col--risk">
                    <RiskTier classification={assessment.aiRiskClassification} />
                  </span>
                  <span role="cell" className={reviewed ? 'is-reviewed' : 'is-awaiting'}>
                    <span className="status-dot" aria-hidden="true" />
                    {reviewed ? 'Reviewed' : 'Awaiting review'}
                  </span>
                  <span className="doctor-queue__arrow" aria-hidden="true">&#8250;</span>
                </button>
              );
            })}
          </div>
        )}
      </PageTransition>
    </DoctorShell>
  );
}