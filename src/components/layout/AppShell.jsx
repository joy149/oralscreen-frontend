import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
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

// Only for a signed-in patient, and only where there is room. On a phone these same
// destinations live in the account menu, which is why this can disappear entirely rather
// than collapsing into a hamburger.
const NAV_LINKS = [
  { path: '/home', label: 'Home' },
  { path: '/assessments', label: 'Screenings' },
  { path: '/profile', label: 'Profile' },
];

/**
 * `back` accepts `true` (history back), a path string, or a callback.
 * When set, the bar swaps the brand for a back control and renders `title`
 * as the screen's <h1> — so the screen body should not repeat it.
 *
 * `width` picks the content tier — see --wrap-page / --wrap-task in tokens.css.
 * `'task'` (the default) is the measure a clinical form is filled in at; `'read'` is for
 * overview screens, which lay out across the full frame on a desktop.
 *
 * <p>The chrome is never on either tier. The header, the footer and the offline banner
 * always span --wrap-page, whatever the content does. They used to inherit the content's
 * 480px cap, which put the brand in the middle of a desktop window with nothing under it —
 * that, rather than the narrow column itself, was most of what made the app read as a
 * phone app someone had opened on a laptop.
 */
export default function AppShell({
  children,
  step,
  totalSteps,
  back,
  title,
  clinicianLink = false,
  width = 'task',
}) {
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const { patient } = usePatient();
  const navigate = useNavigate();
  const { pathname } = useLocation();

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
    <div className={`app-shell app-shell--${width}`}>
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
            /* `/home` for a signed-in patient, `/` for everyone else. This used to be `/`
               for both because the route itself forked on the session; now that `/` is
               always the landing page the brand has to make the choice. Deliberately not
               `/start` for a signed-out visitor — someone who taps the brand wants the
               front door, not the OTP form.

               Note this is live during the questionnaire flow, where the shell renders the
               brand rather than a back control and neither the in-progress answers nor
               in-flight photo uploads are persisted anywhere — tapping it there abandons
               them. */
            <button
              type="button"
              className="app-shell__brand"
              onClick={() => navigate(patient ? '/home' : '/')}
              aria-label="OralScreen — go to home"
            >
              <img src={oralscreenLogo} alt="" className="app-shell__logo" width="32" height="32" />
              <span>OralScreen</span>
            </button>
          )}

          {back && title && <h1 className="app-shell__bar-title">{title}</h1>}

          {/* Hidden for the duration of a screening — `showSteps` is what "mid-flow" means
              here. Nothing in the questionnaire or the photo step is persisted, so leaving
              abandons it; that is why AccountMenu keeps Home and New assessment two taps
              deep, and putting the same destinations one tap away in the bar would undo it.
              Everywhere else they show, including in `back` mode: these are top-level
              sections reached from this bar, so having the bar drop them on arrival is what
              would be strange. */}
          {patient && !showSteps && (
            <nav className="app-shell__links" aria-label="Sections">
              {NAV_LINKS.map((link) => (
                <button
                  type="button"
                  key={link.path}
                  className="app-shell__link"
                  aria-current={pathname === link.path ? 'page' : undefined}
                  onClick={() => navigate(link.path)}
                >
                  {link.label}
                </button>
              ))}
            </nav>
          )}

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
