import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { api, ApiError } from '../../api/client';
import { createDoctorSession, useDoctorSession } from '../../context/DoctorSessionContext';
import PageTransition from '../../components/shared/PageTransition';
import OtpInput from '../../components/shared/OtpInput';
import oralscreenLogo from '../../assets/oralscreen_icon.jpg';
import { auth, setupRecaptcha, sendFirebasePhoneOtp, firebaseSignOut } from '../../config/firebase';
import './DoctorLogin.css';

export default function DoctorLogin() {
  const navigate = useNavigate();
  const location = useLocation();
  const { setSession } = useDoctorSession();
  // Flow: phone → otp → (auto-check) → register | pending   (or auto-login if approved)
  const [step, setStep] = useState('phone');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [name, setName] = useState('');
  const [registrationId, setRegistrationId] = useState('');
  const [confirmationResult, setConfirmationResult] = useState(null);
  const [otpError, setOtpError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const phoneValid = /^\d{10}$/.test(phoneNumber);
  const registrationValid = name.trim() && registrationId.trim();

  // Entering this screen means "sign me in", so any existing Firebase session is cleared.
  // There is deliberately no "already have a session → bounce to /doctor" redirect: it
  // contradicted the sign-out below, and combined with DoctorRoute's Firebase check it made
  // the two screens redirect at each other in a loop.
  useEffect(() => {
    firebaseSignOut();
  }, []);

  function resetToPhone(message = '') {
    setStep('phone');
    setName('');
    setConfirmationResult(null);
    setOtpError('');
    setError(message);
    firebaseSignOut();
  }

  // Step 1: Send OTP immediately from the phone entry form
  async function handlePhoneSubmit(event) {
    event.preventDefault();
    if (!phoneValid) return;
    setError('');
    setOtpError('');
    setSubmitting(true);
    try {
      const verifier = setupRecaptcha('recaptcha-container');
      const result = await sendFirebasePhoneOtp(phoneNumber, verifier);
      setConfirmationResult(result);
      setStep('otp');
    } catch (err) {
      console.error('Firebase SMS OTP failed:', err);
      setError('Could not send OTP. Please check your number and try again.');
    } finally {
      setSubmitting(false);
    }
  }

  // Step 2: Verify OTP, then check if doctor exists
  async function handleVerifyOtp(otpCode) {
    setOtpError('');
    setSubmitting(true);
    try {
      if (!confirmationResult || !confirmationResult.confirm) {
        throw new Error('OTP session expired. Please request a new code.');
      }
      await confirmationResult.confirm(otpCode);

      // OTP verified — now check doctor status with a valid Firebase token
      await checkAndRoute();
    } catch (err) {
      setOtpError(err?.message || 'Invalid or expired OTP code. Please try again.');
      setSubmitting(false);
    }
  }

  // After OTP: check doctor status and route accordingly.
  // The server reads the phone from the verified token, so nothing is passed here — the
  // typed number and the verified number can no longer disagree. (They used to: the typed
  // 10-digit form matched legacy rows on /check, then /login looked up the token's E.164
  // form and 404'd, which the old backend reported as a bare 403.)
  async function checkAndRoute() {
    try {
      const result = await api.checkDoctor();

      if (!result.exists) {
        // Doctor not registered — show registration form
        setStep('register');
        setSubmitting(false);
        return;
      }

      if (!result.active) {
        // Doctor registered but pending approval
        setStep('pending');
        setSubmitting(false);
        return;
      }

      // Doctor is approved — log them in
      await loginDoctor(result.doctorId);
    } catch (err) {
      setError('Could not verify doctor status. Please try again.');
      setStep('phone');
      setSubmitting(false);
    }
  }

  // Register a new doctor (after OTP is already verified)
  async function handleRegister(event) {
    event.preventDefault();
    if (!registrationValid) return;
    setSubmitting(true);
    setError('');
    try {
      // phoneNumber is deliberately not sent — the server registers the verified number
      // from the token, so a registration can only be created for a phone you control.
      await api.registerDoctor({
        name: name.trim(),
        registrationId: registrationId.trim(),
      });
      setStep('pending');
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setError('This phone number or registration ID is already registered.');
      } else {
        setError('Registration could not be submitted. Please try again.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  // Log in an approved doctor
  async function loginDoctor(doctorId) {
    setError('');
    try {
      // Returns { doctorId, name } — no follow-up profile fetch needed.
      const result = await api.loginDoctor();

      setSession(createDoctorSession({
        doctorId: result?.doctorId || doctorId,
        name: result?.name,
        // The verified number, not the typed one.
        phoneNumber: auth.currentUser?.phoneNumber || phoneNumber,
      }));
      const returnUrl = location.state?.from || '/doctor';
      navigate(returnUrl, { replace: true });
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        setError('No doctor profile is registered for this number.');
        setStep('phone');
      } else if (err instanceof ApiError && err.status === 403) {
        setError('Your registration is still pending approval.');
        setStep('pending');
      } else {
        setError(err?.message || 'Sign in could not be completed. Please try again.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  // Resend OTP (used by OtpInput component)
  async function resendOtp() {
    setError('');
    setOtpError('');
    setSubmitting(true);
    try {
      const verifier = setupRecaptcha('recaptcha-container');
      const result = await sendFirebasePhoneOtp(phoneNumber, verifier);
      setConfirmationResult(result);
    } catch (err) {
      console.error('Firebase SMS OTP resend failed:', err);
      setOtpError('Could not resend OTP. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="doctor-login">
      <div id="recaptcha-container"></div>
      <PageTransition>
        <header className="doctor-login__brand">
          <img src={oralscreenLogo} alt="" className="doctor-login__logo" />
          OralScreen <span>Clinical</span>
        </header>
        <main className="doctor-login__main">
          <div className="doctor-login__intro">
            <p>Doctor access</p>
            <h1>{step === 'pending' ? 'Registration received' : 'Clinical review portal'}</h1>
            <span>Securely review screening cases and record your assessment.</span>
          </div>

          <section className="doctor-login__panel">
            {error && <p className="doctor-login__error" role="alert">{error}</p>}

            {step === 'phone' && (
              <form onSubmit={handlePhoneSubmit}>
                <div className="field">
                  <label htmlFor="doctor-phone">Mobile number</label>
                  <input
                    id="doctor-phone"
                    type="tel"
                    inputMode="numeric"
                    autoComplete="tel"
                    placeholder="10-digit mobile number"
                    value={phoneNumber}
                    onChange={(event) => setPhoneNumber(event.target.value.replace(/\D/g, '').slice(0, 10))}
                    autoFocus
                  />
                </div>
                <button className="btn btn-primary" disabled={!phoneValid || submitting}>
                  {submitting ? 'Sending OTP...' : 'Send Verification OTP'}
                </button>
              </form>
            )}

            {step === 'otp' && (
              <div className="doctor-login__otp">
                <h2>Verify your number</h2>
                <p>Enter 6-digit code sent to <strong>+91 {phoneNumber}</strong></p>
                <OtpInput
                  length={6}
                  submitting={submitting}
                  onComplete={handleVerifyOtp}
                  onResend={resendOtp}
                />
                {otpError && <p className="doctor-login__error" role="alert">{otpError}</p>}
                <button className="doctor-login__back" type="button" onClick={() => resetToPhone()}>Change number</button>
              </div>
            )}

            {step === 'register' && (
              <form onSubmit={handleRegister}>
                <p className="doctor-login__register-note">
                  Number verified. You're not registered yet — fill in your details below.
                </p>
                <div className="field">
                  <label htmlFor="doctor-name">Full name</label>
                  <input id="doctor-name" type="text" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
                </div>
                <div className="field">
                  <label htmlFor="registration-id">Medical registration ID</label>
                  <input id="registration-id" type="text" value={registrationId} onChange={(e) => setRegistrationId(e.target.value)} />
                </div>
                <button className="btn btn-primary" disabled={!registrationValid || submitting}>
                  {submitting ? 'Submitting...' : 'Submit registration'}
                </button>
                <button className="doctor-login__back" type="button" onClick={() => resetToPhone()}>Back</button>
              </form>
            )}

            {step === 'pending' && (
              <div className="doctor-login__pending">
                <span className="doctor-login__pending-icon" aria-hidden="true">&#10003;</span>
                <p>Your registration is pending approval. Please check back later.</p>
                <button className="btn btn-secondary" type="button" onClick={() => resetToPhone()}>Try another number</button>
              </div>
            )}
          </section>
        </main>
      </PageTransition>
    </div>
  );
}
