import { Moon, Sun } from 'lucide-react';

/**
 * The control shows the surface it will switch *to*, not the one currently applied —
 * a moon while light is showing. Labelling it with the current state reads as a status
 * indicator and gets clicked by mistake.
 */
export default function ClinicianThemeToggle({ theme, onToggle }) {
  const goingDark = theme === 'light';

  return (
    <button
      type="button"
      className="clinician-theme-toggle"
      onClick={onToggle}
      aria-label={goingDark ? 'Switch to dark theme' : 'Switch to light theme'}
      title={goingDark ? 'Dark theme' : 'Light theme'}
    >
      {goingDark ? <Moon size={16} aria-hidden="true" /> : <Sun size={16} aria-hidden="true" />}
    </button>
  );
}
