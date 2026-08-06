import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AppShell from './AppShell';
import { routerFuture } from '../../test/utils';

const navigate = vi.fn();
let patient = null;

vi.mock('react-router-dom', async (importOriginal) => ({
  ...(await importOriginal()),
  useNavigate: () => navigate,
}));

vi.mock('../../context/PatientContext', () => ({
  usePatient: () => ({ patient, clearPatient: vi.fn() }),
}));

function setup(props = {}, children = <p>Screen body</p>) {
  const user = userEvent.setup();
  const utils = render(
    <MemoryRouter future={routerFuture}>
      <AppShell {...props}>{children}</AppShell>
    </MemoryRouter>
  );
  return { user, ...utils };
}

/** Flips navigator.onLine and fires the matching window event. */
function goOffline(offline) {
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(!offline);
  act(() => window.dispatchEvent(new Event(offline ? 'offline' : 'online')));
}

beforeEach(() => {
  navigate.mockReset();
  patient = null;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('chrome', () => {
  it('renders children in the main landmark with a skip link', () => {
    setup();

    expect(screen.getByRole('main')).toHaveTextContent('Screen body');
    expect(screen.getByRole('link', { name: 'Skip to content' })).toHaveAttribute('href', '#main');
  });

  it('shows the brand when there is no back control', () => {
    const { container } = setup();

    expect(container.querySelector('.app-shell__brand')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Go back' })).not.toBeInTheDocument();
  });

  it('shows the account menu only once a patient is signed in', () => {
    const { rerender } = setup();
    expect(screen.queryByRole('button', { name: 'Account menu' })).not.toBeInTheDocument();

    patient = { id: 'p1' };
    rerender(
      <MemoryRouter future={routerFuture}>
        <AppShell>body</AppShell>
      </MemoryRouter>
    );
    expect(screen.getByRole('button', { name: 'Account menu' })).toBeInTheDocument();
  });
});

describe('the back control', () => {
  it('replaces the brand and renders the title as the screen h1', () => {
    const { container } = setup({ back: true, title: 'Your photos' });

    expect(screen.getByRole('button', { name: 'Go back' })).toBeInTheDocument();
    expect(container.querySelector('.app-shell__brand')).toBeNull();
    expect(screen.getByRole('heading', { level: 1, name: 'Your photos' })).toBeInTheDocument();
  });

  it('goes back through history when `back` is true', async () => {
    const { user } = setup({ back: true });

    await user.click(screen.getByRole('button', { name: 'Go back' }));

    expect(navigate).toHaveBeenCalledWith(-1);
  });

  it('navigates to a path when `back` is a string', async () => {
    const { user } = setup({ back: '/assessments' });

    await user.click(screen.getByRole('button', { name: 'Go back' }));

    expect(navigate).toHaveBeenCalledWith('/assessments');
  });

  it('runs a callback when `back` is a function', async () => {
    const onBack = vi.fn();
    const { user } = setup({ back: onBack });

    await user.click(screen.getByRole('button', { name: 'Go back' }));

    expect(onBack).toHaveBeenCalledTimes(1);
    expect(navigate).not.toHaveBeenCalled();
  });

  it('omits the title when there is no back control to pair it with', () => {
    setup({ title: 'Your photos' });

    expect(screen.queryByRole('heading', { level: 1 })).not.toBeInTheDocument();
  });
});

describe('the step indicator', () => {
  it('is hidden unless both step and totalSteps are given', () => {
    const { container, rerender } = setup({ step: 2 });
    expect(container.querySelector('.app-shell__steps')).toBeNull();

    rerender(
      <MemoryRouter future={routerFuture}>
        <AppShell totalSteps={3}>body</AppShell>
      </MemoryRouter>
    );
    expect(container.querySelector('.app-shell__steps')).toBeNull();
  });

  it.each([
    [1, 'Symptoms'],
    [2, 'Photos'],
    [3, 'Result'],
  ])('names step %i as "%s"', (step, label) => {
    setup({ step, totalSteps: 3 });

    expect(screen.getByText(`Step ${step} of 3`)).toBeInTheDocument();
    expect(screen.getByText(label)).toBeInTheDocument();
  });
});

describe('the offline banner', () => {
  it('is hidden while online', () => {
    setup();

    expect(screen.queryByText(/Offline/)).not.toBeInTheDocument();
  });

  it('appears when the browser goes offline and reassures about saved progress', () => {
    setup();

    goOffline(true);

    expect(screen.getByText(/Offline — your progress is saved on this device/)).toBeInTheDocument();
  });

  it('disappears again on reconnect', () => {
    setup();

    goOffline(true);
    goOffline(false);

    expect(screen.queryByText(/Offline/)).not.toBeInTheDocument();
  });

  it('renders immediately when the app mounts already offline', () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);

    setup();

    expect(screen.getByText(/Offline/)).toBeInTheDocument();
  });

  it('removes its window listeners on unmount', () => {
    const removeSpy = vi.spyOn(window, 'removeEventListener');
    const { unmount } = setup();

    unmount();

    expect(removeSpy).toHaveBeenCalledWith('online', expect.any(Function));
    expect(removeSpy).toHaveBeenCalledWith('offline', expect.any(Function));
  });
});

describe('the footer trust line', () => {
  it('falls back to the claim that is always true when no reviewer is configured', () => {
    // .env ships VITE_DOCTOR_NAME / VITE_HOSPITAL_NAME as bracketed placeholders, which
    // `configured()` treats as unset — the footer must never print "[Doctor Name]".
    setup();

    expect(
      screen.getByText('Every screening is reviewed by a licensed dentist')
    ).toBeInTheDocument();
    expect(screen.queryByText(/\[.*\]/)).not.toBeInTheDocument();
  });

  it('hides the clinician link by default', () => {
    setup();

    expect(screen.queryByRole('button', { name: 'Clinician sign-in' })).not.toBeInTheDocument();
  });

  it('routes to the clinician login when the link is enabled', async () => {
    const { user } = setup({ clinicianLink: true });

    await user.click(screen.getByRole('button', { name: 'Clinician sign-in' }));

    expect(navigate).toHaveBeenCalledWith('/doctor/login');
  });
});
