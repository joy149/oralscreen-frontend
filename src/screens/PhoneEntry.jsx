import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import AppShell from '../components/layout/AppShell';
import ErrorState from '../components/shared/ErrorState';
import { api, ApiError } from '../api/client';
import { usePatient } from '../context/PatientContext';
import './PhoneEntry.css';

export default function PhoneEntry() {
  const navigate = useNavigate();
  const { setPatient } = usePatient();

  const [phoneNumber, setPhoneNumber] = useState('');
  const [stage, setStage] = useState('phone'); // 'phone' | 'details'
  const [name, setName] = useState('');
  const [age, setAge] = useState('');
  const [sex, setSex] = useState('');
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

  async function handlePhoneSubmit(e) {
    e.preventDefault();
    if (!isPhoneValid) return;
    setError(null);
    setSubmitting(true);
    try {
      const patient = await api.findOrCreatePatient({ phoneNumber: phoneNumber.trim() });
      setPatient(patient);
      navigate('/questionnaire');
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        setStage('details');
      } else {
        setError(err);
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDetailsSubmit(e) {
    e.preventDefault();
    if (!name.trim()) return;
    setError(null);
    setSubmitting(true);
    try {
      const patient = await api.findOrCreatePatient({
        phoneNumber: phoneNumber.trim(),
        name: name.trim(),
        age: age ? Number(age) : undefined,
        sex: sex || undefined,
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
    <AppShell>
      <div className="screen phone-entry">
        <div className="phone-entry__intro">
          <h1>Let's take a look</h1>
          <p>Answer a few questions and share a photo. A dentist reviews every result.</p>
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
              />
            </div>
            <button type="submit" className="btn btn-primary" disabled={!isPhoneValid || submitting}>
              {submitting ? 'Please wait…' : 'Continue'}
            </button>
          </form>
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
            <button type="submit" className="btn btn-primary" disabled={!name.trim() || submitting}>
              {submitting ? 'Please wait…' : 'Continue'}
            </button>
          </form>
        )}
      </div>
    </AppShell>
  );
}