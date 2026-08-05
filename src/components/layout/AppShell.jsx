import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { WifiOff, ArrowLeft } from 'lucide-react';
import { usePatient } from '../../context/PatientContext';
import AccountMenu from './AccountMenu';
import oralscreenLogo from '../../assets/oralscreen-mark.png';
import './AppShell.css';

// .env ships these as literal "[Doctor Name]" / "[Hospital Name]" placeholders,
// so an `|| ''` fallback isn't enough — a deployment that forgets to override
// them would print the brackets to patients. Treat any [bracketed] value as unset.
function configured(value) {
  const trimmed = (value || '').trim();
  if (!trimmed || /^\[.*\]$/.test(trimmed)) return '';
  return trimmed;
}

const DOCTOR_NAME = configured(import.meta.env.VITE_DOCTOR_NAME);
const HOSPITAL_NAME = configured(import.meta.env.VITE_HOSPITAL_NAME);

// The reviewer line is the app's main trust signal, so it must never render a
// bracketed placeholder. Fall back to the claim we can always make truthfully.
function reviewerLine() {
  if (DOCTOR_NAME && HOSPITAL_NAME) return `Screenings reviewed by ${DOCTOR_NAME} · ${HOSPITAL_NAME}`;
  if (DOCTOR_NAME) return `Screenings reviewed by ${DOCTOR_NAME}`;
  if (HOSPITAL_NAME) return `Screenings reviewed at ${HOSPITAL_NAME}`;
  return 'Every screening is reviewed by a licensed dentist';
}

const STEP_LABELS = ['Symptoms', 'Photos', 'Result'];

/**
 * `back` accepts `true` (history back), a path string, or a callback.
 * When set, the bar swaps the brand for a back control and renders `title`
 * as the screen's <h1> — so the screen body should not repeat it.
 */
export default function AppShell({
  children,
  step,
  totalSteps,
  back,
  title,
  clinicianLink = false,
}) {
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const { patient } = usePatient();
  const navigate = useNavigate();

  useEffect(() => {
    function handleOnline() { setIsOffline(false); }
    function handleOffline() { setIsOffline(true); }

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const showSteps = Boolean(step && totalSteps);

  function handleBack() {
    if (typeof back === 'function') back();
    else if (typeof back === 'string') navigate(back);
    else navigate(-1);
  }

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main">Skip to content</a>
      <header className="app-shell__header">
        <div className="app-shell__bar">
          {back ? (
            <button
              type="button"
              className="app-shell__back"
              onClick={handleBack}
              aria-label="Go back"
            >
              <ArrowLeft size={20} />
            </button>
          ) : (
            <div className="app-shell__brand">
              <img src={oralscreenLogo} alt="" className="app-shell__logo" width="32" height="32" />
              <span>OralScreen</span>
            </div>
          )}

          {back && title && <h1 className="app-shell__bar-title">{title}</h1>}

          {patient ? <AccountMenu /> : <span className="app-shell__bar-spacer" />}
        </div>

        {showSteps && (
          <div className="app-shell__steps">
            <div className="app-shell__steps-track">
              <motion.div
                className="app-shell__steps-fill"
                initial={false}
                animate={{ width: `${(step / totalSteps) * 100}%` }}
                transition={{ duration: 0.4, ease: [0.23, 1, 0.32, 1] }}
              />
            </div>
            <p className="app-shell__steps-label">
              <span>Step {step} of {totalSteps}</span>
              <span className="app-shell__steps-name">{STEP_LABELS[step - 1]}</span>
            </p>
          </div>
        )}
      </header>

      {isOffline && (
        <div className="app-shell__offline-banner" role="status" aria-live="polite">
          <WifiOff size={16} />
          <span>Offline — your progress is saved on this device and will upload when you reconnect.</span>
        </div>
      )}

      <main className="app-shell__main" id="main" tabIndex={-1}>{children}</main>

      <footer className="app-shell__footer">
        <p>{reviewerLine()}</p>
        {clinicianLink && (
          <button
            type="button"
            className="app-shell__clinician-link"
            onClick={() => navigate('/doctor/login')}
          >
            Clinician sign-in
          </button>
        )}
      </footer>
    </div>
  );
}
