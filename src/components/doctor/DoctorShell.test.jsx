import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import DoctorShell from './DoctorShell';
import { routerFuture } from '../../test/utils';

const navigate = vi.fn();
const endSession = vi.fn();
let session = { doctorId: 'd1', name: 'Dr Rao' };

vi.mock('react-router-dom', async (importOriginal) => ({
  ...(await importOriginal()),
  useNavigate: () => navigate,
}));

vi.mock('../../context/DoctorSessionContext', () => ({
  useDoctorSession: () => ({ session, endSession }),
}));

function setup() {
  const user = userEvent.setup();
  render(
    <MemoryRouter future={routerFuture}>
      <DoctorShell>
        <p>Case list</p>
      </DoctorShell>
    </MemoryRouter>
  );
  return { user };
}

beforeEach(() => {
  navigate.mockReset();
  endSession.mockReset();
  session = { doctorId: 'd1', name: 'Dr Rao' };
});

describe('DoctorShell', () => {
  it('renders its children in the main region', () => {
    setup();

    expect(screen.getByRole('main')).toHaveTextContent('Case list');
  });

  it('shows the signed-in doctor name', () => {
    setup();

    expect(screen.getByText('Dr Rao')).toBeInTheDocument();
  });

  it('renders without a name when there is no session yet', () => {
    session = null;
    setup();

    expect(screen.getByRole('main')).toBeInTheDocument();
  });

  it('returns to the queue from the brand button', async () => {
    const { user } = setup();

    await user.click(screen.getByRole('button', { name: /OralScreen/ }));

    expect(navigate).toHaveBeenCalledWith('/doctor');
  });

  it('ends the session and replaces the history entry on sign out', async () => {
    const { user } = setup();

    await user.click(screen.getByRole('button', { name: 'Sign out' }));

    expect(endSession).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledWith('/doctor/login', { replace: true });
  });

  it('gives the logo an empty alt — the adjacent text already names the brand', () => {
    const { container } = render(
      <MemoryRouter future={routerFuture}>
        <DoctorShell>content</DoctorShell>
      </MemoryRouter>
    );

    expect(container.querySelector('.doctor-shell__logo')).toHaveAttribute('alt', '');
  });
});
