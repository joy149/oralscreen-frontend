import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import AppShell from '../components/layout/AppShell';
import ImageUploadRow from '../components/shared/ImageUploadRow';
import ErrorState from '../components/shared/ErrorState';
import PageTransition from '../components/shared/PageTransition';
import { motion, AnimatePresence } from 'motion/react';
import { api } from '../api/client';
import { useToast } from '../components/shared/Toast';
import './PhotoUpload.css';

let nextId = 0;
const MAX_CONCURRENT_UPLOADS = 1;
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

  const addFiles = useCallback((files) => {
    if (files.length === 0) return;

    const newItems = files.map((file) => ({
      id: nextId++,
      file,
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

  async function openCamera(mode = facingMode) {
    setCameraError(null);
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
      const file = new File([blob], `camera-${Date.now()}.jpg`, { type: 'image/jpeg' });
      addFiles([file]);
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
          <h1>Add a photo</h1>
          <p className="photo-upload__subhead">
            Clear, well-lit photos help the AI and the doctor see what you're seeing.
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

          <div className="photo-upload__pickers">
            <button type="button" className="photo-upload__picker" onClick={() => openCamera('environment')}>
              <span className="photo-upload__picker-icon">+</span>
              <span>Take a photo</span>
            </button>
            <label htmlFor="photo-library-input" className="photo-upload__picker">
              <span className="photo-upload__picker-icon">+</span>
              <span>Choose photos</span>
            </label>
          </div>

          {cameraStream && (
            <div
              className="photo-upload__camera"
              role="dialog"
              aria-label="Camera"
              style={{ position: 'relative' }}
            >
              <video ref={videoRef} className="photo-upload__camera-preview" autoPlay playsInline muted />
              {hasMultipleCameras && (
                <button
                  type="button"
                  className="photo-upload__camera-switch"
                  onClick={switchCamera}
                  disabled={switchingCamera}
                  aria-label="Switch camera"
                  title="Switch camera"
                  style={{
                    position: 'absolute',
                    top: '12px',
                    right: '12px',
                    width: '40px',
                    height: '40px',
                    padding: 0,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: 'rgba(0, 0, 0, 0.45)',
                    border: 'none',
                    borderRadius: '50%',
                    color: '#fff',
                    cursor: switchingCamera ? 'default' : 'pointer',
                    opacity: switchingCamera ? 0.6 : 1,
                    zIndex: 2,
                  }}
                >
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    style={{
                      transform: switchingCamera ? 'rotate(180deg)' : 'none',
                      transition: 'transform 0.2s ease',
                    }}
                  >
                    <path d="M17 2.1l4 4-4 4" />
                    <path d="M3 12.2v-2a4 4 0 0 1 4-4h12.8" />
                    <path d="M7 21.9l-4-4 4-4" />
                    <path d="M21 11.8v2a4 4 0 0 1-4 4H4.2" />
                  </svg>
                </button>
              )}
              <div className="photo-upload__camera-actions">
                <button type="button" className="btn btn-secondary" onClick={closeCamera}>Cancel</button>
                <button type="button" className="btn btn-primary" onClick={capturePhoto}>Use this photo</button>
              </div>
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

          {hasFailed && (
            <p className="photo-upload__hint">
              One or more photos could not be uploaded. Please re-upload or remove them before continuing.
            </p>
          )}

          <button
            type="button"
            className="btn btn-primary photo-upload__continue"
            disabled={!canContinue || assessing}
            onClick={handleContinue}
          >
            {assessing ? 'Running assessment…' : `Continue with ${successCount} photo${successCount === 1 ? '' : 's'}`}
          </button>
          <button
            type="button"
            className="btn btn-secondary photo-upload__back"
            onClick={() => navigate(`/questionnaire/${questionnaireId}`)}
            disabled={assessing}
          >
            Back to questionnaire
          </button>
        </div>
      </PageTransition>
    </AppShell>
  );
}