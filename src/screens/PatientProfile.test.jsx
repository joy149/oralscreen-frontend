import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import PatientProfile from './PatientProfile';
import { ToastProvider } from '../components/shared/Toast';
import { api as apiMock } from '../api/client';
import { routerFuture } from '../test/utils';

const setPatient = vi.fn();
const handleAuthError = vi.fn(() => false);
let patient = { id: 'p1', phoneNumber: '+919876543210', name: 'Asha', age: 34, sex: 'FEMALE' };

vi.mock('../api/client', async (importOriginal) => {
  const { mockApiModule } = await import('../test/apiMock.js');
  return mockApiModule(await importOriginal());
});

vi.mock('../context/PatientContext', () => ({
  usePatient: () => ({ patient, setPatient, clearPatient: vi.fn() }),
}));

vi.mock('../hooks/useSessionRecovery', () => ({
  default: () => handleAuthError,
}));

function renderProfile() {
  const user = userEvent.setup();
  render(
    <MemoryRouter initialEntries={['/profile']} future={routerFuture}>
      <ToastProvider>
        <Routes>
          <Route path="/profile" element={<PatientProfile />} />
          <Route path="/" element={<p>Sign in screen</p>} />
        </Routes>
      </ToastProvider>
    </MemoryRouter>
  );
  return { user };
}

beforeEach(() => {
  patient = { id: 'p1', phoneNumber: '+919876543210', name: 'Asha', age: 34, sex: 'FEMALE' };
  handleAuthError.mockReturnValue(false);
  apiMock.getSexOptions.mockResolvedValue([
    { value: 'Male', label: 'Male' },
    { value: 'Female', label: 'Female' },
    { value: 'Prefer Not to Say', label: 'Prefer Not to Say' },
  ]);
  apiMock.findOrCreatePatient.mockResolvedValue({ id: 'p1', name: 'Asha Rao' });
});

describe('access', () => {
  it('redirects a signed-out visitor to sign-in', () => {
    patient = null;

    renderProfile();

    expect(screen.getByText('Sign in screen')).toBeInTheDocument();
  });
});

describe('prefilling from the stored patient', () => {
  it('fills name, age and the phone number', async () => {
    renderProfile();

    expect(await screen.findByLabelText('Full name')).toHaveValue('Asha');
    expect(screen.getByLabelText('Age')).toHaveValue(34);
    expect(screen.getByLabelText('Mobile number')).toHaveValue('+919876543210');
  });

  it('locks the phone number — it is proven by the verified token, not typed', async () => {
    renderProfile();

    expect(await screen.findByLabelText('Mobile number')).toBeDisabled();
  });

  it('maps the stored enum name onto the display-name option the server expects', async () => {
    renderProfile();

    await waitFor(() => expect(screen.getByLabelText('Sex')).toHaveValue('Female'));
  });

  it('leaves the fields blank for a patient with no details yet', async () => {
    patient = { id: 'p1', phoneNumber: '+919876543210' };

    renderProfile();

    expect(await screen.findByLabelText('Full name')).toHaveValue('');
    expect(screen.getByLabelText('Age')).toHaveValue(null);
    expect(screen.getByLabelText('Sex')).toHaveValue('');
  });
});

describe('the sex options', () => {
  it('disables the select and says "Loading…" until the options arrive', async () => {
    let resolveOptions;
    apiMock.getSexOptions.mockReturnValue(new Promise((r) => { resolveOptions = r; }));

    renderProfile();

    expect(screen.getByLabelText('Sex')).toBeDisabled();
    expect(screen.getByRole('option', { name: 'Loading…' })).toBeInTheDocument();

    resolveOptions([{ value: 'Male', label: 'Male' }]);
    await waitFor(() => expect(screen.getByLabelText('Sex')).toBeEnabled());
    expect(screen.getByRole('option', { name: 'Select sex (optional)' })).toBeInTheDocument();
  });

  it('renders an option per value returned', async () => {
    renderProfile();

    await waitFor(() => expect(screen.getByRole('option', { name: 'Male' })).toBeInTheDocument());
    expect(screen.getByRole('option', { name: 'Prefer Not to Say' })).toBeInTheDocument();
  });

  it('still enables the form when the options call fails', async () => {
    apiMock.getSexOptions.mockRejectedValue(new Error('offline'));

    renderProfile();

    await waitFor(() => expect(screen.getByLabelText('Sex')).toBeEnabled());
  });
});

describe('saving', () => {
  it('disables save while the name is empty', async () => {
    const { user } = renderProfile();
    const name = await screen.findByLabelText('Full name');

    await user.clear(name);

    expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled();
  });

  it('disables save for a whitespace-only name', async () => {
    const { user } = renderProfile();
    const name = await screen.findByLabelText('Full name');

    await user.clear(name);
    await user.type(name, '   ');

    expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled();
  });

  it('submits the trimmed name with the age as a number', async () => {
    const { user } = renderProfile();
    const name = await screen.findByLabelText('Full name');

    await user.clear(name);
    await user.type(name, '  Asha Rao  ');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() =>
      expect(apiMock.findOrCreatePatient).toHaveBeenCalledWith({
        phoneNumber: '+919876543210',
        name: 'Asha Rao',
        age: 34,
        sex: 'Female',
      })
    );
  });

  it('omits age and sex when they are blank rather than sending empty strings', async () => {
    patient = { id: 'p1', phoneNumber: '+919876543210', name: 'Asha' };
    const { user } = renderProfile();

    await screen.findByLabelText('Full name');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() =>
      expect(apiMock.findOrCreatePatient).toHaveBeenCalledWith({
        phoneNumber: '+919876543210',
        name: 'Asha',
        age: undefined,
        sex: undefined,
      })
    );
  });

  it('stores the server response and confirms with a toast', async () => {
    const { user } = renderProfile();

    await screen.findByLabelText('Full name');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(setPatient).toHaveBeenCalledWith({ id: 'p1', name: 'Asha Rao' }));
    expect(await screen.findByText('Profile updated')).toBeInTheDocument();
  });

  it('shows a saving state and blocks a second submit', async () => {
    let resolveSave;
    apiMock.findOrCreatePatient.mockReturnValue(new Promise((r) => { resolveSave = r; }));
    const { user } = renderProfile();

    await screen.findByLabelText('Full name');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    const button = await screen.findByRole('button', { name: 'Saving…' });
    expect(button).toBeDisabled();

    resolveSave({ id: 'p1' });
    await screen.findByRole('button', { name: 'Save changes' });
  });
});

describe('when saving fails', () => {
  it('shows an inline alert and an error toast', async () => {
    apiMock.findOrCreatePatient.mockRejectedValue(new Error('500'));
    const { user } = renderProfile();

    await screen.findByLabelText('Full name');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Something went wrong saving your profile.'
    );
    expect(await screen.findByText('Could not save your profile. Please try again.')).toBeInTheDocument();
  });

  it('leaves an expired session entirely to the recovery hook — no inline error', async () => {
    handleAuthError.mockReturnValue(true);
    apiMock.findOrCreatePatient.mockRejectedValue(new Error('401'));
    const { user } = renderProfile();

    await screen.findByLabelText('Full name');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(handleAuthError).toHaveBeenCalled());
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('re-enables the form after a failure so the patient can retry', async () => {
    apiMock.findOrCreatePatient.mockRejectedValue(new Error('500'));
    const { user } = renderProfile();

    await screen.findByLabelText('Full name');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(await screen.findByRole('button', { name: 'Save changes' })).toBeEnabled();
  });
});
