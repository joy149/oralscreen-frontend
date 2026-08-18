import { useCallback, useEffect, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { Phone, CalendarClock, MessageSquareText, Stethoscope } from 'lucide-react';
import AppShell from '../components/layout/AppShell';
import ErrorState from '../components/shared/ErrorState';
import LoadingState from '../components/shared/LoadingState';
import RiskBadge from '../components/shared/RiskBadge';
import HomeCareRecommendations from '../components/shared/HomeCareRecommendations';
import PageTransition from '../components/shared/PageTransition';
import { api } from '../api/client';
import useSessionRecovery from '../hooks/useSessionRecovery';
import './AssessmentPending.css';

const ASSESSMENT_WRAPPER_KEYS = ['data', 'assessment', 'result', 'assessmentResult', 'aiAssessment'];

// Booking is only offered when a real number is configured — a dead "Book now"
// button is worse than none. Bracketed placeholder values count as unset.
const RAW_CLINIC_PHONE = (import.meta.env.VITE_CLINIC_PHONE || '').trim();
const CLINIC_PHONE = /^\[.*\]$/.test(RAW_CLINIC_PHONE) ? '' : RAW_CLINIC_PHONE;
const REVIEW_SLA = (import.meta.env.VITE_REVIEW_SLA || '').trim() || '24 hours';

function findAssessmentField(payload, fieldNames) {
  if (!payload || typeof payload !== 'object') return undefined;

  for (const fieldName of fieldNames) {
    if (payload[fieldName] != null) return payload[fieldName];
  }

  for (const wrapperKey of ASSESSMENT_WRAPPER_KEYS) {
    const field = findAssessmentField(payload[wrapperKey], fieldNames);
    if (field != null) return field;
  }

  return undefined;
}

/**
 * The assess call (triggered from PhotoUpload) runs the AI model synchronously
 * and returns the full result in one response — there's no separate polling
 * step needed.
 *
 * The result normally arrives via navigation state. That state does not survive a
 * refresh, a shared link, or a PWA that the OS discarded in the background — and this
 * screen used to answer all of those with "We lost track of that result. Please start a
 * new screening", telling a patient to redo photos and pay for another inference to see
 * a result that was already saved. It now falls back to fetching the assessment for the
 * questionnaire in the URL.
 *
 * Order matters here. The risk verdict is the single thing the patient came
 * for, so it renders first, unanimated, above the fold. Explanation, home care
 * and the specialist suggestion are supporting material and sit below it.
 */
export default function AssessmentPending() {
  const location = useLocation();
  const navigate = useNavigate();
  const { questionnaireId } = useParams();
  const handleAuthError = useSessionRecovery();

  const handedOver = location.state?.assessment;
  const [fetched, setFetched] = useState(null);
  // Only the recovery path loads; arriving with state must not flash a spinner.
  const [loading, setLoading] = useState(!handedOver && Boolean(questionnaireId));
  const [loadFailed, setLoadFailed] = useState(false);

  const recoverAssessment = useCallback(async () => {
    if (handedOver || !questionnaireId) return;
    setLoading(true);
    setLoadFailed(false);
    try {
      setFetched(await api.getQuestionnaireAssessment(questionnaireId));
    } catch (err) {
      if (!handleAuthError(err)) setLoadFailed(true);
    } finally {
      setLoading(false);
    }
  }, [handedOver, handleAuthError, questionnaireId]);

  useEffect(() => { recoverAssessment(); }, [recoverAssessment]);

  const assessment = handedOver || fetched;

  if (loading) {
    return (
      <AppShell step={3} totalSteps={3}>
        <LoadingState message="Loading your result…" />
      </AppShell>
    );
  }

  if (!assessment) {
    // A 404 here means the questionnaire exists but was never assessed — the patient
    // stopped before the photo step, so sending them back there resumes rather than
    // restarts. Anything else is a load failure worth retrying in place.
    return (
      <AppShell step={3} totalSteps={3}>
        <ErrorState
          title={loadFailed ? 'We could not load that result' : 'This screening has no result yet'}
          message={loadFailed
            ? 'Your result is saved. Please try again in a moment.'
            : 'Add your photos to finish this screening and get your result.'}
          onRetry={loadFailed
            ? recoverAssessment
            : () => navigate(questionnaireId ? `/questionnaire/${questionnaireId}/photos` : '/questionnaire')}
          retryLabel={loadFailed ? 'Try again' : 'Continue screening'}
        />
      </AppShell>
    );
  }

  const riskClassification = findAssessmentField(assessment, ['risk_classification', 'aiRiskClassification']);
  const recommendedSpecialist = findAssessmentField(assessment, [
    'recommended_specialist_display_name',
    'recommendedSpecialistDisplayName',
    'recommended_specialist_code',
  ]);
  const patientSummary = findAssessmentField(assessment, ['patientFacingSummary', 'patient_facing_summary', 'summary']);
  const homeCareRecommendations = findAssessmentField(assessment, [
    'homeCareRecommendations',
    'home_care_recommendations',
    'homeCareTips',
    'home_care_tips',
    'homeCare',
    'home_care',
  ]);

  const needsAppointment = riskClassification === 'MODERATE_RISK' || riskClassification === 'HIGH_RISK';

  return (
    <AppShell step={3} totalSteps={3}>
      <PageTransition>
        <div className="screen assessment-result">
          <h1>Your result</h1>
          <p className="assessment-result__subhead">
            A preliminary AI read — not a diagnosis.
          </p>

          <RiskBadge classification={riskClassification} />

          {needsAppointment && CLINIC_PHONE && (
            <a className="btn btn-primary assessment-result__book" href={`tel:${CLINIC_PHONE}`}>
              <Phone size={18} aria-hidden="true" />
              Call to book an appointment
            </a>
          )}

          {/* Async triage is anxious by default. Say plainly who is looking,
              when, and how the patient will hear back. */}
          <section className="assessment-result__next" aria-labelledby="next-heading">
            <h2 id="next-heading">What happens next</h2>
            <ol className="assessment-result__timeline">
              <li>
                <span className="assessment-result__timeline-icon" aria-hidden="true">
                  <Stethoscope size={16} />
                </span>
                <div>
                  <strong>A dentist reviews your screening</strong>
                  <p>Your photos and answers go to a licensed dentist — usually within {REVIEW_SLA}.</p>
                </div>
              </li>
              {/* No SMS is sent today — nothing in the backend dispatches one. Promising a
                  text for a screening result the patient is anxious about, and then never
                  sending it, is worse than telling them plainly where to look. Restore the
                  SMS wording only alongside a notification service that actually fires. */}
              <li>
                <span className="assessment-result__timeline-icon" aria-hidden="true">
                  <MessageSquareText size={16} />
                </span>
                <div>
                  <strong>Check back for the dentist&apos;s review</strong>
                  <p>
                    Your result is saved under Past assessments — open it any time to see
                    whether the dentist has added their review.
                  </p>
                </div>
              </li>
              {needsAppointment && (
                <li>
                  <span className="assessment-result__timeline-icon" aria-hidden="true">
                    <CalendarClock size={16} />
                  </span>
                  <div>
                    <strong>Book an in-person examination</strong>
                    <p>
                      {CLINIC_PHONE
                        ? 'Use the call button above — you don’t need to wait for the review to book.'
                        : 'Contact your dental clinic to arrange a visit. You don’t need to wait for the review.'}
                    </p>
                  </div>
                </li>
              )}
            </ol>
          </section>

          {patientSummary && (
            <section className="card assessment-result__summary" aria-labelledby="why-heading">
              <h2 id="why-heading">Why we flagged this</h2>
              <p>{patientSummary}</p>
            </section>
          )}

          <HomeCareRecommendations recommendations={homeCareRecommendations} />

          {recommendedSpecialist && (
            <div className="assessment-result__specialist">
              <span>Suggested specialist</span>
              <strong>{recommendedSpecialist}</strong>
            </div>
          )}

          <p className="assessment-result__disclaimer">
            This screening is generated by an AI model and reviewed afterward by a dentist.
            It does not replace an in-person examination.
          </p>

          <div className="assessment-result__actions">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => navigate('/assessments')}
            >
              View all my screenings
            </button>
          </div>
        </div>
      </PageTransition>
    </AppShell>
  );
}
