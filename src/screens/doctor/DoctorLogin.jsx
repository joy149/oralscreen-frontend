import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { api, ApiError } from '../../api/client';
import { createDoctorSession, useDoctorSession } from '../../context/DoctorSessionContext';
import oralscreenLogo from '../../assets/oralscreen_icon.jpg';
import './DoctorLogin.css';

export default function DoctorLogin() {
  const navigate = useNavigate();
  const location = useLocation();
  const { session, setSession } = useDoctorSession();
  const [step, setStep] = useState('phone');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [name, setName] = useState('');
  const [registrationId, setRegistrationId] = useState('');
  const [approvedDoctor, setApprovedDoctor] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const phoneValid = /^\d{10}$/.test(phoneNumber);
  const registrationValid = phoneValid && name.trim() && registrationId.trim();
  const greetingName = name.trim().replace(/^dr\.?\s+/i, '');

  useEffect(() => {
    if (session) navigate('/doctor', { replace: true });
  }, [navigate, session]);

  function resetToPhone(message = '') {
    setStep('phone');
    setName('');
    setApprovedDoctor(null);
    setError(message);
  }

  async function checkPhone(event) {
    event.preventDefault();
    if (!phoneValid) return;
    setSubmitting(true);
    setError('');
    try {
      const result = await api.checkDoctor(phoneNumber);
      if (!result.exists) setStep('register');
      else if (!result.active) setStep('pending');
      else {
        if (!result.doctorId) throw new Error('Approved doctor response did not include doctorId');
        const response = await api.getDoctor(result.doctorId);
        const doctor = response?.doctor || response?.data || response;
        const doctorName = doctor?.name || doctor?.fullName || '';
        setApprovedDoctor({ ...doctor, id: doctor?.id || result.doctorId, name: doctorName });
        setName(doctorName);
        setStep('login');
      }
    } catch (_) {
      setError('We could not check this number. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  async function register(event) {
    event.preventDefault();
    if (!registrationValid) return;
    setSubmitting(true);
    setError('');
    try {
      await api.registerDoctor({
        phoneNumber,
        name: name.trim(),
        registrationId: registrationId.trim(),
      });
      setStep('pending');
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        resetToPhone('This phone number or registration ID is already registered.');
      } else {
        setError('Registration could not be submitted. Please try again.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function login() {
    setSubmitting(true);
    setError('');
    try {
      const result = await api.loginDoctor(phoneNumber);
      const nextSession = createDoctorSession({
        ...result,
        doctorId: approvedDoctor?.id,
        name: approvedDoctor?.name,
      });
      if (!nextSession.token) throw new Error('Login response did not include a token');
      setSession(nextSession);
      navigate(location.state?.from || '/doctor', { replace: true });
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) {
        resetToPhone('This registration is not currently approved.');
      } else {
        setError('Sign in could not be completed. Please try again.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="doctor-login">
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
            <form onSubmit={checkPhone}>
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
                {submitting ? 'Checking...' : 'Continue'}
              </button>
            </form>
          )}

          {step === 'register' && (
            <form onSubmit={register}>
              <div className="field">
                <label htmlFor="doctor-name">Full name</label>
                <input id="doctor-name" type="text" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
              </div>
              <div className="field">
                <label htmlFor="register-phone">Mobile number</label>
                <input id="register-phone" type="tel" inputMode="numeric" value={phoneNumber} onChange={(e) => setPhoneNumber(e.target.value.replace(/\D/g, '').slice(0, 10))} />
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

          {step === 'login' && (
            <div className="doctor-login__confirmation">
              <span className="doctor-login__approved-icon" aria-hidden="true">&#10003;</span>
              <h2>{greetingName ? `Hi Dr. ${greetingName}` : 'Your account is approved'}</h2>
              <p>Your account is approved. You can proceed to the screening queue.</p>
              <button className="btn btn-primary" type="button" onClick={login} disabled={submitting}>
                {submitting ? 'Signing in...' : 'Continue to queue'}
              </button>
              <button className="doctor-login__back" type="button" onClick={() => resetToPhone()}>Log in as another doctor</button>
            </div>
          )}

          {step === 'pending' && (
            <div className="doctor-login__pending">
              <span className="doctor-login__pending-icon" aria-hidden="true">&#10003;</span>
              <p>Your registration is pending approval. Please check back later.</p>
              <button className="btn btn-secondary" type="button" onClick={() => resetToPhone()}>Check another number</button>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
