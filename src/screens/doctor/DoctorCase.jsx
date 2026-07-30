import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { ApiError, api } from '../../api/client';
import DoctorShell from '../../components/doctor/DoctorShell';
import RiskTier from '../../components/doctor/RiskTier';
import ErrorState from '../../components/shared/ErrorState';
import { CaseSkeleton } from '../../components/shared/Skeleton';
import { useToast } from '../../components/shared/Toast';
import PageTransition from '../../components/shared/PageTransition';
import { useDoctorSession } from '../../context/DoctorSessionContext';
import { ZoomIn, ZoomOut, RotateCw, Columns, X, ArrowLeft } from 'lucide-react';
import './DoctorCase.css';

const RISK_OPTIONS = [
  { value: 'NO_MILD_RISK', label: 'No / mild risk' },
  { value: 'MODERATE_RISK', label: 'Moderate risk' },
  { value: 'HIGH_RISK', label: 'High risk' },
];

const DURATION_LABELS = {
  DAYS_0_2: '0-2 days',
  DAYS_3_5: '3-5 days',
  DAYS_5_7: '5-7 days',
  DAYS_7_10: '7-10 days',
  DAYS_10_TO_1_MONTH: '10 days-1 month',
  MORE_THAN_1_MONTH: 'More than 1 month',
};

function unwrapAssessment(payload) {
  if (!payload || typeof payload !== 'object') return {};
  for (const key of ['assessment', 'aiAssessment', 'data', 'result']) {
    if (payload[key] && typeof payload[key] === 'object' && !Array.isArray(payload[key])) {
      return { ...payload, ...payload[key] };
    }
  }
  return payload;
}

function displayBoolean(value) {
  if (value == null) return 'Not recorded';
  return value ? 'Yes' : 'No';
}

function directImageSource(image) {
  const path = image?.url || image?.imageUrl || image?.downloadUrl || image?.presignedUrl;
  return path ? api.resolveApiUrl(path) : null;
}

function confidenceLabel(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  return `${Math.round(numeric <= 1 ? numeric * 100 : numeric)}%`;
}

function DoctorImage({ image, index, token, onOpen, onRequestError }) {
  const directSource = directImageSource(image);
  const [src, setSrc] = useState(directSource);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (directSource || !image?.id) return undefined;
    let active = true;
    let objectUrl = null;

    api.getDoctorImageBlob(image.id, token)
      .then((blob) => {
        if (!active) return;
        objectUrl = URL.createObjectURL(blob);
        setSrc(objectUrl);
      })
      .catch((err) => {
        if (active) {
          setFailed(true);
          onRequestError(err);
        }
      });

    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [directSource, image?.id, onRequestError, token]);

  if (failed || (!src && !image?.id)) {
    return <div className="doctor-case__image-missing">Image unavailable</div>;
  }

  if (!src) {
    return <div className="doctor-case__image-missing">Loading image...</div>;
  }

  const alt = `Screening photo ${index + 1}`;
  return (
    <button type="button" onClick={() => onOpen({ src, alt })}>
      <img src={src} alt={alt} />
    </button>
  );
}

export default function DoctorCase() {
  const { assessmentId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { session, endSession } = useDoctorSession();
  const toast = useToast();
  const queueAssessment = location.state?.assessment || null;
  const [assessment, setAssessment] = useState(queueAssessment);
  const [risk, setRisk] = useState('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [submitError, setSubmitError] = useState('');
  const [saved, setSaved] = useState(false);
  const [activeImage, setActiveImage] = useState(null);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [compareImage, setCompareImage] = useState(null);
  const [showReasoning, setShowReasoning] = useState(false);

  const handleAuthError = useCallback((err) => {
    if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
      endSession();
      navigate('/doctor/login', { replace: true });
      return true;
    }
    return false;
  }, [endSession, navigate]);

  const loadAssessment = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = unwrapAssessment(await api.getDoctorAssessment(assessmentId, session.token));
      setAssessment((current) => ({ ...current, ...result }));
      setRisk(result.doctorRiskClassification || result.doctorReview?.doctorRiskClassification || '');
      setNotes(result.doctorNotes || result.doctorReview?.doctorNotes || '');
    } catch (err) {
      if (!handleAuthError(err)) setError(err);
    } finally {
      setLoading(false);
    }
  }, [assessmentId, handleAuthError, session.token]);

  useEffect(() => { loadAssessment(); }, [loadAssessment]);

  useEffect(() => {
    if (!activeImage) return undefined;
    function closeOnEscape(event) {
      if (event.key === 'Escape') setActiveImage(null);
    }
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [activeImage]);

  useEffect(() => {
    function handleCaseShortcuts(e) {
      if (activeImage) return;
      const activeTag = document.activeElement?.tagName?.toLowerCase();

      if (e.key === '1' && activeTag !== 'input' && activeTag !== 'textarea') {
        e.preventDefault();
        setRisk('NO_MILD_RISK');
        setSaved(false);
        toast.info('Selected: No / mild risk (Key 1)');
      } else if (e.key === '2' && activeTag !== 'input' && activeTag !== 'textarea') {
        e.preventDefault();
        setRisk('MODERATE_RISK');
        setSaved(false);
        toast.info('Selected: Moderate risk (Key 2)');
      } else if (e.key === '3' && activeTag !== 'input' && activeTag !== 'textarea') {
        e.preventDefault();
        setRisk('HIGH_RISK');
        setSaved(false);
        toast.info('Selected: High risk (Key 3)');
      } else if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        const form = document.querySelector('.doctor-case__form');
        if (form) form.requestSubmit();
      }
    }

    window.addEventListener('keydown', handleCaseShortcuts);
    return () => window.removeEventListener('keydown', handleCaseShortcuts);
  }, [activeImage, toast]);

  const questionnaire = assessment?.questionnaireResponse || assessment?.questionnaire || {};
  const patient = assessment?.patient || questionnaire.patient || {};
  const images = useMemo(
    () => questionnaire.images || questionnaire.imageAssets || assessment?.images || [],
    [assessment, questionnaire]
  );

  async function submitReview(event) {
    event.preventDefault();
    if (!risk) return;
    setSubmitting(true);
    setSaved(false);
    setSubmitError('');
    try {
      const result = unwrapAssessment(await api.submitDoctorReview(assessmentId, {
        doctorRiskClassification: risk,
        doctorNotes: notes.trim(),
      }, session.token));
      setAssessment((current) => ({ ...current, ...result, doctorRiskClassification: risk, doctorNotes: notes.trim() }));
      setSaved(true);
      toast.success('Review saved successfully');
    } catch (err) {
      if (!handleAuthError(err)) {
        setSubmitError('The review could not be saved. Please try again.');
        toast.error('The review could not be saved. Please try again.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <DoctorShell>
      <PageTransition>
        <button className="doctor-case__back" type="button" onClick={() => navigate('/doctor')}>Back to queue</button>

      {loading && <CaseSkeleton />}
      {error && (
        <div className="doctor-case__state">
          <ErrorState title={error.status === 404 ? 'Case not found' : 'Case unavailable'} message={error.status === 404 ? 'This assessment does not exist or is no longer available.' : 'The case details could not be loaded.'} onRetry={loadAssessment} />
        </div>
      )}

      {!loading && !error && assessment && (
        <div className="doctor-case">
          <header className="doctor-case__heading">
            <div>
              <p>Screening case</p>
              <h1>{assessment.name || assessment.patientName || 'Patient assessment'}</h1>
              <span>{[assessment.patientAge != null ? `${assessment.patientAge} years` : null, assessment.patientSex?.replaceAll?.('_', ' ')].filter(Boolean).join(' / ') || 'Patient details unavailable'}</span>
            </div>
            <RiskTier classification={assessment.aiRiskClassification} />
          </header>

          <section className="doctor-case__panel" aria-labelledby="patient-summary-title">
            <div className="doctor-case__panel-heading">
              <span>01</span>
              <div><h2 id="patient-summary-title">Patient summary</h2><p>AI-generated patient-facing result</p></div>
            </div>
            <div className="doctor-case__summary-grid">
              <div className="doctor-case__narrative">
                <h3>Summary</h3>
                <p>{assessment.patientFacingSummary || 'No patient-facing summary was provided.'}</p>
              </div>
              <dl className="doctor-case__facts">
                <div><dt>AI risk</dt><dd><RiskTier classification={assessment.aiRiskClassification} /></dd></div>
                <div><dt>Suggested specialist</dt><dd>{assessment.recommendedSpecialistDisplayName || assessment.aiRecommendedSpecialist || 'Not specified'}</dd></div>
              </dl>
            </div>
          </section>

          <section className="doctor-case__panel" aria-labelledby="clinical-summary-title">
            <div className="doctor-case__panel-heading">
              <span>02</span>
              <div><h2 id="clinical-summary-title">Clinical summary</h2><p>Questionnaire, images, and AI reasoning</p></div>
            </div>
            <div className="doctor-case__clinical-grid">
              <div>
                <h3>Reported symptoms and habits</h3>
                <dl className="doctor-case__clinical-facts">
                  <div><dt>Duration</dt><dd>{DURATION_LABELS[questionnaire.durationOfSymptom] || questionnaire.durationOfSymptom?.replaceAll?.('_', ' ') || 'Not recorded'}</dd></div>
                  <div><dt>Pain</dt><dd>{displayBoolean(questionnaire.pain)}</dd></div>
                  <div><dt>Bleeding</dt><dd>{displayBoolean(questionnaire.bleeding)}</dd></div>
                  <div><dt>Swallowing / chewing difficulty</dt><dd>{displayBoolean(questionnaire.difficultySwallowingChewing)}</dd></div>
                  <div><dt>Tobacco use</dt><dd>{displayBoolean(questionnaire.tobaccoUse)}</dd></div>
                  <div><dt>Alcohol use</dt><dd>{displayBoolean(questionnaire.alcoholUse)}</dd></div>
                  <div><dt>Paan / gutkha use</dt><dd>{displayBoolean(questionnaire.paanUse)}</dd></div>
                </dl>
                {questionnaire.additionalNotes && <div className="doctor-case__notes"><h3>Patient notes</h3><p>{questionnaire.additionalNotes}</p></div>}
              </div>
              <div>
                <h3>Screening photos</h3>
                {images.length > 0 ? (
                  <div className="doctor-case__gallery">
                    {images.map((image, index) => (
                      <DoctorImage
                        key={image.id || directImageSource(image) || index}
                        image={image}
                        index={index}
                        token={session.token}
                        onOpen={setActiveImage}
                        onRequestError={handleAuthError}
                      />
                    ))}
                  </div>
                ) : <p className="doctor-case__muted">No screening photos were returned.</p>}
              </div>
            </div>
            <div className="doctor-case__reasoning">
              <div className="doctor-case__reasoning-title">
                <h3>AI Generated Doctor's Summary</h3>
                {confidenceLabel(assessment.aiConfidenceScore) && <span>AI confidence {confidenceLabel(assessment.aiConfidenceScore)}</span>}
              </div>
              <p>{assessment.doctorSummary || 'No doctor summary was generated by AI.'}</p>

              {assessment.clinicalReasoning && (
                <div className="doctor-case__clinical-reasoning">
                  <button
                    type="button"
                    className="doctor-case__reasoning-toggle"
                    onClick={() => setShowReasoning((prev) => !prev)}
                    aria-expanded={showReasoning}
                  >
                    {showReasoning ? '▾' : '▸'} View AI clinical reasoning
                  </button>
                  {showReasoning && (
                    <p className="doctor-case__clinical-reasoning-text">{assessment.clinicalReasoning}</p>
                  )}
                </div>
              )}
            </div>
          </section>

          <section className="doctor-case__panel doctor-case__panel--review" aria-labelledby="doctor-review-title">
            <div className="doctor-case__panel-heading">
              <span>03</span>
              <div><h2 id="doctor-review-title">Doctor review</h2><p>Record or update your clinical assessment</p></div>
            </div>
            <form className="doctor-case__form" onSubmit={submitReview}>
              <div className="field">
                <label htmlFor="doctor-risk">Risk classification</label>
                <select id="doctor-risk" value={risk} onChange={(e) => { setRisk(e.target.value); setSaved(false); }} required>
                  <option value="" disabled>Select classification</option>
                  {RISK_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </div>
              <div className="field">
                <label htmlFor="doctor-notes">Clinical notes</label>
                <textarea id="doctor-notes" rows="5" value={notes} onChange={(e) => { setNotes(e.target.value); setSaved(false); }} placeholder="Add your observations or follow-up recommendation" />
              </div>
              {submitError && <p className="doctor-case__submit-error" role="alert">{submitError}</p>}
              {saved && <p className="doctor-case__saved" role="status">Review saved. You can update it again at any time.</p>}
              <div className="doctor-case__actions">
                <button className="btn btn-primary" type="submit" disabled={!risk || submitting}>{submitting ? 'Saving review...' : 'Save review'}</button>
                {saved && <button className="btn btn-secondary" type="button" onClick={() => navigate('/doctor')}>Back to queue</button>}
              </div>
            </form>
          </section>
        </div>
      )}

      {activeImage && (
        <div className="doctor-case__lightbox" role="dialog" aria-modal="true" aria-label="Clinical photo viewer">
          <div className="doctor-case__lightbox-header">
            <div className="doctor-case__lightbox-title">
              <span>Clinical Image Inspection</span>
            </div>
            <div className="doctor-case__lightbox-toolbar">
              <button
                type="button"
                title="Zoom Out"
                onClick={() => setZoomLevel((z) => Math.max(1, z - 0.5))}
              >
                <ZoomOut size={16} />
              </button>
              <span className="doctor-case__zoom-label">{Math.round(zoomLevel * 100)}%</span>
              <button
                type="button"
                title="Zoom In"
                onClick={() => setZoomLevel((z) => Math.min(3.5, z + 0.5))}
              >
                <ZoomIn size={16} />
              </button>
              <button
                type="button"
                title="Rotate 90deg"
                onClick={() => setRotation((r) => (r + 90) % 360)}
              >
                <RotateCw size={16} />
              </button>
              {images.length > 1 && (
                <button
                  type="button"
                  className={compareImage ? 'is-active' : ''}
                  title="Side-by-side comparison"
                  onClick={() =>
                    setCompareImage(
                      compareImage
                        ? null
                        : images.find((i) => (i.src || directImageSource(i)) !== activeImage.src) || images[0]
                    )
                  }
                >
                  <Columns size={16} /> {compareImage ? 'Single View' : 'Compare'}
                </button>
              )}
            </div>
            <button
              type="button"
              className="doctor-case__lightbox-close"
              aria-label="Close lightbox"
              onClick={() => {
                setActiveImage(null);
                setCompareImage(null);
                setZoomLevel(1);
                setRotation(0);
              }}
            >
              <X size={20} />
            </button>
          </div>

          <div className={`doctor-case__lightbox-viewport ${compareImage ? 'is-split' : ''}`}>
            <div className="doctor-case__lightbox-frame">
              <img
                src={activeImage.src}
                alt={activeImage.alt || 'Screening photo'}
                style={{
                  transform: `scale(${zoomLevel}) rotate(${rotation}deg)`,
                  transition: 'transform 0.15s ease',
                }}
              />
            </div>
            {compareImage && (
              <div className="doctor-case__lightbox-frame">
                <img
                  src={compareImage.src || directImageSource(compareImage)}
                  alt="Comparison photo"
                  style={{
                    transform: `scale(${zoomLevel}) rotate(${rotation}deg)`,
                    transition: 'transform 0.15s ease',
                  }}
                />
              </div>
            )}
          </div>
        </div>
      )}
      </PageTransition>
    </DoctorShell>
  );
}