import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AccountMenu from './AccountMenu';
import { routerFuture } from '../../test/utils';

const navigate = vi.fn();
const clearPatient = vi.fn();

vi.mock('react-router-dom', async (importOriginal) => ({
  ...(await importOriginal()),
  useNavigate: () => navigate,
}));

vi.mock('../../context/PatientContext', () => ({
  usePatient: () => ({ clearPatient }),
}));

function setup() {
  const user = userEvent.setup();
  render(
    <MemoryRouter future={routerFuture}>
      <AccountMenu />
    </MemoryRouter>
  );
  return { user, trigger: screen.getByRole('button', { name: 'Account menu' }) };
}

beforeEach(() => {
  navigate.mockReset();
  clearPatient.mockReset();
});

describe('the trigger', () => {
  it('starts collapsed and advertises that it opens a menu', () => {
    const { trigger } = setup();

    expect(trigger).toHaveAttribute('aria-haspopup', 'menu');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('opens the menu and updates aria-expanded', async () => {
    const { user, trigger } = setup();

    await user.click(trigger);

    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('menu')).toBeInTheDocument();
  });

  it('toggles the menu shut again', async () => {
    const { user, trigger } = setup();

    await user.click(trigger);
    await user.click(trigger);

    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });
});

describe('menu items', () => {
  it('lists the four patient actions', async () => {
    const { user, trigger } = setup();
    await user.click(trigger);

    expect(screen.getAllByRole('menuitem').map((i) => i.textContent)).toEqual([
      'New assessment',
      'Profile',
      'Past Assessments',
      'Log out',
    ]);
  });

  it.each([
    ['New assessment', '/questionnaire'],
    ['Profile', '/profile'],
    ['Past Assessments', '/assessments'],
  ])('navigates to %s', async (name, path) => {
    const { user, trigger } = setup();
    await user.click(trigger);

    await user.click(screen.getByRole('menuitem', { name }));

    expect(navigate).toHaveBeenCalledWith(path);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('signs the patient out and replaces the history entry with sign-in', async () => {
    const { user, trigger } = setup();
    await user.click(trigger);

    await user.click(screen.getByRole('menuitem', { name: 'Log out' }));

    expect(clearPatient).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledWith('/', { replace: true });
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });
});

describe('dismissal', () => {
  it('closes on a click outside the menu', async () => {
    const { user, trigger } = setup();
    await user.click(trigger);

    await user.click(document.body);

    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('stays open on a click inside the menu', async () => {
    const { user, trigger } = setup();
    await user.click(trigger);

    await user.click(screen.getByRole('menu'));

    expect(screen.getByRole('menu')).toBeInTheDocument();
  });

  it('closes on Escape', async () => {
    const { user, trigger } = setup();
    await user.click(trigger);

    await user.keyboard('{Escape}');

    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('ignores Escape while closed and leaves no listeners behind', async () => {
    const removeSpy = vi.spyOn(document, 'removeEventListener');
    const { user, trigger } = setup();

    await user.click(trigger);
    await user.keyboard('{Escape}');

    expect(removeSpy).toHaveBeenCalledWith('keydown', expect.any(Function));
    expect(removeSpy).toHaveBeenCalledWith('mousedown', expect.any(Function));
  });
});
