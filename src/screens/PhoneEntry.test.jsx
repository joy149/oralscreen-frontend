import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import PhoneEntry from './PhoneEntry';
import { ApiError, api as apiMock } from '../api/client';
import { routerFuture } from '../test/utils';

const navigate = vi.fn();
const setPatient = vi.fn();
const setupRecaptcha = vi.fn();
const sendFirebasePhoneOtp = vi.fn();

vi.mock('../api/client', async (importOriginal) => {
  const { mockApiModule } = await import('../test/apiMock.js');
  return mockApiModule(await importOriginal());
});

vi.mock('react-router-dom', async (importOriginal) => ({
  ...(await importOriginal()),
  useNavigate: () => navigate,
}));

vi.mock('../context/PatientContext', () => ({
  usePatient: () => ({ patient: null, setPatient, clearPatient: vi.fn() }),
}));

vi.mock('../config/firebase', () => ({
  setupRecaptcha: (...a) => setupRecaptcha(...a),
  sendFirebasePhoneOtp: (...a) => sendFirebasePhoneOtp(...a),
  // The real implementation is covered in config/firebase.test.js; here it just has to be
  // the canonical form so the assertion on what gets POSTed is meaningful.
  formatE164Phone: (value) => `+91${String(value).replace(/\D/g, '').slice(-10)}`,
}));

function renderEntry({ sessionExpired = false } = {}) {
  const user = userEvent.setup();
  render(
    <MemoryRouter
      initialEntries={[{ pathname: '/', state: sessionExpired ? { sessionExpired: true } : undefined }]}
      future={routerFuture}
    >
      <Routes>
        <Route path="/" element={<PhoneEntry />} />
      </Routes>
    </MemoryRouter>
  );
  return { user };
}

/** Drives the phone stage through to the OTP stage. */
async function reachOtpStage(user, phone = '9876543210') {
  await user.type(screen.getByLabelText('Mobile number'), phone);
  await user.click(screen.getByRole('button', { name: 'Send Verification OTP' }));
  await screen.findByRole('heading', { name: 'Enter 6-digit OTP' });
}

function typeOtp(user, code = '123456') {
  return user.type(screen.getByLabelText('Digit 1 of 6'), code);
}

let confirm;

beforeEach(() => {
  navigate.mockReset();
  setPatient.mockReset();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  confirm = vi.fn().mockResolvedValue({ user: { uid: 'u1' } });
  setupRecaptcha.mockReturnValue({ id: 'verifier' });
  sendFirebasePhoneOtp.mockResolvedValue({ confirm });
  apiMock.getSexOptions.mockResolvedValue([
    { value: 'Male', label: 'Male' },
    { value: 'Female', label: 'Female' },
  ]);
});

describe('the phone stage', () => {
  it('leads with the value proposition and the trust badges', () => {
    renderEntry();

    expect(screen.getByRole('heading', { level: 1, name: "Let's take a look" })).toBeInTheDocument();
    expect(screen.getByText('100% Private')).toBeInTheDocument();
    expect(screen.getByText('Dentist Verified')).toBeInTheDocument();
  });

  it('sets up the invisible reCAPTCHA on mount', () => {
    renderEntry();

    expect(setupRecaptcha).toHaveBeenCalledWith('recaptcha-container');
  });

  it('survives reCAPTCHA setup throwing on mount', () => {
    setupRecaptcha.mockImplementationOnce(() => {
      throw new Error('no container');
    });

    expect(() => renderEntry()).not.toThrow();
    expect(screen.getByLabelText('Mobile number')).toBeInTheDocument();
  });

  it('explains an expired session rather than dropping the patient with no context', () => {
    renderEntry({ sessionExpired: true });

    expect(screen.getByRole('status')).toHaveTextContent(
      'You were signed out. Verify your number again to get back to your screenings.'
    );
  });

  it('says nothing about sessions on a normal first visit', () => {
    renderEntry();

    expect(screen.queryByText(/You were signed out/)).not.toBeInTheDocument();
  });
});

describe('phone number entry', () => {
  it('strips non-digits and caps input at ten digits', async () => {
    const { user } = renderEntry();
    const input = screen.getByLabelText('Mobile number');

    await user.type(input, '98a76-543 21099');

    expect(input).toHaveValue('9876543210');
  });

  it('keeps the submit button disabled until ten digits are entered', async () => {
    const { user } = renderEntry();

    expect(screen.getByRole('button', { name: 'Send Verification OTP' })).toBeDisabled();

    await user.type(screen.getByLabelText('Mobile number'), '98765');
    expect(screen.getByRole('button', { name: 'Send Verification OTP' })).toBeDisabled();

    await user.type(screen.getByLabelText('Mobile number'), '43210');
    expect(screen.getByRole('button', { name: 'Send Verification OTP' })).toBeEnabled();
  });

  it('flags a partially typed number as invalid for assistive tech', async () => {
    const { user } = renderEntry();
    const input = screen.getByLabelText('Mobile number');

    await user.type(input, '98765');
    expect(input).toHaveAttribute('aria-invalid', 'true');

    await user.type(input, '43210');
    expect(input).toHaveAttribute('aria-invalid', 'false');
  });

  it('is not marked invalid before anything has been typed', () => {
    renderEntry();

    expect(screen.getByLabelText('Mobile number')).toHaveAttribute('aria-invalid', 'false');
  });
});

describe('sending the OTP', () => {
  it('rebuilds the verifier and sends, then shows the OTP stage', async () => {
    const { user } = renderEntry();

    await reachOtpStage(user);

    expect(sendFirebasePhoneOtp).toHaveBeenCalledWith('9876543210', { id: 'verifier' });
    expect(screen.getByText('+91 9876543210')).toBeInTheDocument();
  });

  it('shows a sending state that blocks a second tap', async () => {
    let resolveSend;
    sendFirebasePhoneOtp.mockReturnValue(new Promise((r) => { resolveSend = r; }));
    const { user } = renderEntry();

    await user.type(screen.getByLabelText('Mobile number'), '9876543210');
    await user.click(screen.getByRole('button', { name: 'Send Verification OTP' }));

    expect(await screen.findByRole('button', { name: 'Sending OTP…' })).toBeDisabled();

    resolveSend({ confirm });
    await screen.findByRole('heading', { name: 'Enter 6-digit OTP' });
  });

  /**
   * KNOWN DEFECT, pinned rather than asserted as desirable.
   *
   * `sendOtpCode` reports a send failure via `setOtpError`, but that message is only
   * rendered inside the `stage === 'otp'` block. A failure leaves the stage at 'phone',
   * so the patient sees *nothing at all*: the button says "Sending OTP…", returns to
   * "Send Verification OTP", and no SMS ever arrives. This is the primary action of the
   * sign-in screen failing silently — including for the common `auth/too-many-requests`
   * quota error.
   *
   * The fix is to render `otpError` in the phone stage too (or to hold it in the shared
   * `error` state). When that lands, replace these with assertions that the message is
   * visible.
   */
  it('currently shows the patient nothing when the send fails', async () => {
    sendFirebasePhoneOtp.mockRejectedValue(new Error('auth/too-many-requests'));
    const { user } = renderEntry();

    await user.type(screen.getByLabelText('Mobile number'), '9876543210');
    await user.click(screen.getByRole('button', { name: 'Send Verification OTP' }));

    // Back to a ready button, still on the phone stage, with no message anywhere.
    expect(await screen.findByRole('button', { name: 'Send Verification OTP' })).toBeEnabled();
    expect(screen.queryByText(/SMS Error/)).not.toBeInTheDocument();
    expect(screen.queryByText(/too-many-requests/)).not.toBeInTheDocument();
  });

  it('stays on the phone stage so the number can be re-submitted', async () => {
    sendFirebasePhoneOtp.mockRejectedValueOnce(new Error('auth/too-many-requests'));
    const { user } = renderEntry();

    await user.type(screen.getByLabelText('Mobile number'), '9876543210');
    await user.click(screen.getByRole('button', { name: 'Send Verification OTP' }));
    await screen.findByRole('button', { name: 'Send Verification OTP' });

    expect(screen.getByLabelText('Mobile number')).toHaveValue('9876543210');

    await user.click(screen.getByRole('button', { name: 'Send Verification OTP' }));
    expect(await screen.findByRole('heading', { name: 'Enter 6-digit OTP' })).toBeInTheDocument();
  });
});

describe('the OTP stage', () => {
  it('offers a way back to correct the number', async () => {
    const { user } = renderEntry();
    await reachOtpStage(user);

    await user.click(screen.getByRole('button', { name: /Change mobile number/ }));

    expect(screen.getByLabelText('Mobile number')).toHaveValue('9876543210');
  });

  it('signs in a returning patient and moves them to the questionnaire', async () => {
    apiMock.findOrCreatePatient.mockResolvedValue({ id: 'p1', name: 'Asha' });
    const { user } = renderEntry();
    await reachOtpStage(user);

    await typeOtp(user);

    await waitFor(() => expect(confirm).toHaveBeenCalledWith('123456'));
    expect(apiMock.findOrCreatePatient).toHaveBeenCalledWith({ phoneNumber: '+919876543210' });
    expect(setPatient).toHaveBeenCalledWith({ id: 'p1', name: 'Asha' });
    expect(navigate).toHaveBeenCalledWith('/questionnaire');
  });

  it('sends a new patient to the details stage instead of erroring', async () => {
    apiMock.findOrCreatePatient.mockRejectedValue(
      new ApiError('not found', 404, { code: 'PATIENT_NOT_FOUND' })
    );
    const { user } = renderEntry();
    await reachOtpStage(user);

    await typeOtp(user);

    expect(await screen.findByText('First time here — a few quick details.')).toBeInTheDocument();
  });

  it('shows the retry card when the lookup fails for any other reason', async () => {
    apiMock.findOrCreatePatient.mockRejectedValue(new ApiError('boom', 500, null));
    const { user } = renderEntry();
    await reachOtpStage(user);

    await typeOtp(user);

    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });

  it('recovers from that failure back to the phone stage', async () => {
    apiMock.findOrCreatePatient.mockRejectedValue(new ApiError('boom', 500, null));
    const { user } = renderEntry();
    await reachOtpStage(user);
    await typeOtp(user);

    await user.click(await screen.findByRole('button', { name: 'Try again' }));

    expect(screen.getByRole('heading', { name: 'Enter 6-digit OTP' })).toBeInTheDocument();
  });

  it('reports a wrong code without leaving the stage', async () => {
    confirm.mockRejectedValue(new Error('Invalid verification code'));
    const { user } = renderEntry();
    await reachOtpStage(user);

    await typeOtp(user);

    expect(await screen.findByText('Invalid verification code')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Enter 6-digit OTP' })).toBeInTheDocument();
  });

  it('falls back to generic copy for a verification failure with no message', async () => {
    confirm.mockRejectedValue({});
    const { user } = renderEntry();
    await reachOtpStage(user);

    await typeOtp(user);

    expect(
      await screen.findByText('Invalid or expired OTP code. Please try again.')
    ).toBeInTheDocument();
  });

  it('tells the patient to request a new code when the session is gone', async () => {
    sendFirebasePhoneOtp.mockResolvedValue({});
    const { user } = renderEntry();
    await reachOtpStage(user);

    await typeOtp(user);

    expect(
      await screen.findByText('OTP session expired. Please request a new code.')
    ).toBeInTheDocument();
  });
});

describe('the new-patient details stage', () => {
  async function reachDetailsStage(user) {
    apiMock.findOrCreatePatient.mockRejectedValueOnce(new ApiError('not found', 404, null));
    await reachOtpStage(user);
    await typeOtp(user);
    await screen.findByText('First time here — a few quick details.');
  }

  it('blocks continuing until both a name and consent are given', async () => {
    const { user } = renderEntry();
    await reachDetailsStage(user);

    const submit = screen.getByRole('button', { name: 'Continue' });
    expect(submit).toBeDisabled();

    await user.type(screen.getByLabelText('Full name'), 'Asha');
    expect(submit).toBeDisabled();

    await user.click(screen.getByLabelText(/I agree to the/));
    expect(submit).toBeEnabled();
  });

  it('will not accept a whitespace-only name', async () => {
    const { user } = renderEntry();
    await reachDetailsStage(user);

    await user.type(screen.getByLabelText('Full name'), '   ');
    await user.click(screen.getByLabelText(/I agree to the/));

    expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled();
  });

  it('records consent when the patient agrees inside the policy modal', async () => {
    const { user } = renderEntry();
    await reachDetailsStage(user);

    await user.click(screen.getByRole('button', { name: 'Terms of Service & Privacy Policy' }));
    await user.click(screen.getByRole('button', { name: 'I Understand & Agree' }));

    expect(screen.getByLabelText(/I agree to the/)).toBeChecked();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('registers with the trimmed name, numeric age and a consent timestamp', async () => {
    const { user } = renderEntry();
    await reachDetailsStage(user);

    await user.type(screen.getByLabelText('Full name'), '  Asha Rao  ');
    await user.type(screen.getByLabelText('Age'), '34');
    await user.selectOptions(screen.getByLabelText('Sex'), 'Female');
    await user.click(screen.getByLabelText(/I agree to the/));

    apiMock.findOrCreatePatient.mockResolvedValue({ id: 'p1' });
    await user.click(screen.getByRole('button', { name: 'Continue' }));

    await waitFor(() =>
      expect(apiMock.findOrCreatePatient).toHaveBeenLastCalledWith({
        phoneNumber: '+919876543210',
        name: 'Asha Rao',
        age: 34,
        sex: 'Female',
        consentGiven: true,
        consentGivenAt: expect.any(String),
      })
    );
    expect(setPatient).toHaveBeenCalledWith({ id: 'p1' });
    expect(navigate).toHaveBeenCalledWith('/questionnaire');
  });

  it('omits age and sex when left blank rather than sending empty strings', async () => {
    const { user } = renderEntry();
    await reachDetailsStage(user);

    await user.type(screen.getByLabelText('Full name'), 'Asha');
    await user.click(screen.getByLabelText(/I agree to the/));

    apiMock.findOrCreatePatient.mockResolvedValue({ id: 'p1' });
    await user.click(screen.getByRole('button', { name: 'Continue' }));

    await waitFor(() =>
      expect(apiMock.findOrCreatePatient).toHaveBeenLastCalledWith(
        expect.objectContaining({ age: undefined, sex: undefined })
      )
    );
  });

  it('shows the retry card when registration fails', async () => {
    const { user } = renderEntry();
    await reachDetailsStage(user);

    await user.type(screen.getByLabelText('Full name'), 'Asha');
    await user.click(screen.getByLabelText(/I agree to the/));

    apiMock.findOrCreatePatient.mockRejectedValue(new ApiError('boom', 500, null));
    await user.click(screen.getByRole('button', { name: 'Continue' }));

    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });
});

describe('the sex options', () => {
  async function reachDetailsStage(user) {
    apiMock.findOrCreatePatient.mockRejectedValueOnce(new ApiError('not found', 404, null));
    await reachOtpStage(user);
    await typeOtp(user);
    await screen.findByText('First time here — a few quick details.');
  }

  it('renders the options fetched from the server', async () => {
    const { user } = renderEntry();
    await reachDetailsStage(user);

    expect(screen.getByRole('option', { name: 'Male' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Female' })).toBeInTheDocument();
  });

  it('falls back to display-name defaults when the options call fails', async () => {
    apiMock.getSexOptions.mockRejectedValue(new Error('offline'));
    const { user } = renderEntry();
    await reachDetailsStage(user);

    // Display names, not enum names — the server matches on display names, so a fallback
    // of "MALE" would be resolved to null and silently dropped.
    expect(screen.getByRole('option', { name: 'Prefer Not to Say' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Transgender' })).toBeInTheDocument();
  });
});
