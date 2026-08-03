import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import AppShell from '../components/layout/AppShell';
import PageTransition from '../components/shared/PageTransition';
import ErrorState from '../components/shared/ErrorState';
import Skeleton from '../components/shared/Skeleton';
import RiskTier from '../components/doctor/RiskTier';
import { api } from '../api/client';
import { usePatient } from '../context/PatientContext';
import './PastAssessmentDetail.css';

function DetailSkeleton() {
  return (
    <div className="past-assessment-detail__skeleton" aria-label="Loading assessment" role="status">
      <Skeleton width="40%" height={12} />
      <Skeleton width="70%" height={24} style={{ marginTop: 10 }} />
      <div className="card" style={{ marginTop: 24 }}>
        <Skeleton width="90%" height={12} />
        <Skeleton width="75%" height={12} style={{ marginTop: 8 }} />
        <Skeleton width="60%" height={12} style={{ marginTop: 8 }} />
      </div>
    </div>
  );
}

export default function PastAssessmentDetail() {
  const { assessmentId } = useParams();
  const navigate = useNavigate();
  const { patient } = usePatient();
  const [assessment, setAssessment] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadAssessment = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setAssessment(await api.getAssessment(assessmentId));
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [assessmentId]);

  useEffect(() => { loadAssessment(); }, [loadAssessment]);

  if (!patient) {
    navigate('/');
    return null;
  }

  const reviewed = Boolean(assessment?.doctorRiskClassification);

  return (
    <AppShell>
      <PageTransition>
        <div className="screen past-assessment-detail">
          <button type="button" className="past-assessment-detail__back" onClick={() => navigate('/assessments')}>
            &larr; Back to past assessments
          </button>

          {loading && <DetailSkeleton />}

          {!loading && error && (
            <ErrorState
              title={error.status === 404 ? 'Assessment not found' : 'Assessment unavailable'}
              message={error.status === 404
                ? 'This assessment does not exist or is no longer available.'
                : 'We could not load this assessment.'}
              onRetry={loadAssessment}
            />
          )}

          {!loading && !error && assessment && (
            <>
              <header className="past-assessment-detail__heading">
                <div>
                  <p>Screening result</p>
                  <h1>{new Date(assessment.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}</h1>
                </div>
                <RiskTier classification={assessment.aiRiskClassification} />
              </header>

              <section className="card past-assessment-detail__section">
                <h2>Summary</h2>
                <p>{assessment.patientFacingSummary || 'No summary was provided for this screening.'}</p>
                <dl className="past-assessment-detail__facts">
                  <div>
                    <dt>Suggested specialist</dt>
                    <dd>{assessment.recommendedSpecialistDisplayName || 'Not specified'}</dd>
                  </div>
                </dl>
              </section>

              {assessment.homeCareRecommendations && (
                <section className="card past-assessment-detail__section">
                  <h2>Home care recommendations</h2>
                  <p>{assessment.homeCareRecommendations}</p>
                </section>
              )}

              <section className="card past-assessment-detail__section past-assessment-detail__section--notes">
                <h2>Doctor's notes</h2>
                {reviewed ? (
                  <>
                    <dl className="past-assessment-detail__facts">
                      <div>
                        <dt>Doctor's assessment</dt>
                        <dd><RiskTier classification={assessment.doctorRiskClassification} /></dd>
                      </div>
                      {assessment.doctorReviewedAt && (
                        <div>
                          <dt>Reviewed on</dt>
                          <dd>{new Date(assessment.doctorReviewedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}</dd>
                        </div>
                      )}
                    </dl>
                    {assessment.doctorNotes && (
                      <p className="past-assessment-detail__notes-text">{assessment.doctorNotes}</p>
                    )}
                  </>
                ) : (
                  <p className="past-assessment-detail__muted">
                    A doctor hasn't reviewed this screening yet. Check back soon.
                  </p>
                )}
              </section>
            </>
          )}
        </div>
      </PageTransition>
    </AppShell>
  );
}
