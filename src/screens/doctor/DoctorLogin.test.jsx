import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import DoctorLogin from './DoctorLogin';
import { ApiError, api as apiMock } from '../../api/client';
import { routerFuture } from '../../test/utils';

const navigate = vi.fn();
const setSession = vi.fn();
const setupRecaptcha = vi.fn();
const sendFirebasePhoneOtp = vi.fn();
const firebaseSignOut = vi.fn();
// Hoisted: the `vi.mock` factory below reads `auth` eagerly, before a plain `const` in
// this file would have been initialised.
const { mockAuth } = vi.hoisted(() => ({ mockAuth: { currentUser: null } }));

vi.mock('../../api/client', async (importOriginal) => {
  const { mockApiModule } = await import('../../test/apiMock.js');
  return mockApiModule(await importOriginal());
});

vi.mock('react-router-dom', async (importOriginal) => ({
  ...(await importOriginal()),
  useNavigate: () => navigate,
}));

vi.mock('../../context/DoctorSessionContext', async (importOriginal) => ({
  ...(await importOriginal()),
  useDoctorSession: () => ({ session: null, setSession, endSession: vi.fn() }),
}));

vi.mock('../../config/firebase', () => ({
  auth: mockAuth,
  setupRecaptcha: (...a) => setupRecaptcha(...a),
  sendFirebasePhoneOtp: (...a) => sendFirebasePhoneOtp(...a),
  firebaseSignOut: (...a) => firebaseSignOut(...a),
  // api/client imports this at module load, and DoctorSessionContext pulls the real
  // module in through importOriginal — the mock has to be complete.
  getFirebaseToken: vi.fn().mockResolvedValue('token'),
}));

function renderLogin({ from } = {}) {
  const user = userEvent.setup();
  render(
    <MemoryRouter
      initialEntries={[{ pathname: '/doctor/login', state: from ? { from } : undefined }]}
      future={routerFuture}
    >
      <Routes>
        <Route path="/doctor/login" element={<DoctorLogin />} />
      </Routes>
    </MemoryRouter>
  );
  return { user };
}

async function reachOtpStep(user, phone = '9876543210') {
  await user.type(screen.getByLabelText('Mobile number'), phone);
  await user.click(screen.getByRole('button', { name: 'Send Verification OTP' }));
  await screen.findByRole('heading', { name: 'Verify your number' });
}

function typeOtp(user, code = '123456') {
  return user.type(screen.getByLabelText('Digit 1 of 6'), code);
}

let confirm;

beforeEach(() => {
  navigate.mockReset();
  setSession.mockReset();
  firebaseSignOut.mockReset();
  mockAuth.currentUser = null;
  vi.spyOn(console, 'error').mockImplementation(() => {});
  confirm = vi.fn().mockResolvedValue({});
  setupRecaptcha.mockReturnValue({ id: 'verifier' });
  sendFirebasePhoneOtp.mockResolvedValue({ confirm });
});

describe('entering the screen', () => {
  it('clears any existing Firebase session — arriving here means "sign me in"', () => {
    renderLogin();

    expect(firebaseSignOut).toHaveBeenCalled();
  });

  it('never bounces an existing session straight to the queue', () => {
    renderLogin();

    expect(navigate).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Mobile number')).toBeInTheDocument();
  });
});

describe('the phone step', () => {
  it('strips non-digits and caps at ten', async () => {
    const { user } = renderLogin();

    await user.type(screen.getByLabelText('Mobile number'), 'ab98765-4321099');

    expect(screen.getByLabelText('Mobile number')).toHaveValue('9876543210');
  });

  it('holds the send button until ten digits are present', async () => {
    const { user } = renderLogin();

    expect(screen.getByRole('button', { name: 'Send Verification OTP' })).toBeDisabled();

    await user.type(screen.getByLabelText('Mobile number'), '9876543210');
    expect(screen.getByRole('button', { name: 'Send Verification OTP' })).toBeEnabled();
  });

  it('sends the OTP and moves to the verification step', async () => {
    const { user } = renderLogin();

    await reachOtpStep(user);

    expect(setupRecaptcha).toHaveBeenCalledWith('recaptcha-container');
    expect(sendFirebasePhoneOtp).toHaveBeenCalledWith('9876543210', { id: 'verifier' });
    expect(screen.getByText('+91 9876543210')).toBeInTheDocument();
  });

  it('reports a send failure as an alert and stays put', async () => {
    sendFirebasePhoneOtp.mockRejectedValue(new Error('quota'));
    const { user } = renderLogin();

    await user.type(screen.getByLabelText('Mobile number'), '9876543210');
    await user.click(screen.getByRole('button', { name: 'Send Verification OTP' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not send OTP. Please check your number and try again.'
    );
    expect(screen.getByLabelText('Mobile number')).toBeInTheDocument();
  });
});

describe('the OTP step', () => {
  it('goes back to the phone step and signs out again', async () => {
    const { user } = renderLogin();
    await reachOtpStep(user);
    firebaseSignOut.mockClear();

    await user.click(screen.getByRole('button', { name: 'Change number' }));

    expect(screen.getByLabelText('Mobile number')).toBeInTheDocument();
    expect(firebaseSignOut).toHaveBeenCalled();
  });

  it('reports a wrong code without leaving the step', async () => {
    confirm.mockRejectedValue(new Error('Invalid verification code'));
    const { user } = renderLogin();
    await reachOtpStep(user);

    await typeOtp(user);

    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid verification code');
    expect(screen.getByRole('heading', { name: 'Verify your number' })).toBeInTheDocument();
  });

  it('falls back to generic copy for a failure with no message', async () => {
    confirm.mockRejectedValue({});
    const { user } = renderLogin();
    await reachOtpStep(user);

    await typeOtp(user);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Invalid or expired OTP code. Please try again.'
    );
  });

  it('tells the doctor to request a new code when the session is gone', async () => {
    sendFirebasePhoneOtp.mockResolvedValue({});
    const { user } = renderLogin();
    await reachOtpStep(user);

    await typeOtp(user);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'OTP session expired. Please request a new code.'
    );
  });

  describe('resending', () => {
    // Fake timers must be installed before the component mounts: OtpInput's cooldown
    // interval is scheduled on mount, and swapping the timer implementation afterwards
    // leaves that already-scheduled interval on the real clock.
    beforeEach(() => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    /** Mounts, verifies the number, and waits out OtpInput's 60s resend cooldown. */
    async function reachResendableOtp() {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      renderLogin();
      await reachOtpStep(user);
      await vi.advanceTimersByTimeAsync(60000);
      return user;
    }

    it('resends a code on request', async () => {
      const user = await reachResendableOtp();
      sendFirebasePhoneOtp.mockClear();

      await user.click(await screen.findByRole('button', { name: 'Resend OTP Code' }));

      await waitFor(() => expect(sendFirebasePhoneOtp).toHaveBeenCalledTimes(1));
    });

    it('reports a failed resend inline', async () => {
      const user = await reachResendableOtp();
      sendFirebasePhoneOtp.mockRejectedValue(new Error('quota'));

      await user.click(await screen.findByRole('button', { name: 'Resend OTP Code' }));

      expect(await screen.findByText('Could not resend OTP. Please try again.')).toBeInTheDocument();
    });
  });
});

describe('routing after verification', () => {
  it('signs an approved doctor straight in', async () => {
    mockAuth.currentUser = { phoneNumber: '+919876543210' };
    apiMock.checkDoctor.mockResolvedValue({ exists: true, active: true, doctorId: 'd1' });
    apiMock.loginDoctor.mockResolvedValue({ doctorId: 'd1', name: 'Dr Rao' });
    const { user } = renderLogin();
    await reachOtpStep(user);

    await typeOtp(user);

    await waitFor(() =>
      expect(setSession).toHaveBeenCalledWith({
        doctorId: 'd1',
        name: 'Dr Rao',
        phoneNumber: '+919876543210',
      })
    );
    expect(navigate).toHaveBeenCalledWith('/doctor', { replace: true });
  });

  it('returns to the page the guard bounced them from', async () => {
    apiMock.checkDoctor.mockResolvedValue({ exists: true, active: true, doctorId: 'd1' });
    apiMock.loginDoctor.mockResolvedValue({ doctorId: 'd1', name: 'Dr Rao' });
    const { user } = renderLogin({ from: '/doctor/case/a1' });
    await reachOtpStep(user);

    await typeOtp(user);

    await waitFor(() =>
      expect(navigate).toHaveBeenCalledWith('/doctor/case/a1', { replace: true })
    );
  });

  it('falls back to the typed number when Firebase reports none', async () => {
    apiMock.checkDoctor.mockResolvedValue({ exists: true, active: true, doctorId: 'd1' });
    apiMock.loginDoctor.mockResolvedValue({ doctorId: 'd1', name: 'Dr Rao' });
    const { user } = renderLogin();
    await reachOtpStep(user);

    await typeOtp(user);

    await waitFor(() =>
      expect(setSession).toHaveBeenCalledWith(
        expect.objectContaining({ phoneNumber: '9876543210' })
      )
    );
  });

  it('falls back to the checked doctorId when login returns none', async () => {
    apiMock.checkDoctor.mockResolvedValue({ exists: true, active: true, doctorId: 'd-check' });
    apiMock.loginDoctor.mockResolvedValue({});
    const { user } = renderLogin();
    await reachOtpStep(user);

    await typeOtp(user);

    await waitFor(() =>
      expect(setSession).toHaveBeenCalledWith(expect.objectContaining({ doctorId: 'd-check' }))
    );
  });

  it('shows the registration form for an unknown number', async () => {
    apiMock.checkDoctor.mockResolvedValue({ exists: false });
    const { user } = renderLogin();
    await reachOtpStep(user);

    await typeOtp(user);

    expect(
      await screen.findByText(/You're not registered yet/)
    ).toBeInTheDocument();
  });

  it('shows the pending notice for a registered but unapproved doctor', async () => {
    apiMock.checkDoctor.mockResolvedValue({ exists: true, active: false });
    const { user } = renderLogin();
    await reachOtpStep(user);

    await typeOtp(user);

    expect(await screen.findByText(/Your registration is pending approval/)).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Registration received' })).toBeInTheDocument();
  });

  it('returns to the phone step when the status check fails', async () => {
    apiMock.checkDoctor.mockRejectedValue(new ApiError('boom', 500, null));
    const { user } = renderLogin();
    await reachOtpStep(user);

    await typeOtp(user);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not verify doctor status. Please try again.'
    );
    expect(screen.getByLabelText('Mobile number')).toBeInTheDocument();
  });
});

describe('when the login call itself fails', () => {
  async function verifyApprovedDoctor(user) {
    apiMock.checkDoctor.mockResolvedValue({ exists: true, active: true, doctorId: 'd1' });
    await reachOtpStep(user);
    await typeOtp(user);
  }

  it('explains a 404 as a missing profile and returns to the phone step', async () => {
    apiMock.loginDoctor.mockRejectedValue(new ApiError('gone', 404, null));
    const { user } = renderLogin();

    await verifyApprovedDoctor(user);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No doctor profile is registered for this number.'
    );
    expect(screen.getByLabelText('Mobile number')).toBeInTheDocument();
  });

  it('treats a 403 as pending approval, not as a hard failure', async () => {
    apiMock.loginDoctor.mockRejectedValue(new ApiError('forbidden', 403, null));
    const { user } = renderLogin();

    await verifyApprovedDoctor(user);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Your registration is still pending approval.'
    );
    expect(screen.getByText(/Your registration is pending approval/)).toBeInTheDocument();
  });

  it('surfaces any other error message', async () => {
    apiMock.loginDoctor.mockRejectedValue(new ApiError('Service unavailable', 503, null));
    const { user } = renderLogin();

    await verifyApprovedDoctor(user);

    expect(await screen.findByRole('alert')).toHaveTextContent('Service unavailable');
  });
});

describe('registering', () => {
  async function reachRegisterStep(user) {
    apiMock.checkDoctor.mockResolvedValue({ exists: false });
    await reachOtpStep(user);
    await typeOtp(user);
    await screen.findByText(/You're not registered yet/);
  }

  it('requires both a name and a registration ID', async () => {
    const { user } = renderLogin();
    await reachRegisterStep(user);

    const submit = screen.getByRole('button', { name: 'Submit registration' });
    expect(submit).toBeDisabled();

    await user.type(screen.getByLabelText('Full name'), 'Dr Rao');
    expect(submit).toBeDisabled();

    await user.type(screen.getByLabelText('Medical registration ID'), 'MCI-1234');
    expect(submit).toBeEnabled();
  });

  it('submits the trimmed details without the phone number', async () => {
    apiMock.registerDoctor.mockResolvedValue({});
    const { user } = renderLogin();
    await reachRegisterStep(user);

    await user.type(screen.getByLabelText('Full name'), '  Dr Rao  ');
    await user.type(screen.getByLabelText('Medical registration ID'), '  MCI-1234  ');
    await user.click(screen.getByRole('button', { name: 'Submit registration' }));

    // The server registers the verified number from the token — a registration can only
    // ever be created for a phone the caller controls.
    await waitFor(() =>
      expect(apiMock.registerDoctor).toHaveBeenCalledWith({
        name: 'Dr Rao',
        registrationId: 'MCI-1234',
      })
    );
    expect(await screen.findByText(/Your registration is pending approval/)).toBeInTheDocument();
  });

  it('names a duplicate registration specifically', async () => {
    apiMock.registerDoctor.mockRejectedValue(new ApiError('conflict', 409, null));
    const { user } = renderLogin();
    await reachRegisterStep(user);

    await user.type(screen.getByLabelText('Full name'), 'Dr Rao');
    await user.type(screen.getByLabelText('Medical registration ID'), 'MCI-1234');
    await user.click(screen.getByRole('button', { name: 'Submit registration' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'This phone number or registration ID is already registered.'
    );
  });

  it('shows generic copy for any other registration failure', async () => {
    apiMock.registerDoctor.mockRejectedValue(new ApiError('boom', 500, null));
    const { user } = renderLogin();
    await reachRegisterStep(user);

    await user.type(screen.getByLabelText('Full name'), 'Dr Rao');
    await user.type(screen.getByLabelText('Medical registration ID'), 'MCI-1234');
    await user.click(screen.getByRole('button', { name: 'Submit registration' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Registration could not be submitted. Please try again.'
    );
  });

  it('can back out to the phone step, clearing the typed name', async () => {
    const { user } = renderLogin();
    await reachRegisterStep(user);
    await user.type(screen.getByLabelText('Full name'), 'Dr Rao');

    await user.click(screen.getByRole('button', { name: 'Back' }));

    expect(screen.getByLabelText('Mobile number')).toBeInTheDocument();
  });
});

describe('the pending step', () => {
  it('offers another number to try', async () => {
    apiMock.checkDoctor.mockResolvedValue({ exists: true, active: false });
    const { user } = renderLogin();
    await reachOtpStep(user);
    await typeOtp(user);
    await screen.findByText(/Your registration is pending approval/);

    await user.click(screen.getByRole('button', { name: 'Try another number' }));

    expect(screen.getByLabelText('Mobile number')).toBeInTheDocument();
  });
});
