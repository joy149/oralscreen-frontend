import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import PhoneEntry from './PhoneEntry';
import { ApiError, api as apiMock } from '../api/client';
import { routerFuture } from '../test/utils';

const navigate = vi.fn();
const setPatient = vi.fn();
const warmRecaptcha = vi.fn();
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
  warmRecaptcha: (...a) => warmRecaptcha(...a),
  sendFirebasePhoneOtp: (...a) => sendFirebasePhoneOtp(...a),
  // The real implementation is covered in config/firebase.test.js; here it just has to be
  // the canonical form so the assertion on what gets POSTed is meaningful.
  formatE164Phone: (value) => `+91${String(value).replace(/\D/g, '').slice(-10)}`,
  describePhoneAuthError: (_err, fallback) => fallback,
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

/**
 * Drives the phone stage through to the OTP stage. The stage now switches optimistically,
 * so this also waits for the send itself to settle — the boxes stay disabled until then.
 */
async function reachOtpStage(user, phone = '9876543210') {
  await user.type(screen.getByLabelText('Mobile number'), phone);
  await user.click(screen.getByRole('button', { name: 'Send Verification OTP' }));
  await screen.findByRole('heading', { name: 'Enter 6-digit OTP' });
  await waitFor(() => expect(screen.getByLabelText('Digit 1 of 6')).toBeEnabled());
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
  warmRecaptcha.mockReset();
  warmRecaptcha.mockResolvedValue({ id: 'verifier' });
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

  it('warms reCAPTCHA on mount, while the patient is still typing', () => {
    renderEntry();

    // Not merely constructing a verifier: the constructor downloads nothing, so this has to
    // be the call that renders the widget or the first send pays for it.
    expect(warmRecaptcha).toHaveBeenCalled();
  });

  it('survives reCAPTCHA warm-up throwing on mount', () => {
    warmRecaptcha.mockImplementationOnce(() => {
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
  it('sends with the shared warmed verifier rather than passing a freshly built one', async () => {
    const { user } = renderEntry();

    await reachOtpStage(user);

    expect(sendFirebasePhoneOtp).toHaveBeenCalledWith('9876543210');
    expect(screen.getByText('+91 9876543210')).toBeInTheDocument();
  });

  /**
   * The OTP stage used to be gated on `signInWithPhoneNumber` resolving, so the patient
   * watched the phone form for the whole reCAPTCHA-plus-network round trip. Nothing is lost
   * by switching first: the SMS cannot arrive before the send resolves.
   */
  it('shows the OTP stage immediately, without waiting for the send', async () => {
    sendFirebasePhoneOtp.mockReturnValue(new Promise(() => {}));
    const { user } = renderEntry();

    await user.type(screen.getByLabelText('Mobile number'), '9876543210');
    await user.click(screen.getByRole('button', { name: 'Send Verification OTP' }));

    expect(await screen.findByRole('heading', { name: 'Enter 6-digit OTP' })).toBeInTheDocument();
    expect(screen.getByLabelText('Digit 1 of 6')).toBeInTheDocument();
  });

  /**
   * Deliberate product decision: the dispatch is never narrated. The stage presents as
   * ready from the moment it opens so the wait reads as the SMS being delivered, which is
   * the part that is genuinely out of our hands. Only a real failure walks that back.
   */
  it('never narrates the dispatch — the stage presents as ready while the send is in flight', async () => {
    sendFirebasePhoneOtp.mockReturnValue(new Promise(() => {}));
    const { user } = renderEntry();

    await user.type(screen.getByLabelText('Mobile number'), '9876543210');
    await user.click(screen.getByRole('button', { name: 'Send Verification OTP' }));

    await screen.findByRole('heading', { name: 'Enter 6-digit OTP' });
    expect(screen.getByText(/Sent via SMS to/)).toBeInTheDocument();
    expect(screen.getByLabelText('Digit 1 of 6')).toBeEnabled();
    expect(screen.getByRole('status')).toHaveTextContent('');
  });

  it('runs the resend cooldown from the moment the code was asked for', async () => {
    sendFirebasePhoneOtp.mockReturnValue(new Promise(() => {}));
    const { user } = renderEntry();

    await user.type(screen.getByLabelText('Mobile number'), '9876543210');
    await user.click(screen.getByRole('button', { name: 'Send Verification OTP' }));

    // Not held back until the send resolves, which would make the countdown jump.
    expect(await screen.findByText(/Resend code in/)).toBeInTheDocument();
  });

  it('accepts a code typed before the send has resolved', async () => {
    let resolveSend;
    sendFirebasePhoneOtp.mockReturnValue(new Promise((r) => { resolveSend = r; }));
    apiMock.findOrCreatePatient.mockResolvedValue({ id: 'p1' });
    const { user } = renderEntry();

    await user.type(screen.getByLabelText('Mobile number'), '9876543210');
    await user.click(screen.getByRole('button', { name: 'Send Verification OTP' }));
    await screen.findByRole('heading', { name: 'Enter 6-digit OTP' });

    await typeOtp(user);
    resolveSend({ confirm });

    // Waits for the in-flight send instead of reporting a session that had not landed yet.
    await waitFor(() => expect(confirm).toHaveBeenCalledWith('123456'));
    expect(screen.queryByText('OTP session expired. Please request a new code.')).not.toBeInTheDocument();
  });

  /**
   * This used to fail silently. `otpError` was only rendered inside the `stage === 'otp'`
   * block while a failure left the stage at 'phone', so the primary action of the sign-in
   * screen — including the common `auth/too-many-requests` quota error — produced no
   * message at all. The optimistic transition puts the patient where the error renders.
   */
  it('tells the patient when the send fails', async () => {
    sendFirebasePhoneOtp.mockRejectedValue(new Error('auth/too-many-requests'));
    const { user } = renderEntry();

    await user.type(screen.getByLabelText('Mobile number'), '9876543210');
    await user.click(screen.getByRole('button', { name: 'Send Verification OTP' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'We could not send the code. Please try again.'
    );
  });

  it('offers an immediate resend after a failed send, with no cooldown to wait out', async () => {
    sendFirebasePhoneOtp.mockRejectedValue(new Error('auth/too-many-requests'));
    const { user } = renderEntry();

    await user.type(screen.getByLabelText('Mobile number'), '9876543210');
    await user.click(screen.getByRole('button', { name: 'Send Verification OTP' }));
    await screen.findByRole('alert');

    // No code went out, so there is nothing for a cooldown to protect.
    expect(await screen.findByRole('button', { name: 'Resend OTP Code' })).toBeEnabled();
  });

  it('does not claim a code was sent when the send failed', async () => {
    sendFirebasePhoneOtp.mockRejectedValue(new Error('auth/too-many-requests'));
    const { user } = renderEntry();

    await user.type(screen.getByLabelText('Mobile number'), '9876543210');
    await user.click(screen.getByRole('button', { name: 'Send Verification OTP' }));
    await screen.findByRole('alert');

    expect(screen.getByText(/We'll text a code to/)).toBeInTheDocument();
    expect(screen.queryByText(/Sent via SMS to/)).not.toBeInTheDocument();
    // And there is nothing to type into, so the only route out is resend or going back.
    expect(screen.getByLabelText('Digit 1 of 6')).toBeDisabled();
  });

  it('recovers when a retried send succeeds', async () => {
    sendFirebasePhoneOtp.mockRejectedValueOnce(new Error('auth/too-many-requests'));
    const { user } = renderEntry();

    await user.type(screen.getByLabelText('Mobile number'), '9876543210');
    await user.click(screen.getByRole('button', { name: 'Send Verification OTP' }));
    await screen.findByRole('alert');

    await user.click(screen.getByRole('button', { name: 'Resend OTP Code' }));

    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
    expect(screen.getByLabelText('Digit 1 of 6')).toBeEnabled();
  });

  it('lets the patient go back and correct the number after a failed send', async () => {
    sendFirebasePhoneOtp.mockRejectedValue(new Error('auth/invalid-phone-number'));
    const { user } = renderEntry();

    await user.type(screen.getByLabelText('Mobile number'), '9876543210');
    await user.click(screen.getByRole('button', { name: 'Send Verification OTP' }));
    await screen.findByRole('alert');

    await user.click(screen.getByRole('button', { name: /Change mobile number/ }));

    expect(screen.getByLabelText('Mobile number')).toHaveValue('9876543210');
  });
});

describe('the OTP stage', () => {
  it('offers a way back to correct the number', async () => {
    const { user } = renderEntry();
    await reachOtpStage(user);

    await user.click(screen.getByRole('button', { name: /Change mobile number/ }));

    expect(screen.getByLabelText('Mobile number')).toHaveValue('9876543210');
  });

  it('drops the previous confirmation when the number is changed', async () => {
    const { user } = renderEntry();
    await reachOtpStage(user);

    await user.click(screen.getByRole('button', { name: /Change mobile number/ }));
    // The second send fails, so nothing replaces the confirmation from the first number.
    sendFirebasePhoneOtp.mockRejectedValueOnce(new Error('quota'));
    await user.click(screen.getByRole('button', { name: 'Send Verification OTP' }));
    await screen.findByRole('alert');

    // Had the back button left it in place, a code minted for the old number would still be
    // live here — the boxes would be open and `confirm` would accept against it.
    expect(screen.getByLabelText('Digit 1 of 6')).toBeDisabled();
    expect(confirm).not.toHaveBeenCalled();
  });

  it('clears the boxes after a rejected code instead of leaving the patient to delete six digits', async () => {
    confirm.mockRejectedValue(new Error('Invalid verification code'));
    const { user } = renderEntry();
    await reachOtpStage(user);

    await typeOtp(user);
    await screen.findByText('Invalid verification code');

    await waitFor(() =>
      expect(screen.getAllByLabelText(/^Digit \d of 6$/).map((b) => b.value)).toEqual([
        '', '', '', '', '', '',
      ])
    );
    expect(screen.getByLabelText('Digit 1 of 6')).toHaveFocus();
  });

  it('announces a rejected code to assistive tech', async () => {
    confirm.mockRejectedValue(new Error('Invalid verification code'));
    const { user } = renderEntry();
    await reachOtpStage(user);

    await typeOtp(user);

    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid verification code');
  });

  it('shows that the code is being checked, rather than just greying the boxes out', async () => {
    confirm.mockReturnValue(new Promise(() => {}));
    const { user } = renderEntry();
    await reachOtpStage(user);

    await typeOtp(user);

    expect(await screen.findByText('Verifying…')).toBeInTheDocument();
  });

  // Home, not the questionnaire: a patient who already has a record is as likely to be
  // back for a result as for a new screening, and home offers both. New registrations
  // still go straight to the questionnaire — see the details-stage tests below.
  it('signs in a returning patient and lands them on home', async () => {
    apiMock.findOrCreatePatient.mockResolvedValue({ id: 'p1', name: 'Asha' });
    const { user } = renderEntry();
    await reachOtpStage(user);

    await typeOtp(user);

    await waitFor(() => expect(confirm).toHaveBeenCalledWith('123456'));
    expect(apiMock.findOrCreatePatient).toHaveBeenCalledWith({ phoneNumber: '+919876543210' });
    expect(setPatient).toHaveBeenCalledWith({ id: 'p1', name: 'Asha' });
    expect(navigate).toHaveBeenCalledWith('/');
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
