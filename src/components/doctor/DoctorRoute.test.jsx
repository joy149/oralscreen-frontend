import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import DoctorRoute from './DoctorRoute';
import { routerFuture } from '../../test/utils';

const onAuthStateChanged = vi.fn();
const endSession = vi.fn();
let session = null;

vi.mock('firebase/auth', () => ({
  onAuthStateChanged: (...args) => onAuthStateChanged(...args),
}));

vi.mock('../../config/firebase', () => ({ auth: { id: 'auth' } }));

vi.mock('../../context/DoctorSessionContext', () => ({
  useDoctorSession: () => ({ session, endSession }),
}));

/** Emits the given user to the auth listener at mount time. */
function withAuthUser(user) {
  onAuthStateChanged.mockImplementation((_auth, next) => {
    next(user);
    return vi.fn();
  });
}

function renderRoute(route = '/doctor') {
  return render(
    <MemoryRouter initialEntries={[route]} future={routerFuture}>
      <Routes>
        <Route element={<DoctorRoute />}>
          <Route path="/doctor" element={<p>Queue</p>} />
          <Route path="/doctor/case/:id" element={<p>Case</p>} />
        </Route>
        <Route path="/doctor/login" element={<p>Login screen</p>} />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  session = null;
  endSession.mockReset();
  onAuthStateChanged.mockReset();
});

describe('while the auth state is still resolving', () => {
  it('shows a loading state rather than deciding early', () => {
    onAuthStateChanged.mockImplementation(() => vi.fn());
    session = { doctorId: 'd1' };

    renderRoute();

    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.queryByText('Queue')).not.toBeInTheDocument();
    expect(screen.queryByText('Login screen')).not.toBeInTheDocument();
  });
});

describe('signed in with a stored session', () => {
  it('renders the guarded screen', () => {
    withAuthUser({ uid: 'u1' });
    session = { doctorId: 'd1', name: 'Dr Rao' };

    renderRoute();

    expect(screen.getByText('Queue')).toBeInTheDocument();
  });

  it('renders nested case routes too', () => {
    withAuthUser({ uid: 'u1' });
    session = { doctorId: 'd1' };

    renderRoute('/doctor/case/a1');

    expect(screen.getByText('Case')).toBeInTheDocument();
  });
});

describe('signed in but with no stored session', () => {
  it('redirects to login — the profile is needed to render the screens', () => {
    withAuthUser({ uid: 'u1' });
    session = null;

    renderRoute();

    expect(screen.getByText('Login screen')).toBeInTheDocument();
  });
});

describe('not signed in', () => {
  it('redirects to login', () => {
    withAuthUser(null);
    session = null;

    renderRoute();

    expect(screen.getByText('Login screen')).toBeInTheDocument();
  });

  it('drops a stale stored session so login and guard cannot bounce off each other', () => {
    withAuthUser(null);
    session = { doctorId: 'd1' };

    renderRoute();

    expect(endSession).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Login screen')).toBeInTheDocument();
  });

  it('does not call endSession when there was no session to drop', () => {
    withAuthUser(null);
    session = null;

    renderRoute();

    expect(endSession).not.toHaveBeenCalled();
  });
});

describe('listener lifecycle', () => {
  it('subscribes to the app auth instance and unsubscribes on unmount', () => {
    const unsubscribe = vi.fn();
    onAuthStateChanged.mockImplementation((_auth, next) => {
      next({ uid: 'u1' });
      return unsubscribe;
    });
    session = { doctorId: 'd1' };

    const { unmount } = renderRoute();

    expect(onAuthStateChanged).toHaveBeenCalledWith({ id: 'auth' }, expect.any(Function));

    unmount();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });
});
