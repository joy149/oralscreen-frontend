import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PlusCircle, ChevronRight, Hourglass } from 'lucide-react';
import AppShell from '../components/layout/AppShell';
import PageTransition from '../components/shared/PageTransition';
import Skeleton from '../components/shared/Skeleton';
import { api } from '../api/client';
import { usePatient } from '../context/PatientContext';
import useSessionRecovery from '../hooks/useSessionRecovery';
import relativeTime from '../utils/relativeTime';
import { assessmentItems, byNewestFirst } from '../utils/assessments';
import './PatientHome.css';

const RECENT_LIMIT = 3;

function firstName(name) {
  const trimmed = (name || '').trim();
  return trimmed ? trimmed.split(/\s+/)[0] : '';
}

function RecentSkeleton() {
  return (
    <div className="patient-home__list" aria-label="Loading your screenings" role="status">
      {Array.from({ length: 2 }).map((_, i) => (
        <div className="card patient-home__row" key={i}>
          <div className="patient-home__row-main">
            <Skeleton width="45%" height={15} />
            <Skeleton width="60%" height={12} style={{ marginTop: 8 }} />
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * What a signed-in patient lands on at `/`.
 *
 * <p>Before this screen existed, `/` was the sign-in form unconditionally: a patient who
 * had never been signed out reopened the app to a marketing hero and a "Send Verification
 * OTP" button, and re-did the whole SMS round trip to reach an app they were already
 * authenticated against. History and profile lived only behind the avatar dropdown, so the
 * single most common reason to return — "has my dentist looked at it yet?" — had no
 * answer anywhere on screen.
 *
 * <p>Deliberately not a dashboard. This is an occasional-use screening tool, so charts and
 * stat tiles would render mostly empty; and an AI risk tier on the front page would hand a
 * patient an unreviewed verdict out of context, undoing the care `AssessmentPending` takes
 * in sequencing it. Rows here carry review *status* only — the tier stays one tap deeper,
 * on `/assessments`, where opening it is a choice.
 *
 * <p>No `!patient` redirect guard, unlike the other patient screens: `/` itself chooses
 * between this and the public `Landing` page on exactly that condition (see App.jsx), so a
 * `<Navigate to="/">` here would be a loop. Logging out re-renders `/` as the landing page.
 */
export default function PatientHome() {
  const navigate = useNavigate();
  const { patient } = usePatient();
  const handleAuthError = useSessionRecovery();

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  const loadAssessments = useCallback(async () => {
    if (!patient) return;
    setLoading(true);
    setFailed(false);
    try {
      const payload = await api.getPatientAssessments(patient.id);
      setItems(byNewestFirst(assessmentItems(payload)));
    } catch (err) {
      // A dead session surfaces here now rather than three taps in, which is the point of
      // fetching on the landing screen at all.
      if (!handleAuthError(err)) setFailed(true);
    } finally {
      setLoading(false);
    }
  }, [handleAuthError, patient]);

  useEffect(() => { loadAssessments(); }, [loadAssessments]);

  const name = firstName(patient?.name);
  const recent = items.slice(0, RECENT_LIMIT);
  // The newest screening still waiting on a dentist — the thing most patients opened the
  // app to check. `items` is newest-first, so the first match is the one to surface.
  const awaiting = items.find((assessment) => !assessment.doctorRiskClassification);

  return (
    <AppShell>
      <PageTransition>
        <div className="screen patient-home">
          <div className="patient-home__greeting">
            <h1>{name ? `Hello, ${name}` : 'Hello'}</h1>
            <p>Screenings take about two minutes, and a licensed dentist reviews every one.</p>
          </div>

          {/* The dominant element on the screen on purpose. Landing here instead of going
              straight to the questionnaire costs a returning patient one tap; making the
              start action anything less than the largest thing on the page would make that
              trade a bad one. */}
          <button
            type="button"
            className="patient-home__cta"
            onClick={() => navigate('/questionnaire')}
          >
            <span className="patient-home__cta-icon" aria-hidden="true">
              <PlusCircle size={22} />
            </span>
            <span className="patient-home__cta-text">
              <strong>Start a new screening</strong>
              <small>Answer a few questions and share a photo</small>
            </span>
            <ChevronRight size={18} className="patient-home__cta-chevron" aria-hidden="true" />
          </button>

          {awaiting && (
            <button
              type="button"
              className="card patient-home__awaiting"
              onClick={() => navigate(`/assessments/${awaiting.id}`)}
            >
              <span className="patient-home__awaiting-icon" aria-hidden="true">
                <Hourglass size={18} />
              </span>
              <span className="patient-home__awaiting-text">
                <strong>With your dentist now</strong>
                {/* No turnaround promise here: nothing in the app can hold the clinic to
                    one, and a missed estimate on a health result costs more trust than the
                    vagueness does. */}
                <small>Submitted {relativeTime(awaiting.createdAt)} · we'll show the result here</small>
              </span>
              <ChevronRight size={18} aria-hidden="true" />
            </button>
          )}

          <section className="patient-home__recent">
            <div className="patient-home__recent-head">
              <h2>Your screenings</h2>
              {items.length > RECENT_LIMIT && (
                <button
                  type="button"
                  className="patient-home__see-all"
                  onClick={() => navigate('/assessments')}
                >
                  See all {items.length}
                </button>
              )}
            </div>

            {loading && <RecentSkeleton />}

            {/* Deliberately quiet, and scoped to this section. The history failing to load
                must not take the start button down with it — that is the one thing on this
                screen that works without the network having cooperated. */}
            {!loading && failed && (
              <div className="card patient-home__notice">
                <p>We couldn't load your screening history just now.</p>
                <button type="button" className="btn btn-secondary" onClick={loadAssessments}>
                  Try again
                </button>
              </div>
            )}

            {!loading && !failed && recent.length === 0 && (
              <p className="patient-home__empty">
                Nothing here yet — your screenings and your dentist's review will appear on
                this page once you've completed one.
              </p>
            )}

            {!loading && !failed && recent.length > 0 && (
              <div className="patient-home__list">
                {recent.map((assessment) => {
                  const reviewed = Boolean(assessment.doctorRiskClassification);
                  return (
                    <button
                      type="button"
                      key={assessment.id}
                      className="card patient-home__row"
                      onClick={() => navigate(`/assessments/${assessment.id}`)}
                    >
                      <span className="patient-home__row-main">
                        <strong>{relativeTime(assessment.createdAt)}</strong>
                        <span className={reviewed ? 'is-reviewed' : 'is-awaiting'}>
                          <span className="status-dot" aria-hidden="true" />
                          {reviewed ? 'Reviewed by doctor' : 'Awaiting doctor review'}
                        </span>
                      </span>
                      <ChevronRight size={18} aria-hidden="true" />
                    </button>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      </PageTransition>
    </AppShell>
  );
}
