import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import useClinicianTheme from './useClinicianTheme';
import ClinicianThemeToggle from './ClinicianThemeToggle';

const STORAGE_KEY = 'oralscreen.clinicianTheme';

function Harness() {
  const { theme, toggleTheme } = useClinicianTheme();
  return (
    <div className="doctor-shell">
      <span data-testid="theme">{theme}</span>
      <ClinicianThemeToggle theme={theme} onToggle={toggleTheme} />
    </div>
  );
}

/**
 * The visual result of the theme cannot be asserted here — jsdom has no CSS engine, and
 * the palette is a block of custom-property overrides. What is testable is the contract
 * the stylesheet depends on: the attribute that selects it, where the choice is stored,
 * and that it is torn down so a patient screen never inherits it.
 */
describe('the clinician theme', () => {
  it('starts dark, which is the surface the clinician side is identified by', () => {
    render(<Harness />);

    expect(screen.getByTestId('theme')).toHaveTextContent('dark');
    expect(document.documentElement).toHaveAttribute('data-clinician-theme', 'dark');
  });

  it('switches to light and back', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole('button', { name: /switch to light theme/i }));
    expect(document.documentElement).toHaveAttribute('data-clinician-theme', 'light');

    await user.click(screen.getByRole('button', { name: /switch to dark theme/i }));
    expect(document.documentElement).toHaveAttribute('data-clinician-theme', 'dark');
  });

  it('remembers the choice for the next visit', async () => {
    const user = userEvent.setup();
    const { unmount } = render(<Harness />);

    await user.click(screen.getByRole('button', { name: /switch to light theme/i }));
    expect(localStorage.getItem(STORAGE_KEY)).toBe('light');

    unmount();
    render(<Harness />);
    expect(screen.getByTestId('theme')).toHaveTextContent('light');
  });

  it('ignores a stored value that is not a theme', () => {
    localStorage.setItem(STORAGE_KEY, 'chartreuse');

    render(<Harness />);

    expect(screen.getByTestId('theme')).toHaveTextContent('dark');
  });

  /**
   * The attribute sits on <html> so it can be set from anywhere, which makes leaving it
   * behind the obvious hazard: the token overrides are scoped to the clinician roots, but
   * a stale attribute is still a lie about what is on screen.
   */
  it('takes the attribute off the document when the clinician screen unmounts', () => {
    const { unmount } = render(<Harness />);
    expect(document.documentElement).toHaveAttribute('data-clinician-theme');

    unmount();

    expect(document.documentElement).not.toHaveAttribute('data-clinician-theme');
  });

  it('labels the control with the theme it will switch to, not the one showing', () => {
    render(<Harness />);

    // Dark is showing, so the control offers light.
    expect(screen.getByRole('button', { name: /switch to light theme/i })).toBeInTheDocument();
  });
});
