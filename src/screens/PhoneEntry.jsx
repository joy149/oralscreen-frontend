import { useEffect, useState, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import AppShell from '../components/layout/AppShell';
import ErrorState from '../components/shared/ErrorState';
import PageTransition from '../components/shared/PageTransition';
import OtpInput from '../components/shared/OtpInput';
import { api, ApiError, DEFAULT_SEX_OPTIONS } from '../api/client';
import { usePatient } from '../context/PatientContext';
import { ShieldCheck, Stethoscope, Clock, ArrowLeft } from 'lucide-react';
import PrivacyPolicyModal from '../components/shared/PrivacyPolicyModal';
import {
  warmRecaptcha,
  sendFirebasePhoneOtp,
  formatE164Phone,
  describePhoneAuthError,
} from '../config/firebase';
import './PhoneEntry.css';

export default function PhoneEntry() {
  const navigate = useNavigate();
  const location = useLocation();
  // Set by useSessionRecovery when an expired session bounced them here. Without it the
  // patient is dropped on the sign-in screen mid-task with no explanation.
  const sessionExpired = Boolean(location.state?.sessionExpired);
  const { setPatient } = usePatient();

  const [phoneNumber, setPhoneNumber] = useState('');
  const [stage, setStage] = useState('phone'); // 'phone' | 'otp' | 'details'
  const [otpError, setOtpError] = useState('');
  const [confirmationResult, setConfirmationResult] = useState(null);
  const [name, setName] = useState('');
  const [age, setAge] = useState('');
  const [sex, setSex] = useState('');
  const [agreedToPrivacy, setAgreedToPrivacy] = useState(false);
  const [showPrivacyModal, setShowPrivacyModal] = useState(false);
  const [sexOptions, setSexOptions] = useState([]);
  const [loadingSexOptions, setLoadingSexOptions] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [verifying, setVerifying] = useState(false);
  // The dispatch itself is deliberately not surfaced — only its failure is.
  const [sendFailed, setSendFailed] = useState(false);
  // Bumped to tell OtpInput to clear itself after a rejected code.
  const [otpResetSignal, setOtpResetSignal] = useState(0);
  // Anchors the resend cooldown. Set when the code is *requested*, not when the send
  // resolves, so the countdown starts with the screen rather than jumping a second later.
  const [codeSentAt, setCodeSentAt] = useState(null);
  // The in-flight send. `handleVerifyOtp` awaits it, because the boxes are live before it
  // resolves and a code typed early must not be met with "session expired".
  const sendRef = useRef(null);
  const [error, setError] = useState(null);

  const isPhoneValid = /^\d{10}$/.test(phoneNumber.trim());

  useEffect(() => {
    let mounted = true;

    async function loadSexOptions() {
      try {
        const options = await api.getSexOptions();
        if (mounted) setSexOptions(options);
      } catch (err) {
        console.error('Failed to load sex options', err);
        // Shared with the client's own fallback: these values are display names, which is
        // what the server matches on. The list that used to be inlined here sent enum names
        // ("MALE"), which the server resolved to null and dropped without complaint.
        if (mounted) setSexOptions(DEFAULT_SEX_OPTIONS);
      } finally {
        if (mounted) setLoadingSexOptions(false);
      }
    }

    loadSexOptions();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    // Download and render reCAPTCHA now, while the patient is still typing their number.
    // Constructing the verifier alone fetches nothing — it is `render()`, which this calls,
    // that pulls the script and builds the widget. Doing it here takes that off the send.
    try {
      warmRecaptcha();
    } catch (_) {
      // A cold send still works; it is just slower.
    }
  }, []);

  function sendOtpCode() {
    setError(null);
    setOtpError('');
    setSendFailed(false);
    setCodeSentAt(Date.now());

    const inFlight = (async () => {
      try {
        // No verifier is passed: the shared warmed one is reused rather than rebuilt per send.
        const result = await sendFirebasePhoneOtp(phoneNumber.trim());
        setConfirmationResult(result);
        return result;
      } catch (err) {
        console.error('Firebase SMS OTP error:', err);
        setConfirmationResult(null);
        setSendFailed(true);
        // Nothing went out, so there is nothing for a cooldown to protect.
        setCodeSentAt(null);
        setOtpError(describePhoneAuthError(err, 'We could not send the code. Please try again.'));
        return null;
      }
    })();

    sendRef.current = inFlight;
    return inFlight;
  }

  function handlePhoneSubmit(e) {
    e.preventDefault();
    if (!isPhoneValid) return;
    // Move to the OTP stage immediately and let the send run underneath it. Waiting for
    // signInWithPhoneNumber to resolve before switching meant the patient watched the phone
    // form for the whole reCAPTCHA-plus-network round trip; the code cannot arrive before
    // the send resolves anyway, so nothing is lost by showing the next screen first.
    setStage('otp');
    sendOtpCode();
  }

  async function handleVerifyOtp(otpCode) {
    setOtpError('');
    setVerifying(true);
    try {
      // The send may still be in flight — the boxes go live with the screen, before it
      // resolves. Wait for it rather than reporting a session that simply has not landed.
      const confirmation = (await sendRef.current) || confirmationResult;
      if (!confirmation || !confirmation.confirm) {
        throw new Error('OTP session expired. Please request a new code.');
      }
      await confirmation.confirm(otpCode);

      // Fetch or create patient profile after OTP verification.
      // The server uses the token's phone regardless, but send the canonical form so the
      // two can never disagree if that ever changes.
      try {
        const patient = await api.findOrCreatePatient({ phoneNumber: formatE164Phone(phoneNumber.trim()) });
        setPatient(patient);
        // Reaching here without a 404 means the record already existed — a returning
        // patient, as likely to be checking a result as starting a screening. Home offers
        // both; a first-time registration (handleDetailsSubmit) still goes straight to the
        // questionnaire, where home would only show them an empty history.
        navigate('/');
      } catch (err) {
        if (err instanceof ApiError && err.status === 404) {
          setStage('details');
        } else {
          setError(err);
        }
      }
    } catch (err) {
      setOtpError(
        describePhoneAuthError(err, err?.message || 'Invalid or expired OTP code. Please try again.')
      );
      // Clear the boxes and put the cursor back on the first one rather than leaving the
      // rejected digits sitting there for the patient to delete.
      setOtpResetSignal((n) => n + 1);
    } finally {
      setVerifying(false);
    }
  }

  async function handleDetailsSubmit(e) {
    e.preventDefault();
    if (!name.trim() || !agreedToPrivacy) return;
    setError(null);
    setSubmitting(true);
    try {
      const patient = await api.findOrCreatePatient({
        phoneNumber: formatE164Phone(phoneNumber.trim()),
        name: name.trim(),
        age: age ? Number(age) : undefined,
        sex: sex || undefined,
        consentGiven: true,
        consentGivenAt: new Date().toISOString(),
      });
      setPatient(patient);
      navigate('/questionnaire');
    } catch (err) {
      setError(err);
    } finally {
      setSubmitting(false);
    }
  }

  if (error) {
    return (
      <AppShell>
        <ErrorState onRetry={() => setError(null)} />
      </AppShell>
    );
  }

  return (
    <AppShell clinicianLink wide>
      <PageTransition>
        <div className="screen phone-entry">
          <div className="phone-entry__orb" aria-hidden="true" />
          {/* No reCAPTCHA container here on purpose: it is created on <body> by
              config/firebase so one warmed verifier can outlive this screen. */}

          {/* The Patient/Doctor switch used to sit here, above the hero. Nearly
              all traffic is patients, so the staff entrance no longer occupies
              the most valuable element on the screen — it's a footer link now
              (see AppShell's clinicianLink). */}
          <div className="phone-entry__aside">
            <p className="phone-entry__eyebrow">Clinical AI Screening</p>
            <h1>Let's take a look</h1>
            <p className="phone-entry__lede">
              Answer a few questions and share a photo. A licensed dentist reviews every result.
            </p>

            {/* Echoes the landing page's three steps, so arriving here reads as the next
                move in the same flow rather than a separate sign-in product. */}
            <ol className="phone-entry__steps">
              <li>
                <span className="phone-entry__step-n">01</span>
                <span><strong>Symptoms &amp; habits</strong>Six quick questions.</span>
              </li>
              <li>
                <span className="phone-entry__step-n">02</span>
                <span><strong>Four guided photos</strong>An oval shows you where to aim.</span>
              </li>
              <li>
                <span className="phone-entry__step-n">03</span>
                <span><strong>A dentist reviews it</strong>Usually within 24 hours.</span>
              </li>
            </ol>

            <div className="phone-entry__trust-badges">
              <div className="phone-entry__trust-item">
                <ShieldCheck size={15} />
                <span>100% Private</span>
              </div>
              <div className="phone-entry__trust-item">
                <Stethoscope size={15} />
                <span>Dentist Verified</span>
              </div>
              <div className="phone-entry__trust-item">
                <Clock size={15} />
                <span>Under 2 Mins</span>
              </div>
            </div>
          </div>

          <div className="phone-entry__panel">

          {stage === 'phone' && sessionExpired && (
            <p className="phone-entry__session-notice" role="status">
              You were signed out. Verify your number again to get back to your screenings.
            </p>
          )}

          {stage === 'phone' && (
            <form onSubmit={handlePhoneSubmit} className="card">
              <div className="field">
                <label htmlFor="phone">Mobile number</label>
                <input
                  id="phone"
                  type="tel"
                  inputMode="numeric"
                  autoComplete="tel"
                  placeholder="10-digit mobile number"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value.replace(/\D/g, '').slice(0, 10))}
                  aria-invalid={phoneNumber.length > 0 && !isPhoneValid}
                  aria-describedby="phone-hint"
                />
              </div>
              {/* No pending state needed: the OTP stage takes over on tap and reports
                  progress there. */}
              <button type="submit" className="btn btn-primary" disabled={!isPhoneValid}>
                Send Verification OTP
              </button>
            </form>
          )}

          {stage === 'otp' && (
            <div className="card phone-entry__otp-card">
              <button
                type="button"
                className="phone-entry__back-btn"
                onClick={() => {
                  setStage('phone');
                  // Drop the confirmation too — otherwise a code from the previous number
                  // stays live and can be confirmed against a freshly typed one.
                  setConfirmationResult(null);
                  sendRef.current = null;
                  setSendFailed(false);
                  setOtpError('');
                }}
              >
                <ArrowLeft size={16} /> Change mobile number
              </button>
              <div className="phone-entry__otp-header">
                <h2>Enter 6-digit OTP</h2>
                <p>
                  {/* Reads as sent from the moment the screen opens, so the wait belongs to
                      the SMS rather than to the app. Only an actual failure walks it back. */}
                  {sendFailed ? "We'll text a code to" : 'Sent via SMS to'}{' '}
                  <strong>+91 {phoneNumber}</strong>
                </p>
              </div>

              <OtpInput
                length={6}
                submitting={verifying}
                // Only closed once a send has actually failed. While one is in flight the
                // boxes stay live — `handleVerifyOtp` waits for it.
                disabled={sendFailed}
                cooldownStartedAt={codeSentAt}
                resetSignal={otpResetSignal}
                onComplete={handleVerifyOtp}
                onResend={sendOtpCode}
              />

              {otpError && (
                <p className="error-text text-center" role="alert">
                  {otpError}
                </p>
              )}
            </div>
          )}

          {stage === 'details' && (
            <form onSubmit={handleDetailsSubmit} className="card">
              <p className="phone-entry__new-patient-note">First time here — a few quick details.</p>
              <div className="field">
                <label htmlFor="name">Full name</label>
                <input
                  id="name"
                  type="text"
                  autoComplete="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
              <div className="phone-entry__row">
                <div className="field">
                  <label htmlFor="age">Age</label>
                  <input
                    id="age"
                    type="number"
                    min="0"
                    max="120"
                    value={age}
                    onChange={(e) => setAge(e.target.value)}
                  />
                </div>
                <div className="field">
                  <label htmlFor="sex">Sex</label>
                  <select
                    id="sex"
                    value={sex}
                    onChange={(e) => setSex(e.target.value)}
                    disabled={loadingSexOptions}
                  >
                    <option value="">
                      {loadingSexOptions ? 'Loading…' : 'Select sex (optional)'}
                    </option>
                    {sexOptions.map((option) => (
                      <option key={option.value || option.label} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="phone-entry__privacy-consent">
                <label className="phone-entry__checkbox-label" htmlFor="privacy-consent">
                  <input
                    type="checkbox"
                    id="privacy-consent"
                    checked={agreedToPrivacy}
                    onChange={(e) => setAgreedToPrivacy(e.target.checked)}
                  />
                  <span>
                    I agree to the{' '}
                    <button
                      type="button"
                      className="phone-entry__privacy-link"
                      onClick={() => setShowPrivacyModal(true)}
                    >
                      Terms of Service & Privacy Policy
                    </button>
                  </span>
                </label>
              </div>
              <button type="submit" className="btn btn-primary" disabled={!name.trim() || !agreedToPrivacy || submitting}>
                {submitting ? 'Please wait…' : 'Continue'}
              </button>
            </form>
          )}
          </div>

          <PrivacyPolicyModal
            isOpen={showPrivacyModal}
            onClose={() => setShowPrivacyModal(false)}
            onAgree={() => setAgreedToPrivacy(true)}
          />
        </div>
      </PageTransition>
    </AppShell>
  );
}
