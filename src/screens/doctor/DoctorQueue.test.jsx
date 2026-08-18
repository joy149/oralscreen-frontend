import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import DoctorQueue from './DoctorQueue';
import { ApiError, api as apiMock } from '../../api/client';
import { routerFuture } from '../../test/utils';

const navigate = vi.fn();
const endSession = vi.fn();

vi.mock('../../api/client', async (importOriginal) => {
  const { mockApiModule } = await import('../../test/apiMock.js');
  return mockApiModule(await importOriginal());
});

vi.mock('react-router-dom', async (importOriginal) => ({
  ...(await importOriginal()),
  useNavigate: () => navigate,
}));

vi.mock('../../context/DoctorSessionContext', () => ({
  useDoctorSession: () => ({ session: { doctorId: 'd1', name: 'Dr Rao' }, endSession }),
}));

function renderQueue() {
  const user = userEvent.setup();
  render(
    <MemoryRouter initialEntries={['/doctor']} future={routerFuture}>
      <Routes>
        <Route path="/doctor" element={<DoctorQueue />} />
      </Routes>
    </MemoryRouter>
  );
  return { user };
}

const NOW = new Date('2026-08-06T12:00:00Z');

function ago(seconds) {
  return new Date(NOW.getTime() - seconds * 1000).toISOString();
}

const CASES = [
  {
    id: 'a1',
    name: 'Asha Rao',
    patientAge: 34,
    patientSex: 'PREFER_NOT_TO_SAY',
    createdAt: ago(60 * 30),
    aiRiskClassification: 'HIGH_RISK',
  },
  {
    id: 'a2',
    patientName: 'Bala Iyer',
    createdAt: ago(3600 * 5),
    aiRiskClassification: 'MODERATE_RISK',
    doctorRiskClassification: 'MODERATE_RISK',
  },
  {
    id: 'a3',
    name: 'Chandra Nair',
    createdAt: ago(86400 * 3),
    aiRiskClassification: 'NO_MILD_RISK',
  },
];

/** Case rows only — the header row has no patient cell. */
function caseRows() {
  return screen.getAllByRole('row').filter((r) => r.classList.contains('doctor-queue__row--case'));
}

function patientNames() {
  return caseRows().map((r) => r.querySelector('.doctor-queue__patient strong').textContent);
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true, now: NOW });
  navigate.mockReset();
  endSession.mockReset();
  apiMock.getDoctorQueue.mockResolvedValue(CASES);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('loading', () => {
  it('shows a skeleton while fetching', () => {
    apiMock.getDoctorQueue.mockReturnValue(new Promise(() => {}));

    renderQueue();

    expect(screen.getByRole('status', { name: 'Loading screening cases' })).toBeInTheDocument();
  });

  it('shows the case count once loaded', async () => {
    renderQueue();

    expect(await screen.findByText('3 cases')).toBeInTheDocument();
  });

  it('uses the singular for a single case', async () => {
    apiMock.getDoctorQueue.mockResolvedValue([CASES[0]]);

    renderQueue();

    expect(await screen.findByText('1 case')).toBeInTheDocument();
  });
});

describe('normalising the payload', () => {
  it.each(['content', 'assessments', 'queue', 'data'])('unwraps a %s-wrapped page', async (key) => {
    apiMock.getDoctorQueue.mockResolvedValue({ [key]: CASES });

    renderQueue();

    await waitFor(() => expect(caseRows()).toHaveLength(3));
  });

  it('treats an unrecognised shape as an empty queue', async () => {
    apiMock.getDoctorQueue.mockResolvedValue({ nope: true });

    renderQueue();

    expect(await screen.findByRole('heading', { name: 'No cases waiting' })).toBeInTheDocument();
  });
});

describe('the case rows', () => {
  it('shows the patient name, age and sex', async () => {
    renderQueue();

    await screen.findByText('Asha Rao');
    expect(screen.getByText('34 years / PREFER NOT TO SAY')).toBeInTheDocument();
  });

  it('falls back to patientName when name is absent', async () => {
    renderQueue();

    expect(await screen.findByText('Bala Iyer')).toBeInTheDocument();
  });

  it('names an anonymous case and says its details are unavailable', async () => {
    apiMock.getDoctorQueue.mockResolvedValue([{ id: 'a1', createdAt: ago(60) }]);

    renderQueue();

    expect(await screen.findByText('Unnamed patient')).toBeInTheDocument();
    expect(screen.getByText('Details unavailable')).toBeInTheDocument();
  });

  it.each([
    [30, 'Just now'],
    [60 * 30, '30m ago'],
    [3600 * 5, '5h ago'],
    [86400 * 3, '3d ago'],
  ])('renders a %i-second-old case as "%s"', async (seconds, expected) => {
    apiMock.getDoctorQueue.mockResolvedValue([{ id: 'a1', createdAt: ago(seconds) }]);

    renderQueue();

    expect(await screen.findByText(expected)).toBeInTheDocument();
  });

  it('switches to an absolute date beyond a week', async () => {
    apiMock.getDoctorQueue.mockResolvedValue([{ id: 'a1', createdAt: '2026-01-15T09:00:00Z' }]);

    renderQueue();

    expect(await screen.findByText('15 Jan')).toBeInTheDocument();
  });

  it('says "Unknown" for a missing timestamp', async () => {
    apiMock.getDoctorQueue.mockResolvedValue([{ id: 'a1' }]);

    renderQueue();

    expect(await screen.findByText('Unknown')).toBeInTheDocument();
  });

  it('distinguishes reviewed cases from those awaiting review', async () => {
    renderQueue();

    await screen.findByText('Asha Rao');
    // "Reviewed" is also a status filter pill, so scope this to the table.
    const table = screen.getByRole('table', { name: 'Screening cases' });
    expect(within(table).getByText('Reviewed')).toBeInTheDocument();
    expect(within(table).getAllByText('Awaiting review')).toHaveLength(2);
  });

  it('opens a case, handing the row data over as navigation state', async () => {
    const { user } = renderQueue();
    await screen.findByText('Asha Rao');

    // Default sort is oldest submitted first, so the top row is the 3-day-old case.
    await user.click(caseRows()[0]);

    expect(navigate).toHaveBeenCalledWith('/doctor/case/a3', { state: { assessment: CASES[2] } });
  });
});

describe('filtering', () => {
  it('counts each risk tier on its pill', async () => {
    renderQueue();

    const riskGroup = await screen.findByRole('group', { name: 'Filter by risk' });
    expect(within(riskGroup).getByRole('button', { name: /High/ })).toHaveTextContent('1');
    expect(within(riskGroup).getByRole('button', { name: /Moderate/ })).toHaveTextContent('1');
  });

  it('counts awaiting and reviewed on the status pills', async () => {
    renderQueue();

    const statusGroup = await screen.findByRole('group', { name: 'Filter by status' });
    expect(within(statusGroup).getByRole('button', { name: /Awaiting review/ })).toHaveTextContent('2');
    expect(within(statusGroup).getByRole('button', { name: /Reviewed/ })).toHaveTextContent('1');
  });

  it('narrows to a single risk tier and shows the filtered count', async () => {
    const { user } = renderQueue();
    const riskGroup = await screen.findByRole('group', { name: 'Filter by risk' });

    await user.click(within(riskGroup).getByRole('button', { name: /High/ }));

    expect(patientNames()).toEqual(['Asha Rao']);
    expect(screen.getByText('1 of 3 case', { exact: false })).toBeInTheDocument();
  });

  it('toggles a risk filter back off when tapped again', async () => {
    const { user } = renderQueue();
    const riskGroup = await screen.findByRole('group', { name: 'Filter by risk' });
    const high = within(riskGroup).getByRole('button', { name: /High/ });

    await user.click(high);
    await user.click(high);

    expect(caseRows()).toHaveLength(3);
  });

  it('narrows by review status', async () => {
    const { user } = renderQueue();
    const statusGroup = await screen.findByRole('group', { name: 'Filter by status' });

    await user.click(within(statusGroup).getByRole('button', { name: /^Reviewed/ }));

    expect(patientNames()).toEqual(['Bala Iyer']);
  });

  it('combines a risk and a status filter', async () => {
    const { user } = renderQueue();
    const riskGroup = await screen.findByRole('group', { name: 'Filter by risk' });
    const statusGroup = screen.getByRole('group', { name: 'Filter by status' });

    await user.click(within(riskGroup).getByRole('button', { name: /High/ }));
    await user.click(within(statusGroup).getByRole('button', { name: /^Reviewed/ }));

    expect(screen.getByRole('heading', { name: 'No cases match these filters' })).toBeInTheDocument();
  });

  it('clears every filter from the toolbar', async () => {
    const { user } = renderQueue();
    const riskGroup = await screen.findByRole('group', { name: 'Filter by risk' });

    await user.click(within(riskGroup).getByRole('button', { name: /High/ }));
    await user.click(screen.getByRole('button', { name: 'Clear filters' }));

    expect(caseRows()).toHaveLength(3);
  });

  it('clears filters from the empty-result state too', async () => {
    const { user } = renderQueue();
    const riskGroup = await screen.findByRole('group', { name: 'Filter by risk' });
    const statusGroup = screen.getByRole('group', { name: 'Filter by status' });

    await user.click(within(riskGroup).getByRole('button', { name: /High/ }));
    await user.click(within(statusGroup).getByRole('button', { name: /^Reviewed/ }));
    await screen.findByRole('heading', { name: 'No cases match these filters' });

    // Both the toolbar and this empty state offer the control; either clears everything.
    await user.click(screen.getAllByRole('button', { name: 'Clear filters' })[1]);
    expect(caseRows()).toHaveLength(3);
  });

  it('shows the All-risk pill as active by default', async () => {
    renderQueue();

    const riskGroup = await screen.findByRole('group', { name: 'Filter by risk' });
    expect(within(riskGroup).getByRole('button', { name: 'All risk' })).toHaveClass('is-active');
  });
});

describe('sorting', () => {
  it('defaults to oldest submitted first, ascending', async () => {
    renderQueue();

    await screen.findByText('Asha Rao');
    expect(patientNames()).toEqual(['Chandra Nair', 'Bala Iyer', 'Asha Rao']);
    expect(screen.getByRole('columnheader', { name: /Submitted/ })).toHaveAttribute(
      'aria-sort',
      'ascending'
    );
  });

  it('reverses direction when the active column is tapped again', async () => {
    const { user } = renderQueue();
    await screen.findByText('Asha Rao');

    await user.click(screen.getByRole('button', { name: /Submitted/ }));

    expect(patientNames()).toEqual(['Asha Rao', 'Bala Iyer', 'Chandra Nair']);
    expect(screen.getByRole('columnheader', { name: /Submitted/ })).toHaveAttribute(
      'aria-sort',
      'descending'
    );
  });

  it('sorts by patient name, starting ascending', async () => {
    const { user } = renderQueue();
    await screen.findByText('Asha Rao');

    await user.click(screen.getByRole('button', { name: /Patient/ }));

    expect(patientNames()).toEqual(['Asha Rao', 'Bala Iyer', 'Chandra Nair']);
  });

  it('sorts by risk lexicographically, not by severity', async () => {
    const { user } = renderQueue();
    await screen.findByText('Asha Rao');

    await user.click(screen.getByRole('button', { name: /Risk/ }));

    // HIGH_RISK < MODERATE_RISK < NO_MILD_RISK as strings — deliberately a string compare.
    expect(patientNames()).toEqual(['Asha Rao', 'Bala Iyer', 'Chandra Nair']);
  });

  it('resets to ascending when switching to a different column', async () => {
    const { user } = renderQueue();
    await screen.findByText('Asha Rao');

    await user.click(screen.getByRole('button', { name: /Submitted/ })); // now descending
    await user.click(screen.getByRole('button', { name: /Patient/ }));

    expect(screen.getByRole('columnheader', { name: /Patient/ })).toHaveAttribute(
      'aria-sort',
      'ascending'
    );
  });
});

describe('keyboard navigation', () => {
  it('opens the focused case on Enter after moving down with j', async () => {
    const { user } = renderQueue();
    await screen.findByText('Asha Rao');

    await user.keyboard('j{Enter}');

    // Default sort is oldest-first, so the first row is Chandra Nair.
    expect(navigate).toHaveBeenCalledWith('/doctor/case/a3');
  });

  it('supports the arrow keys as well as j/k', async () => {
    const { user } = renderQueue();
    await screen.findByText('Asha Rao');

    await user.keyboard('{ArrowDown}{ArrowDown}{ArrowUp}{Enter}');

    expect(navigate).toHaveBeenCalledWith('/doctor/case/a3');
  });

  it('does not move past the last row', async () => {
    const { user } = renderQueue();
    await screen.findByText('Asha Rao');

    await user.keyboard('jjjjjj{Enter}');

    expect(navigate).toHaveBeenCalledWith('/doctor/case/a1');
  });

  it('does nothing on Enter before anything is focused', async () => {
    const { user } = renderQueue();
    await screen.findByText('Asha Rao');

    await user.keyboard('{Enter}');

    expect(navigate).not.toHaveBeenCalled();
  });

  it('stays out of the way while a form control has focus', async () => {
    const { user } = renderQueue();
    await screen.findByText('Asha Rao');
    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();

    await user.keyboard('j');
    input.remove();

    expect(navigate).not.toHaveBeenCalled();
  });

  // Note: the row's React key is `assessment.id` alone, so a payload in this shape also
  // logs a duplicate-key warning. The keyboard handler explicitly tolerates `assessmentId`,
  // so the key should use the same fallback.
  it('falls back to assessmentId when a row carries no id', async () => {
    apiMock.getDoctorQueue.mockResolvedValue([{ assessmentId: 'alt-1', createdAt: ago(60) }]);
    const { user } = renderQueue();
    await screen.findByText('Unnamed patient');

    await user.keyboard('j{Enter}');

    expect(navigate).toHaveBeenCalledWith('/doctor/case/alt-1');
  });
});

describe('empty and error states', () => {
  it('says the queue is empty', async () => {
    apiMock.getDoctorQueue.mockResolvedValue([]);

    renderQueue();

    expect(await screen.findByRole('heading', { name: 'No cases waiting' })).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Filter by risk' })).not.toBeInTheDocument();
  });

  it('offers a retry when the queue fails to load', async () => {
    apiMock.getDoctorQueue.mockRejectedValueOnce(new ApiError('boom', 500, null));
    const { user } = renderQueue();

    expect(await screen.findByRole('heading', { name: 'Queue unavailable' })).toBeInTheDocument();

    apiMock.getDoctorQueue.mockResolvedValue(CASES);
    await user.click(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByText('Asha Rao')).toBeInTheDocument();
  });

  it('ends the session and returns to login on a 401', async () => {
    apiMock.getDoctorQueue.mockRejectedValue(new ApiError('Unauthorized', 401, null));

    renderQueue();

    await waitFor(() => expect(endSession).toHaveBeenCalledTimes(1));
    expect(navigate).toHaveBeenCalledWith('/doctor/login', { replace: true });
  });

  it('keeps the session on a 403 — signed in but not approved is not a reason to sign out', async () => {
    apiMock.getDoctorQueue.mockRejectedValue(new ApiError('Forbidden', 403, null));

    renderQueue();

    expect(await screen.findByRole('heading', { name: 'Queue unavailable' })).toBeInTheDocument();
    expect(endSession).not.toHaveBeenCalled();
  });
});
