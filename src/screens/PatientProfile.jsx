import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import AppShell from '../components/layout/AppShell';
import PageTransition from '../components/shared/PageTransition';
import { useToast } from '../components/shared/Toast';
import { api } from '../api/client';
import { usePatient } from '../context/PatientContext';
import './PatientProfile.css';

// The backend returns GenderType by enum name (e.g. "MALE"), but the gender-options
// endpoint (and therefore the <select>'s values) is keyed by display name (e.g. "Male") —
// PatientController.register() matches incoming sex via GenderType.findByDisplayName().
const GENDER_DISPLAY_BY_ENUM = {
  MALE: 'Male',
  FEMALE: 'Female',
  TRANSGENDER: 'Transgender',
  PREFER_NOT_TO_SAY: 'Prefer Not to Say',
};

export default function PatientProfile() {
  const navigate = useNavigate();
  const toast = useToast();
  const { patient, setPatient } = usePatient();

  const [name, setName] = useState(patient?.name || '');
  const [age, setAge] = useState(patient?.age != null ? String(patient.age) : '');
  const [sex, setSex] = useState(GENDER_DISPLAY_BY_ENUM[patient?.sex] || '');
  const [sexOptions, setSexOptions] = useState([]);
  const [loadingSexOptions, setLoadingSexOptions] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    let mounted = true;
    api.getSexOptions()
      .then((options) => { if (mounted) setSexOptions(options); })
      .catch(() => {})
      .finally(() => { if (mounted) setLoadingSexOptions(false); });
    return () => { mounted = false; };
  }, []);

  if (!patient) {
    navigate('/');
    return null;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!name.trim()) return;
    setError(null);
    setSubmitting(true);
    try {
      const updated = await api.findOrCreatePatient({
        phoneNumber: patient.phoneNumber,
        name: name.trim(),
        age: age ? Number(age) : undefined,
        sex: sex || undefined,
      });
      setPatient(updated);
      toast.success('Profile updated');
    } catch (err) {
      setError(err);
      toast.error('Could not save your profile. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AppShell back title="Your profile">
      <PageTransition>
        <div className="screen patient-profile">
          <div className="patient-profile__intro">
            <p>Keep your details up to date so your doctor has accurate context.</p>
          </div>

          <form onSubmit={handleSubmit} className="card">
            <div className="field">
              <label htmlFor="profile-phone">Mobile number</label>
              <input id="profile-phone" type="tel" value={patient.phoneNumber || ''} disabled />
            </div>
            <div className="field">
              <label htmlFor="profile-name">Full name</label>
              <input
                id="profile-name"
                type="text"
                autoComplete="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="patient-profile__row">
              <div className="field">
                <label htmlFor="profile-age">Age</label>
                <input
                  id="profile-age"
                  type="number"
                  min="0"
                  max="120"
                  value={age}
                  onChange={(e) => setAge(e.target.value)}
                />
              </div>
              <div className="field">
                <label htmlFor="profile-sex">Sex</label>
                <select
                  id="profile-sex"
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
            {error && <p className="error-text" role="alert">Something went wrong saving your profile.</p>}
            <button type="submit" className="btn btn-primary" disabled={!name.trim() || submitting}>
              {submitting ? 'Saving…' : 'Save changes'}
            </button>
          </form>
        </div>
      </PageTransition>
    </AppShell>
  );
}
