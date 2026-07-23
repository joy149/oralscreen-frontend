import oralscreenLogo from '../../assets/oralscreen_icon.jpg';
import './AppShell.css';

const DOCTOR_NAME = import.meta.env.VITE_DOCTOR_NAME || 'Dr. [Name]';
const HOSPITAL_NAME = import.meta.env.VITE_HOSPITAL_NAME || '[Hospital Name]';

export default function AppShell({ children, step, totalSteps }) {
  return (
    <div className="app-shell">
      <header className="app-shell__header">
        <div className="app-shell__brand">
          <img src={oralscreenLogo} alt="" className="app-shell__logo" />
          <span>OralScreen</span>
        </div>
        {step && totalSteps && (
          <div className="app-shell__progress" aria-label={`Step ${step} of ${totalSteps}`}>
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

      <main className="app-shell__main">{children}</main>

      <footer className="app-shell__footer">
        Screenings reviewed by {DOCTOR_NAME} · {HOSPITAL_NAME}
      </footer>
    </div>
  );
}
