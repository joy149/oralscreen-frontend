import { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import AppShell from '../components/layout/AppShell';
import ErrorState from '../components/shared/ErrorState';
import PageTransition from '../components/shared/PageTransition';
import OtpInput from '../components/shared/OtpInput';
import { api, ApiError } from '../api/client';
import { usePatient } from '../context/PatientContext';
import { ShieldCheck, Stethoscope, Clock, Sparkles, ArrowLeft } from 'lucide-react';
import PrivacyPolicyModal from '../components/shared/PrivacyPolicyModal';
import { setupRecaptcha, sendFirebasePhoneOtp, formatE164Phone } from '../config/firebase';
import './PhoneEntry.css';

export default function PhoneEntry() {
  const navigate = useNavigate();
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
        if (mounted) {
          setSexOptions([
            { value: '', label: 'Prefer not to say' },
            { value: 'MALE', label: 'Male' },
            { value: 'FEMALE', label: 'Female' },
            { value: 'OTHER', label: 'Other' },
          ]);
        }
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
    // Initialize invisible reCAPTCHA container
    try {
      setupRecaptcha('recaptcha-container');
    } catch (_) {
      // ignore
    }
  }, []);

  async function sendOtpCode() {
    setError(null);
    setOtpError('');
    setSubmitting(true);
    try {
      // Re-initialize RecaptchaVerifier for clean state
      const verifier = setupRecaptcha('recaptcha-container');
      const result = await sendFirebasePhoneOtp(phoneNumber.trim(), verifier);
      setConfirmationResult(result);
      setStage('otp');
    } catch (err) {
      console.error('Firebase SMS OTP error:', err);
      const message = err?.message || 'Failed to send SMS OTP.';
      setOtpError(`SMS Error: ${message}`);
    } finally {
      setSubmitting(false);
    }
  }

  async function handlePhoneSubmit(e) {
    e.preventDefault();
    if (!isPhoneValid) return;
    await sendOtpCode();
  }

  async function handleVerifyOtp(otpCode) {
    setOtpError('');
    setSubmitting(true);
    try {
      // Verify OTP with Firebase
      if (!confirmationResult || !confirmationResult.confirm) {
        throw new Error('OTP session expired. Please request a new code.');
      }
      await confirmationResult.confirm(otpCode);

      // Fetch or create patient profile after OTP verification.
      // The server uses the token's phone regardless, but send the canonical form so the
      // two can never disagree if that ever changes.
      try {
        const patient = await api.findOrCreatePatient({ phoneNumber: formatE164Phone(phoneNumber.trim()) });
        setPatient(patient);
        navigate('/questionnaire');
      } catch (err) {
        if (err instanceof ApiError && err.status === 404) {
          setStage('details');
        } else {
          setError(err);
        }
      }
    } catch (err) {
      setOtpError(err?.message || 'Invalid or expired OTP code. Please try again.');
    } finally {
      setSubmitting(false);
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
    <AppShell clinicianLink>
      <PageTransition>
        <div className="screen phone-entry">
          <div id="recaptcha-container"></div>

          {/* The Patient/Doctor switch used to sit here, above the hero. Nearly
              all traffic is patients, so the staff entrance no longer occupies
              the most valuable element on the screen — it's a footer link now
              (see AppShell's clinicianLink). */}
          <div className="phone-entry__intro">
            <div className="phone-entry__hero-badge">
              <Sparkles size={14} className="phone-entry__hero-icon" />
              <span>Clinical AI Screening</span>
            </div>
            <h1>Let's take a look</h1>
            <p>Answer a few questions and share a photo. A licensed dentist reviews every result.</p>
            
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
              <button type="submit" className="btn btn-primary" disabled={!isPhoneValid || submitting}>
                {submitting ? 'Sending OTP…' : 'Send Verification OTP'}
              </button>
            </form>
          )}

          {stage === 'otp' && (
            <div className="card phone-entry__otp-card">
              <button
                type="button"
                className="phone-entry__back-btn"
                onClick={() => setStage('phone')}
              >
                <ArrowLeft size={16} /> Change mobile number
              </button>
              <div className="phone-entry__otp-header">
                <h2>Enter 6-digit OTP</h2>
                <p>Sent via SMS to <strong>+91 {phoneNumber}</strong></p>
              </div>

              <OtpInput
                length={6}
                submitting={submitting}
                onComplete={handleVerifyOtp}
                onResend={sendOtpCode}
              />

              {otpError && <p className="error-text text-center">{otpError}</p>}
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
