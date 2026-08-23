import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import CostPanel from './CostPanel';
import { ApiError, api as apiMock } from '../../api/client';

vi.mock('../../api/client', async (importOriginal) => {
  const { mockApiModule } = await import('../../test/apiMock.js');
  return mockApiModule(await importOriginal());
});

const SUMMARY = {
  totalCostUsd: 1.2,
  averageCostPerAssessmentUsd: 0.03,
  assessmentsWithKnownCost: 40,
  totalAssessments: 50,
  totalInputTokens: 480000,
  totalOutputTokens: 32000,
  totalProviderCalls: 54,
  unsuccessfulProviderCalls: 4,
  wastedCostUsd: 0.01,
};

const ROW = {
  assessmentId: '11111111-1111-1111-1111-111111111111',
  questionnaireId: '22222222-2222-2222-2222-222222222222',
  createdAt: '2026-08-20T09:15:30Z',
  provider: 'GEMINI_PRO',
  modelVersion: 'gemini-3.5-flash',
  promptVersion: 'v2',
  aiRiskClassification: 'HIGH_RISK',
  inputTokens: 12000,
  outputTokens: 800,
  costUsd: 0.0252,
  providerCalls: 2,
  billedButDiscardedCalls: 1,
  providerLatencyMillis: 38000,
};

function response(overrides = {}) {
  return {
    summary: { ...SUMMARY, ...(overrides.summary || {}) },
    rows: overrides.rows ?? [ROW],
    page: 0,
    size: 50,
    totalRows: 137,
    totalPages: 3,
    from: '2026-08-01T00:00:00Z',
    to: '2026-08-20T12:00:00Z',
    ...overrides,
  };
}

const onKeyRejected = vi.fn();

function renderPanel(props = {}) {
  const user = userEvent.setup();
  render(<CostPanel adminKey="secret-key" onKeyRejected={onKeyRejected} {...props} />);
  return { user };
}

/** The options object of the Nth `getAdminCosts` call. */
function callArgs(index = 0) {
  return apiMock.getAdminCosts.mock.calls[index][1];
}

/** The one data row on screen. */
async function firstRow() {
  const cell = await screen.findByRole('rowheader');
  return cell.closest('tr');
}

beforeEach(() => {
  onKeyRejected.mockReset();
  apiMock.getAdminCosts.mockResolvedValue(response());
});

describe('loading the report', () => {
  it('asks for the first page with the admin key, letting the server default the window', async () => {
    renderPanel();

    await waitFor(() => expect(apiMock.getAdminCosts).toHaveBeenCalled());
    expect(apiMock.getAdminCosts).toHaveBeenCalledWith('secret-key', {
      from: undefined,
      to: undefined,
      page: 0,
      size: 50,
    });
  });

  it('fetches nothing without a key', async () => {
    renderPanel({ adminKey: '' });

    await Promise.resolve();
    expect(apiMock.getAdminCosts).not.toHaveBeenCalled();
  });

  it('shows a loading state before the report arrives', () => {
    apiMock.getAdminCosts.mockReturnValue(new Promise(() => {}));

    renderPanel();

    expect(screen.getByRole('status', { name: 'Loading cost report' })).toBeInTheDocument();
  });

  it('reports the window the server actually applied', async () => {
    renderPanel();

    expect(await screen.findByText('1 Aug 2026 – 20 Aug 2026')).toBeInTheDocument();
  });

  it('refreshes on demand', async () => {
    const { user } = renderPanel();
    await screen.findByRole('rowheader');

    await user.click(screen.getByRole('button', { name: 'Refresh costs' }));

    await waitFor(() => expect(apiMock.getAdminCosts).toHaveBeenCalledTimes(2));
  });
});

describe('the summary tiles', () => {
  it('shows total spend over the priced assessments only', async () => {
    renderPanel();

    expect(await screen.findByText('$1.20')).toBeInTheDocument();
    expect(screen.getByText('Over the 40 priced assessments')).toBeInTheDocument();
  });

  it('names the divisor for the average, which is not the assessment total', async () => {
    renderPanel();

    expect(await screen.findByText('$0.03')).toBeInTheDocument();
    expect(
      screen.getByText('Divided by assessments with a known cost, not by all of them')
    ).toBeInTheDocument();
  });

  it('renders the coverage pair and flags what the totals leave out', async () => {
    renderPanel();

    expect(await screen.findByText('40 of 50')).toBeInTheDocument();
    expect(
      screen.getByText('10 unpriced — the totals above exclude them')
    ).toBeInTheDocument();
  });

  it('says so when every assessment is priced', async () => {
    apiMock.getAdminCosts.mockResolvedValue(
      response({ summary: { assessmentsWithKnownCost: 50, totalAssessments: 50 } })
    );

    renderPanel();

    expect(await screen.findByText('Every assessment in this window is priced')).toBeInTheDocument();
  });

  it('attributes the gap between calls and assessments to retries', async () => {
    renderPanel();

    expect(await screen.findByText('54')).toBeInTheDocument();
    expect(
      screen.getByText('4 more than assessments — retries and fallovers')
    ).toBeInTheDocument();
  });

  it('does not invent a negative gap if the call count ever undercuts assessments', async () => {
    apiMock.getAdminCosts.mockResolvedValue(
      response({ summary: { totalProviderCalls: 50, totalAssessments: 50 } })
    );

    renderPanel();

    expect(await screen.findByText('One call per assessment')).toBeInTheDocument();
  });

  it('counts the billed calls that produced nothing usable', async () => {
    renderPanel();

    expect(await screen.findByText('$0.01')).toBeInTheDocument();
    expect(screen.getByText('4 billed calls produced nothing usable')).toBeInTheDocument();
  });

  it('uses the singular for a single wasted call', async () => {
    apiMock.getAdminCosts.mockResolvedValue(
      response({ summary: { unsuccessfulProviderCalls: 1 } })
    );

    renderPanel();

    expect(await screen.findByText('1 billed call produced nothing usable')).toBeInTheDocument();
  });

  it('says nothing was wasted when no call went unused', async () => {
    apiMock.getAdminCosts.mockResolvedValue(
      response({ summary: { unsuccessfulProviderCalls: 0, wastedCostUsd: 0 } })
    );

    renderPanel();

    expect(await screen.findByText('No billed call went unused')).toBeInTheDocument();
  });

  it('splits the token totals into in and out', async () => {
    renderPanel();

    expect(await screen.findByText('480,000')).toBeInTheDocument();
    expect(screen.getByText('32,000')).toBeInTheDocument();
  });

  // The whole point of the nullable columns: unmeasured is not free.
  it('renders an unmeasured total as a dash rather than $0.00', async () => {
    apiMock.getAdminCosts.mockResolvedValue(
      response({
        summary: {
          totalCostUsd: null,
          averageCostPerAssessmentUsd: null,
          wastedCostUsd: null,
          totalInputTokens: null,
          totalOutputTokens: null,
        },
      })
    );

    renderPanel();

    await waitFor(() => expect(screen.getAllByTitle('Not measured').length).toBeGreaterThan(0));
    expect(screen.queryByText('$0.00')).not.toBeInTheDocument();
  });
});

describe('the row table', () => {
  it('shows the model, prompt version and AI risk for a case', async () => {
    renderPanel();
    const row = await firstRow();

    expect(within(row).getByText('Gemini Pro')).toBeInTheDocument();
    expect(within(row).getByText('gemini-3.5-flash · v2')).toBeInTheDocument();
    expect(within(row).getByText('High')).toBeInTheDocument();
  });

  it('shortens the ids but keeps the full ones reachable', async () => {
    renderPanel();
    const row = await firstRow();

    expect(within(row).getByTitle(ROW.assessmentId)).toHaveTextContent('11111111');
    expect(within(row).getByTitle(`Questionnaire ${ROW.questionnaireId}`)).toHaveTextContent(
      'q/22222222'
    );
  });

  it('shows tokens and cost at the precision the API reports them', async () => {
    renderPanel();
    const row = await firstRow();

    expect(within(row).getByText('12,000')).toBeInTheDocument();
    expect(within(row).getByText('800')).toBeInTheDocument();
    expect(within(row).getByText('$0.0252')).toBeInTheDocument();
  });

  it('marks a retried case and the spend it threw away', async () => {
    renderPanel();
    const row = await firstRow();

    expect(within(row).getByText('2')).toBeInTheDocument();
    expect(within(row).getByText('1 wasted')).toBeInTheDocument();
  });

  it('leaves a single-call case unflagged', async () => {
    apiMock.getAdminCosts.mockResolvedValue(
      response({ rows: [{ ...ROW, providerCalls: 1, billedButDiscardedCalls: 0 }] })
    );

    renderPanel();
    const row = await firstRow();

    expect(within(row).queryByText(/wasted/)).not.toBeInTheDocument();
  });

  it.each([
    [380, '380 ms'],
    [38000, '38.0s'],
    [95000, '1m 35s'],
  ])('formats %i ms of provider latency as "%s"', async (millis, expected) => {
    apiMock.getAdminCosts.mockResolvedValue(
      response({ rows: [{ ...ROW, providerLatencyMillis: millis }] })
    );

    renderPanel();

    expect(await screen.findByText(expected)).toBeInTheDocument();
  });

  it('marks unmeasured row figures rather than showing them as zero', async () => {
    apiMock.getAdminCosts.mockResolvedValue(
      response({
        rows: [
          {
            ...ROW,
            inputTokens: null,
            outputTokens: null,
            costUsd: null,
            providerLatencyMillis: null,
          },
        ],
      })
    );

    renderPanel();
    const row = await firstRow();

    expect(within(row).getAllByTitle('Not measured')).toHaveLength(4);
  });

  it('falls back to the raw enum for a provider it does not know', async () => {
    apiMock.getAdminCosts.mockResolvedValue(
      response({ rows: [{ ...ROW, provider: 'SOMETHING_NEW' }] })
    );

    renderPanel();

    expect(await screen.findByText('SOMETHING_NEW')).toBeInTheDocument();
  });

  it('shows an empty state instead of a bare table', async () => {
    apiMock.getAdminCosts.mockResolvedValue(response({ rows: [], totalRows: 0, totalPages: 0 }));

    renderPanel();

    expect(
      await screen.findByRole('heading', { name: 'No assessments in this window' })
    ).toBeInTheDocument();
    expect(screen.getByText('Costs will appear here once assessments are run.')).toBeInTheDocument();
  });
});

describe('the date range', () => {
  it('sends nothing until a range is applied', async () => {
    const { user } = renderPanel();
    await screen.findByRole('rowheader');

    await user.type(screen.getByLabelText(/From/), '2026-08-01');

    expect(apiMock.getAdminCosts).toHaveBeenCalledTimes(1);
  });

  // A bare calendar date is not an instant. Opening one end of the day and closing the
  // other is what makes a same-day range cover that day rather than a single midnight.
  it('widens the applied dates to cover whole days', async () => {
    const { user } = renderPanel();
    await screen.findByRole('rowheader');

    await user.type(screen.getByLabelText(/From/), '2026-08-01');
    await user.type(screen.getByLabelText(/To/), '2026-08-20');
    await user.click(screen.getByRole('button', { name: 'Apply' }));

    await waitFor(() => expect(apiMock.getAdminCosts).toHaveBeenCalledTimes(2));
    expect(callArgs(1)).toMatchObject({
      from: '2026-08-01T00:00:00Z',
      to: '2026-08-20T23:59:59Z',
    });
  });

  it('applies one open-ended bound on its own', async () => {
    const { user } = renderPanel();
    await screen.findByRole('rowheader');

    await user.type(screen.getByLabelText(/From/), '2026-08-01');
    await user.click(screen.getByRole('button', { name: 'Apply' }));

    await waitFor(() => expect(apiMock.getAdminCosts).toHaveBeenCalledTimes(2));
    expect(callArgs(1)).toMatchObject({ from: '2026-08-01T00:00:00Z', to: undefined });
  });

  it('offers no clear control until a range is applied', async () => {
    renderPanel();
    await screen.findByRole('rowheader');

    expect(screen.queryByRole('button', { name: 'Clear dates' })).not.toBeInTheDocument();
  });

  it('clears back to the server defaults', async () => {
    const { user } = renderPanel();
    await screen.findByRole('rowheader');

    await user.type(screen.getByLabelText(/From/), '2026-08-01');
    await user.click(screen.getByRole('button', { name: 'Apply' }));
    await waitFor(() => expect(apiMock.getAdminCosts).toHaveBeenCalledTimes(2));

    await user.click(screen.getByRole('button', { name: 'Clear dates' }));

    await waitFor(() => expect(apiMock.getAdminCosts).toHaveBeenCalledTimes(3));
    expect(callArgs(2)).toMatchObject({ from: undefined, to: undefined, page: 0 });
    expect(screen.getByLabelText(/From/)).toHaveValue('');
  });

  it('points at the range when a filtered window turns up nothing', async () => {
    const { user } = renderPanel();
    await screen.findByRole('rowheader');

    apiMock.getAdminCosts.mockResolvedValue(response({ rows: [], totalRows: 0, totalPages: 0 }));
    await user.type(screen.getByLabelText(/From/), '2026-08-01');
    await user.click(screen.getByRole('button', { name: 'Apply' }));

    expect(
      await screen.findByText('Widen the date range to see priced assessments.')
    ).toBeInTheDocument();
  });

  it('returns to the first page when the range changes', async () => {
    const { user } = renderPanel();
    await screen.findByRole('rowheader');

    apiMock.getAdminCosts.mockResolvedValue(response({ page: 1 }));
    await user.click(screen.getByRole('button', { name: 'Next page' }));
    await waitFor(() => expect(callArgs(1)).toMatchObject({ page: 1 }));

    apiMock.getAdminCosts.mockResolvedValue(response());
    await user.type(screen.getByLabelText(/From/), '2026-08-01');
    await user.click(screen.getByRole('button', { name: 'Apply' }));

    await waitFor(() => expect(callArgs(2)).toMatchObject({ page: 0 }));
  });
});

describe('paging', () => {
  it('counts the visible slice out of the total', async () => {
    apiMock.getAdminCosts.mockResolvedValue(response({ rows: [ROW], totalRows: 137 }));

    renderPanel();

    expect(await screen.findByText('Showing 1–1 of 137')).toBeInTheDocument();
    expect(screen.getByText('Page 1 of 3')).toBeInTheDocument();
  });

  it('walks forward and back', async () => {
    const { user } = renderPanel();
    await screen.findByRole('rowheader');

    apiMock.getAdminCosts.mockResolvedValue(response({ page: 1 }));
    await user.click(screen.getByRole('button', { name: 'Next page' }));
    await waitFor(() => expect(callArgs(1)).toMatchObject({ page: 1 }));
    expect(await screen.findByText('Page 2 of 3')).toBeInTheDocument();

    apiMock.getAdminCosts.mockResolvedValue(response({ page: 0 }));
    await user.click(screen.getByRole('button', { name: 'Previous page' }));
    await waitFor(() => expect(callArgs(2)).toMatchObject({ page: 0 }));
  });

  it('stops at both ends', async () => {
    apiMock.getAdminCosts.mockResolvedValue(response({ page: 0, totalPages: 1 }));

    renderPanel();
    await screen.findByRole('rowheader');

    expect(screen.getByRole('button', { name: 'Previous page' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Next page' })).toBeDisabled();
  });

  it('pages from where the server says it is, not from what was asked for', async () => {
    // The server floors a negative page and clamps size; the footer must follow the
    // response, so the next click steps off the served page rather than a local guess.
    apiMock.getAdminCosts.mockResolvedValue(response({ page: 2, totalPages: 5 }));
    const { user } = renderPanel();
    await screen.findByRole('rowheader');

    await user.click(screen.getByRole('button', { name: 'Next page' }));

    await waitFor(() => expect(callArgs(1)).toMatchObject({ page: 3 }));
  });

  it('requests a new page size and starts again from the first page', async () => {
    const { user } = renderPanel();
    await screen.findByRole('rowheader');

    await user.selectOptions(screen.getByLabelText('Rows per page'), '200');

    await waitFor(() => expect(callArgs(1)).toMatchObject({ page: 0, size: 200 }));
  });

  it('counts with the size the server granted, not the one requested', async () => {
    // size is clamped to 200 server-side; the offsets below have to use the echoed value.
    apiMock.getAdminCosts.mockResolvedValue(
      response({ page: 1, size: 25, rows: [ROW], totalRows: 137 })
    );

    renderPanel();

    expect(await screen.findByText('Showing 26–26 of 137')).toBeInTheDocument();
  });
});

describe('failure', () => {
  it('shows the server message with a retry', async () => {
    apiMock.getAdminCosts.mockRejectedValueOnce(new ApiError('Cost table unavailable', 500, null));
    const { user } = renderPanel();

    expect(
      await screen.findByRole('heading', { name: 'Could not load the cost report' })
    ).toBeInTheDocument();
    expect(screen.getByText('Cost table unavailable')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByRole('rowheader')).toBeInTheDocument();
  });

  it('shows generic copy for a non-ApiError failure', async () => {
    apiMock.getAdminCosts.mockRejectedValue(new TypeError('Failed to fetch'));

    renderPanel();

    expect(await screen.findByText('Failed to connect to backend server.')).toBeInTheDocument();
  });

  // A revoked key is the console's problem, not this panel's — it must lock everything
  // rather than sit next to a doctor queue that implies the key still works.
  it.each([401, 403])('hands a %i up to the console instead of showing an error', async (status) => {
    apiMock.getAdminCosts.mockRejectedValue(new ApiError('That key was rejected.', status, null));

    renderPanel();

    await waitFor(() => expect(onKeyRejected).toHaveBeenCalledWith('That key was rejected.'));
    expect(
      screen.queryByRole('heading', { name: 'Could not load the cost report' })
    ).not.toBeInTheDocument();
  });
});
