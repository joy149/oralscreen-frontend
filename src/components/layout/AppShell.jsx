import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { WifiOff } from 'lucide-react';
import oralscreenLogo from '../../assets/oralscreen_icon.jpg';
import './AppShell.css';

const DOCTOR_NAME = import.meta.env.VITE_DOCTOR_NAME || 'Dr. [Name]';
const HOSPITAL_NAME = import.meta.env.VITE_HOSPITAL_NAME || '[Hospital Name]';

export default function AppShell({ children, step, totalSteps }) {
  const [isOffline, setIsOffline] = useState(!navigator.onLine);

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
  return (
    <div className="app-shell">
      <header className="app-shell__header">
        <div className="app-shell__brand">
          <img src={oralscreenLogo} alt="" className="app-shell__logo" />
          <span>OralScreen</span>
        </div>
        {step && totalSteps && (
          <div className="app-shell__progress" aria-label={`Step ${step} of ${totalSteps}`}>
            <div className="app-shell__progress-track">
              <motion.div
                className="app-shell__progress-fill"
                initial={false}
                animate={{ width: `${((step - 1) / (totalSteps - 1)) * 100}%` }}
                transition={{ duration: 0.4, ease: [0.4, 0, 0.2, 1] }}
              />
            </div>
            {Array.from({ length: totalSteps }).map((_, i) => (
              <span
                key={i}
                className={`app-shell__progress-dot ${i < step ? 'is-complete' : ''} ${
                  i === step - 1 ? 'is-current' : ''
                }`}
              />
            ))}
          </div>
        )}
      </header>
      {isOffline && (
        <div className="app-shell__offline-banner" role="status" aria-live="polite">
          <WifiOff size={16} />
          <span>Offline Mode — Your screening progress is saved locally and will upload when connected.</span>
        </div>
      )}

      <main className="app-shell__main">{children}</main>

      <footer className="app-shell__footer">
        Screenings reviewed by {DOCTOR_NAME} · {HOSPITAL_NAME}
      </footer>
    </div>
  );
}

