import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import AppShell from '../components/layout/AppShell';
import ImageUploadRow from '../components/shared/ImageUploadRow';
import ErrorState from '../components/shared/ErrorState';
import PageTransition from '../components/shared/PageTransition';
import { motion, AnimatePresence } from 'motion/react';
import { api } from '../api/client';
import { useToast } from '../components/shared/Toast';
import { Camera, ImagePlus, RefreshCw, Info, Check } from 'lucide-react';
import './PhotoUpload.css';

let nextId = 0;
const MAX_CONCURRENT_UPLOADS = 1;
const SCREENING_ANGLES = [
  { id: 'front', label: 'Front Teeth & Gums', hint: 'Center front teeth & gums inside the oval guide' },
  { id: 'upper', label: 'Upper Arch', hint: 'Tilt head back slightly to capture roof of mouth' },
  { id: 'lower', label: 'Lower Floor', hint: 'Open wide to capture floor of mouth and lower arch' },
  { id: 'cheek', label: 'Inner Cheek / Tongue', hint: 'Pull cheek side-to-side or extend tongue' },
];

const ASSESSMENT_STATUS_MESSAGES = [
  'Reviewing your photos...',
  'Checking symptoms...',
  'Comparing photo details...',
  'Preparing your preliminary result...',
  'Getting everything ready for dentist review...',
];

function AssessmentLoadingScreen() {
  const [messageIndex, setMessageIndex] = useState(0);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setMessageIndex((currentIndex) => (currentIndex + 1) % ASSESSMENT_STATUS_MESSAGES.length);
    }, 3500);

    return () => window.clearInterval(intervalId);
  }, []);

  return (
    <AppShell step={3} totalSteps={3}>
      <div className="screen assessment-loading">
        <div className="assessment-loading__indicator" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
        <p className="assessment-loading__eyebrow">Analysis takes about 20-30 seconds</p>
        <h1>Analyzing your screening</h1>
        <div className="assessment-loading__status" role="status" aria-live="polite">
          <AnimatePresence mode="wait">
            <motion.p
              key={messageIndex}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              {ASSESSMENT_STATUS_MESSAGES[messageIndex]}
            </motion.p>
          </AnimatePresence>
        </div>
        <p className="assessment-loading__note">
          Please keep this screen open while we prepare your result.
        </p>
      </div>
    </AppShell>
  );
}

export default function PhotoUpload() {
  const { questionnaireId } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const uploadQueueRef = useRef([]);
  const activeUploadsRef = useRef(0);
  const mountedRef = useRef(true);
  const processQueueRef = useRef(() => {});
  const cameraInputRef = useRef(null);
  const videoRef = useRef(null);

  const [items, setItems] = useState([]);
  const [assessError, setAssessError] = useState(null);
  const [assessing, setAssessing] = useState(false);
  const [cameraStream, setCameraStream] = useState(null);
  const [cameraError, setCameraError] = useState(null);
  const [facingMode, setFacingMode] = useState('environment');
  const [hasMultipleCameras, setHasMultipleCameras] = useState(false);
  const [switchingCamera, setSwitchingCamera] = useState(false);
  const [selectedAngle, setSelectedAngle] = useState('front');

  const startUpload = useCallback((item) => {
    activeUploadsRef.current += 1;
    setItems((prev) =>
      prev.map((it) => (it.id === item.id ? { ...it, status: 'uploading', progress: 0, error: null } : it))
    );

    api
      .uploadImage(questionnaireId, item.file, (progress) => {
        if (mountedRef.current) {
          setItems((prev) => prev.map((it) => (it.id === item.id ? { ...it, progress } : it)));
        }
      })
      .then((upload) => {
        if (mountedRef.current) {
          setItems((prev) =>
            prev.map((it) => (it.id === item.id ? { ...it, status: 'success', progress: 100, upload } : it))
          );
          toast.success('Photo uploaded');
        }
      })
      .catch((err) => {
        if (mountedRef.current) {
          setItems((prev) =>
            prev.map((it) =>
              it.id === item.id
                ? { ...it, status: 'failed', error: err.message || 'Upload failed' }
                : it
            )
          );
          toast.error('Photo upload failed — tap to retry');
        }
      })
      .finally(() => {
        activeUploadsRef.current -= 1;
        processQueueRef.current();
      });
  }, [questionnaireId, toast]);

  const processQueue = useCallback(() => {
    while (activeUploadsRef.current < MAX_CONCURRENT_UPLOADS && uploadQueueRef.current.length > 0) {
      const nextItem = uploadQueueRef.current.shift();
      startUpload(nextItem);
    }
  }, [startUpload]);

  // A ref avoids a circular callback dependency while ensuring a completed
  // request always advances the latest queue.
  processQueueRef.current = processQueue;

  const enqueueUpload = useCallback((item) => {
    uploadQueueRef.current.push(item);
    processQueue();
  }, [processQueue]);

  useEffect(() => {
    // React Strict Mode runs an effect cleanup once during development to find
    // unsafe effects. Resetting this here keeps upload callbacks active after
    // that test remount.
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadUploadedImages() {
      try {
        const questionnaire = await api.getQuestionnaire(questionnaireId);
        // Support either common questionnaire response name while the API
        // settles on its read DTO.
        const uploads = questionnaire?.images || questionnaire?.imageAssets || [];
        const uploadedImages = Array.isArray(uploads) ? uploads : [];
        const savedItems = uploadedImages.map((upload) => ({
          id: `saved-${upload.id}`,
          file: { name: upload.storageKey?.split('/').pop() || 'Uploaded photo' },
          previewUrl: api.resolveApiUrl(upload.contentUrl),
          localPreview: false,
          status: 'success',
          progress: 100,
          upload,
          persisted: true,
        }));

        if (!cancelled) {
          setItems((currentItems) => [...savedItems, ...currentItems]);
        }
      } catch (_) {
        // Loading previous uploads is helpful after a refresh, but should not
        // prevent selecting and uploading new photos if the read request fails.
      }
    }

    loadUploadedImages();
    return () => {
      cancelled = true;
    };
  }, [questionnaireId]);

  // `angle` tags a photo with the screening view it covers, which is what the
  // capture checklist reads to show progress. Library picks arrive untagged —
  // they still upload, they just don't tick a specific slot.
  const addFiles = useCallback((files, angle = null) => {
    if (files.length === 0) return;

    const newItems = files.map((file) => ({
      id: nextId++,
      file,
      angle,
      previewUrl: URL.createObjectURL(file),
      localPreview: true,
      status: 'queued',
      progress: 0,
      error: null,
    }));

    setItems((prev) => [...prev, ...newItems]);
    newItems.forEach(enqueueUpload);
  }, [enqueueUpload]);

  function handleFilesSelected(e) {
    const files = Array.from(e.target.files || []);
    addFiles(files);

    // allow selecting the same file again later
    e.target.value = '';
  }

  useEffect(() => {
    if (!cameraStream || !videoRef.current) return undefined;

    const video = videoRef.current;
    video.srcObject = cameraStream;
    video.play().catch(() => {});

    return () => {
      cameraStream.getTracks().forEach((track) => track.stop());
    };
  }, [cameraStream]);

  // Once we have camera permission, check whether the device actually has
  // more than one camera before showing a flip control that would do nothing.
  useEffect(() => {
    if (!cameraStream || !navigator.mediaDevices?.enumerateDevices) return;

    navigator.mediaDevices
      .enumerateDevices()
      .then((devices) => {
        const videoInputs = devices.filter((d) => d.kind === 'videoinput');
        if (mountedRef.current) {
          setHasMultipleCameras(videoInputs.length > 1);
        }
      })
      .catch(() => {
        // If enumeration fails, just leave the flip control hidden rather
        // than risk offering a switch that won't work.
      });
  }, [cameraStream]);

  async function openCamera(mode = facingMode, angle = null) {
    setCameraError(null);
    if (angle) setSelectedAngle(angle);
    if (!navigator.mediaDevices?.getUserMedia) {
      cameraInputRef.current?.click();
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: mode } },
        audio: false,
      });
      setFacingMode(mode);
      setCameraStream(stream);
    } catch (err) {
      setCameraError('Camera access was unavailable. You can use your device camera instead.');
    }
  }

  async function switchCamera() {
    if (switchingCamera) return;
    const nextMode = facingMode === 'environment' ? 'user' : 'environment';
    setSwitchingCamera(true);
    setCameraError(null);
    try {
      await openCamera(nextMode);
    } finally {
      setSwitchingCamera(false);
    }
  }

  function closeCamera() {
    setCameraStream(null);
    setFacingMode('environment');
  }

  function capturePhoto() {
    const video = videoRef.current;
    if (!video?.videoWidth || !video?.videoHeight) return;

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob((blob) => {
      if (!blob) return;
      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        navigator.vibrate(50);
      }
      const file = new File([blob], `${selectedAngle}-${Date.now()}.jpg`, { type: 'image/jpeg' });
      addFiles([file], selectedAngle);
      closeCamera();
    }, 'image/jpeg', 0.92);
  }

  function handleRetry(id) {
    const item = items.find((it) => it.id === id);
    if (item) {
      setItems((prev) =>
        prev.map((it) => (it.id === id ? { ...it, status: 'queued', progress: 0, error: null } : it))
      );
      enqueueUpload(item);
    }
  }

  function handleRemove(id) {
    uploadQueueRef.current = uploadQueueRef.current.filter((item) => item.id !== id);
    setItems((prev) => {
      const item = prev.find((it) => it.id === id);
      if (item?.localPreview) URL.revokeObjectURL(item.previewUrl);
      return prev.filter((it) => it.id !== id);
    });
  }

  const visibleItems = items;
  const successCount = visibleItems.filter((it) => it.status === 'success').length;
  const hasInFlight = visibleItems.some((it) => it.status === 'uploading' || it.status === 'queued');
  const hasFailed = visibleItems.some((it) => it.status === 'failed');
  const canContinue = successCount > 0 && !hasInFlight && !hasFailed;

  // A photo counts toward an angle as soon as it's captured, so the checklist
  // ticks immediately rather than waiting on the upload round-trip.
  const captureByAngle = SCREENING_ANGLES.reduce((acc, angle) => {
    acc[angle.id] = visibleItems.find(
      (it) => it.angle === angle.id && it.status !== 'failed'
    ) || null;
    return acc;
  }, {});
  const capturedAngles = SCREENING_ANGLES.filter((a) => captureByAngle[a.id]).length;

  function continueLabel() {
    if (assessing) return 'Running assessment…';
    if (successCount === 0) return 'Continue';
    return `Continue with ${successCount} photo${successCount === 1 ? '' : 's'}`;
  }

  function requirementText() {
    if (hasInFlight) return 'Waiting for uploads to finish…';
    if (hasFailed) return 'Re-upload or remove the failed photos before continuing.';
    if (successCount === 0) return 'Capture at least one photo to continue.';
    return null;
  }

  async function handleContinue() {
    setAssessError(null);
    setAssessing(true);
    try {
      const assessment = await api.triggerAssessment(questionnaireId);
      navigate(`/questionnaire/${questionnaireId}/assessment`, { state: { assessment } });
    } catch (err) {
      setAssessError(err);
      toast.error('Assessment could not be started. Please try again.');
    } finally {
      setAssessing(false);
    }
  }

  if (assessError) {
    return (
      <AppShell step={2} totalSteps={3}>
        <ErrorState
          title="Couldn't run the assessment"
          message="Your photos are saved. Please try again."
          onRetry={() => setAssessError(null)}
        />
      </AppShell>
    );
  }

  if (assessing) {
    return <AssessmentLoadingScreen />;
  }

  return (
    <AppShell step={2} totalSteps={3}>
      <PageTransition>
        <div className="screen photo-upload">
          <h1>Add your photos</h1>
          <p className="photo-upload__subhead">
            Four angles give the dentist the clearest picture. One photo is enough to continue.
          </p>

          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            multiple
            onChange={handleFilesSelected}
            className="photo-upload__hidden-input"
            id="photo-library-input"
          />

          <input
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handleFilesSelected}
            className="photo-upload__hidden-input"
            id="photo-camera-input"
          />

          {/* The four screening angles used to exist only inside the camera
              overlay, so the main screen gave no sense of what "done" meant.
              Surfacing them as a checklist turns this into a completable task
              and improves the photo set the model receives. */}
          {!cameraStream && (
            <section className="photo-upload__angles" aria-labelledby="angles-heading">
              <div className="photo-upload__angles-head">
                <h2 id="angles-heading">Capture 4 angles</h2>
                <span className="photo-upload__angles-count">{capturedAngles} of {SCREENING_ANGLES.length}</span>
              </div>

              <ul className="photo-upload__angle-grid">
                {SCREENING_ANGLES.map((angle) => {
                  const captured = captureByAngle[angle.id];
                  return (
                    <li key={angle.id}>
                      <button
                        type="button"
                        className={`photo-upload__angle-slot${captured ? ' is-captured' : ''}`}
                        onClick={() => openCamera('environment', angle.id)}
                      >
                        <span className="photo-upload__angle-thumb">
                          {captured ? (
                            <>
                              <img src={captured.previewUrl} alt="" />
                              <span className="photo-upload__angle-check" aria-hidden="true">
                                <Check size={14} />
                              </span>
                            </>
                          ) : (
                            <Camera size={20} aria-hidden="true" />
                          )}
                        </span>
                        <span className="photo-upload__angle-label">{angle.label}</span>
                        <span className="photo-upload__angle-state">
                          {captured ? 'Retake' : 'Capture'}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>

              <label htmlFor="photo-library-input" className="photo-upload__library">
                <ImagePlus size={16} aria-hidden="true" />
                <span>Or choose photos from your gallery</span>
              </label>
            </section>
          )}

          {cameraStream && (
            <div
              className="photo-upload__camera"
              role="dialog"
              aria-label="Oral screening camera with positioning overlay"
            >
              <div className="photo-upload__angle-selector" role="tablist" aria-label="Screening angle selector">
                {SCREENING_ANGLES.map((angle) => (
                  <button
                    key={angle.id}
                    type="button"
                    role="tab"
                    aria-selected={selectedAngle === angle.id}
                    className={`photo-upload__angle-chip ${selectedAngle === angle.id ? 'is-active' : ''}`}
                    onClick={() => setSelectedAngle(angle.id)}
                  >
                    {angle.label}
                  </button>
                ))}
              </div>

              <div className="photo-upload__camera-viewport">
                <video ref={videoRef} className="photo-upload__camera-preview" autoPlay playsInline muted />
                <div className="photo-upload__camera-overlay" aria-hidden="true">
                  <svg viewBox="0 0 100 100" className="photo-upload__framing-svg">
                    <ellipse cx="50" cy="50" rx="34" ry="24" fill="none" stroke="rgba(255,255,255,0.85)" strokeWidth="1.2" strokeDasharray="4 2" />
                    <circle cx="50" cy="50" r="1.5" fill="rgba(255,255,255,0.6)" />
                    <line x1="50" y1="20" x2="50" y2="80" stroke="rgba(255,255,255,0.25)" strokeWidth="0.8" />
                    <line x1="16" y1="50" x2="84" y2="50" stroke="rgba(255,255,255,0.25)" strokeWidth="0.8" />
                  </svg>
                  <div className="photo-upload__overlay-badge">
                    <span>{SCREENING_ANGLES.find((a) => a.id === selectedAngle)?.hint}</span>
                  </div>
                </div>

                {hasMultipleCameras && (
                  <button
                    type="button"
                    className="photo-upload__camera-switch"
                    onClick={switchCamera}
                    disabled={switchingCamera}
                    aria-label="Switch camera"
                    title="Switch camera"
                  >
                    <RefreshCw size={18} style={{ transform: switchingCamera ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s ease' }} />
                  </button>
                )}
              </div>

              <div className="photo-upload__camera-actions">
                <button type="button" className="btn btn-secondary" onClick={closeCamera}>Cancel</button>
                <button type="button" className="btn btn-primary" onClick={capturePhoto}>Capture photo</button>
              </div>
            </div>
          )}

          {!cameraStream && visibleItems.length === 0 && (
            <div className="photo-upload__guidelines">
              <div className="photo-upload__guidelines-title">
                <Info size={18} />
                <span>Tips for accurate screening photos</span>
              </div>
              <ul>
                <li>Ensure good room lighting or flash is enabled</li>
                <li>Keep the camera steady 4–6 inches from mouth</li>
                <li>Capture front teeth, upper arch, and lower floor</li>
              </ul>
            </div>
          )}

          {cameraError && (
            <p className="photo-upload__hint">
              {cameraError} <button type="button" className="photo-upload__camera-fallback" onClick={() => cameraInputRef.current?.click()}>Open camera picker</button>
            </p>
          )}

          {visibleItems.length > 0 && (
            <div className="photo-upload__list">
              {visibleItems.map((item) => (
                <ImageUploadRow
                  key={item.id}
                  item={item}
                  onRetry={handleRetry}
                  onRemove={handleRemove}
                />
              ))}
            </div>
          )}

          <div className="photo-upload__footer">
            <button
              type="button"
              className="btn btn-primary"
              disabled={!canContinue || assessing}
              onClick={handleContinue}
            >
              {continueLabel()}
            </button>

            {/* State the requirement rather than leaving a dead button. */}
            {requirementText() && (
              <p className="photo-upload__requirement" role="status">{requirementText()}</p>
            )}

            <button
              type="button"
              className="photo-upload__back-link"
              onClick={() => navigate(`/questionnaire/${questionnaireId}`)}
              disabled={assessing}
            >
              Back to questionnaire
            </button>
          </div>
        </div>
      </PageTransition>
    </AppShell>
  );
}