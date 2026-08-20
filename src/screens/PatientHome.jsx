import { useCallback, useEffect, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { PlusCircle, ChevronRight } from 'lucide-react';
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

/**
 * The four stages a screening passes through, and how each one is known to be complete.
 *
 * <p>None of this needs a new endpoint. An assessment record cannot exist before the answers
 * and the photos are both in — `PhotoUpload` is what creates it, by calling
 * `triggerAssessment` after the uploads succeed — so the record's own existence is the
 * evidence for the first two stages. The last two are the two fields the list response
 * already carries and this screen already reads.
 *
 * <p>Only two of the four have a real timestamp behind them (`createdAt` and
 * `doctorReviewedAt`), so the others report their state in words rather than inventing a
 * time. Adding the missing two is a backend change this deliberately does not wait for.
 */
const STAGES = [
  { key: 'answers', label: 'Answers received' },
  { key: 'photos', label: 'Photos processed' },
  { key: 'ai', label: 'Initial AI assessment' },
  { key: 'doctor', label: 'Dentist review' },
];

function stageProgress(assessment) {
  const done = [
    true,
    true,
    Boolean(assessment.aiRiskClassification),
    Boolean(assessment.doctorRiskClassification),
  ];
  const at = [assessment.createdAt, null, null, assessment.doctorReviewedAt];
  // The stage in progress is the first incomplete one. There is always one: this rail only
  // renders for a screening that is not yet reviewed.
  const current = done.indexOf(false);
  return STAGES.map((stage, i) => ({
    ...stage,
    done: done[i],
    current: i === current,
    at: at[i],
  }));
}

/**
 * Where a screening has got to — the thing most patients open the app to find out.
 *
 * <p>It replaces a single amber card that said "with your dentist now" and nothing else.
 * The card was accurate and gave a patient no way to tell a screening that had just landed
 * from one that had been sitting for a week.
 */
function ScreeningRail({ assessment, onOpen }) {
  const stages = stageProgress(assessment);

  return (
    <section className="patient-home__rail" aria-label="Progress of your latest screening">
      <div className="patient-home__rail-head">
        <h2>Your screening from {relativeTime(assessment.createdAt)}</h2>
        <button type="button" className="patient-home__rail-open" onClick={onOpen}>
          Open
          <ChevronRight size={15} aria-hidden="true" />
        </button>
      </div>

      <ol className="patient-home__rail-track">
        {stages.map((stage) => (
          <li
            key={stage.key}
            className={`patient-home__stage${stage.done ? ' is-done' : ''}${stage.current ? ' is-current' : ''}`}
            aria-current={stage.current ? 'step' : undefined}
          >
            <span className="patient-home__stage-pip" aria-hidden="true" />
            <span className="patient-home__stage-label">{stage.label}</span>
            <span className="patient-home__stage-when">
              {stage.at && relativeTime(stage.at)}
              {!stage.at && stage.done && 'Done'}
              {/* No estimate on the stage that is waiting on a person. Nothing in the app
                  can hold the clinic to one, and a missed promise on a health result costs
                  more trust than the vagueness does. */}
              {!stage.done && (stage.current ? 'In progress' : 'Not started')}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}

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
 * What a signed-in patient lands on at `/home`.
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
 * <p>Lives at `/home`. It used to be the signed-in half of `/`, which is why it carried no
 * `!patient` guard — `/` chose between this and `Landing` on exactly that condition, so a
 * redirect here would have been a loop. Now that `/` is always the landing page, this screen
 * guards like every other patient screen and sends a signed-out visitor to `/start`.
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

  // As a render result rather than a side effect during render, matching the other patient
  // screens: calling navigate() mid-render warns and can double-fire in StrictMode.
  if (!patient) return <Navigate to="/start" replace />;

  const name = firstName(patient.name);
  const recent = items.slice(0, RECENT_LIMIT);
  // The newest screening still waiting on a dentist — the thing most patients opened the
  // app to check. `items` is newest-first, so the first match is the one to surface.
  const awaiting = items.find((assessment) => !assessment.doctorRiskClassification);

  return (
    <AppShell width="read">
      <PageTransition>
        <div className="screen patient-home">
          {/* Hero, then a section — the landing page's own structure. It was a greeting
              floating above a two-column grid, which put three different content widths on
              screen with nothing tying them together. */}
          <header className="patient-home__hero">
            <div className="patient-home__intro">
              <p className="patient-home__eyebrow">Your account</p>
              <h1>{name ? `Hello, ${name}` : 'Hello'}</h1>
              <p className="patient-home__lede">
                Screenings take about two minutes, and a licensed dentist reviews every one.
              </p>
            </div>

            <div className="patient-home__actions">
              {/* The dominant element on the screen on purpose. Landing here instead of
                  going straight to the questionnaire costs a returning patient one tap;
                  making the start action anything less than the largest thing on the page
                  would make that trade a bad one. */}
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

            </div>
          </header>

          {/* Only while something is actually in flight. A rail whose four stages are all
              complete on every visit is decoration, and the screen falls back to the shape
              it has when a patient has nothing waiting. */}
          {awaiting && (
            <ScreeningRail
              assessment={awaiting}
              onOpen={() => navigate(`/assessments/${awaiting.id}`)}
            />
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
