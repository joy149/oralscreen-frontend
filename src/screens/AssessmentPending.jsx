import { useLocation, useNavigate } from 'react-router-dom';
import { Phone, CalendarClock, MessageSquareText, Stethoscope } from 'lucide-react';
import AppShell from '../components/layout/AppShell';
import ErrorState from '../components/shared/ErrorState';
import RiskBadge from '../components/shared/RiskBadge';
import HomeCareRecommendations from '../components/shared/HomeCareRecommendations';
import PageTransition from '../components/shared/PageTransition';
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
 * step needed. This screen just displays whatever was handed to it via
 * navigation state.
 *
 * Known MVP gap: if the patient refreshes this page directly, we lose
 * location.state and there's currently no "GET assessment by questionnaire id"
 * endpoint to recover it — only GET /api/assessments/{id}. Worth adding that
 * lookup endpoint before real patients rely on revisiting results.
 *
 * Order matters here. The risk verdict is the single thing the patient came
 * for, so it renders first, unanimated, above the fold. Explanation, home care
 * and the specialist suggestion are supporting material and sit below it.
 */
export default function AssessmentPending() {
  const location = useLocation();
  const navigate = useNavigate();
  const assessment = location.state?.assessment;

  if (!assessment) {
    return (
      <AppShell step={3} totalSteps={3}>
        <ErrorState
          title="We lost track of that result"
          message="Please start a new screening to see your result."
          onRetry={() => navigate('/questionnaire')}
          retryLabel="Start again"
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
              <li>
                <span className="assessment-result__timeline-icon" aria-hidden="true">
                  <MessageSquareText size={16} />
                </span>
                <div>
                  <strong>We text you when the review is in</strong>
                  <p>You&apos;ll get an SMS on this number. The result also stays in Past assessments.</p>
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
