import { useCallback, useEffect, useState } from 'react';
import { ApiError, api } from '../../api/client';
import ErrorState from '../../components/shared/ErrorState';
import Skeleton from '../../components/shared/Skeleton';
import {
  Coins,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
  Repeat,
} from 'lucide-react';
import './CostPanel.css';

const PAGE_SIZES = [25, 50, 100, 200];

const RISK_LABELS = {
  NO_MILD_RISK: 'No / mild',
  MODERATE_RISK: 'Moderate',
  HIGH_RISK: 'High',
};

const PROVIDER_LABELS = {
  GEMINI_PRO: 'Gemini Pro',
  CLAUDE: 'Claude',
};

/**
 * Costs run to six decimal places and a single assessment can land under a tenth of a
 * cent, so a fixed two-decimal currency format would render most of this table as
 * "$0.00". `maximumFractionDigits: 6` keeps the small numbers legible while still
 * printing a $1.20 total as $1.20 rather than $1.200000.
 */
const USD = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 6,
});

// en-US, not the en-IN used for dates elsewhere on this screen: lakh grouping
// ("4,80,000") next to a US-dollar column reads as a typo.
const COUNT = new Intl.NumberFormat('en-US');

const DATE_TIME = new Intl.DateTimeFormat('en-IN', {
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
});

const DATE_ONLY = new Intl.DateTimeFormat('en-IN', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});

/**
 * `null` means unmeasured, which is not the same as zero — a row whose cost was never
 * recorded must not read as a free assessment. Every nullable field routes through here.
 */
function Unmeasured() {
  return (
    <span className="cost-panel__unmeasured" title="Not measured">
      &mdash;
    </span>
  );
}

function formatUsd(value) {
  return value == null ? null : USD.format(value);
}

function formatCount(value) {
  return value == null ? null : COUNT.format(value);
}

/** Summed across every provider call for the assessment, so it can run to minutes. */
function formatLatency(millis) {
  if (millis == null) return null;
  if (millis < 1000) return `${Math.round(millis)} ms`;
  if (millis < 60000) return `${(millis / 1000).toFixed(1)}s`;
  const minutes = Math.floor(millis / 60000);
  const seconds = Math.round((millis % 60000) / 1000);
  return `${minutes}m ${seconds}s`;
}

function formatTimestamp(value, formatter) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return String(value);
  return formatter.format(parsed);
}

/** The first block of a UUID is enough to recognise a case; the full id is in `title`. */
function shortId(id) {
  if (!id) return '—';
  return String(id).split('-')[0];
}

/**
 * A `<input type="date">` yields a bare calendar date; the endpoint wants an instant.
 * `from` opens the day and `to` closes it, so a same-day range covers that whole day
 * rather than collapsing to midnight-to-midnight and returning nothing.
 */
function toInstant(date, edge) {
  if (!date) return undefined;
  return edge === 'end' ? `${date}T23:59:59Z` : `${date}T00:00:00Z`;
}

function SummaryTile({ label, value, note, tone = 'neutral', icon: Icon }) {
  return (
    <div className={`cost-panel__tile cost-panel__tile--${tone}`}>
      <div className="cost-panel__tile-label">
        {Icon && <Icon size={14} aria-hidden="true" />}
        <span>{label}</span>
      </div>
      <div className="cost-panel__tile-value">{value}</div>
      {note && <p className="cost-panel__tile-note">{note}</p>}
    </div>
  );
}

function SummaryTiles({ summary }) {
  const {
    totalCostUsd,
    averageCostPerAssessmentUsd,
    assessmentsWithKnownCost,
    totalAssessments,
    totalInputTokens,
    totalOutputTokens,
    totalProviderCalls,
    unsuccessfulProviderCalls,
    wastedCostUsd,
  } = summary;

  // The contract guarantees totalProviderCalls >= totalAssessments, but a UI that
  // renders "-3 extra calls" if that ever slips is worse than one that says nothing.
  const extraCalls = Math.max(0, totalProviderCalls - totalAssessments);
  const coverageComplete = assessmentsWithKnownCost >= totalAssessments;

  return (
    <div className="cost-panel__tiles">
      <SummaryTile
        icon={Coins}
        label="Total spend"
        value={formatUsd(totalCostUsd) ?? <Unmeasured />}
        note={`Over the ${COUNT.format(assessmentsWithKnownCost)} priced ${
          assessmentsWithKnownCost === 1 ? 'assessment' : 'assessments'
        }`}
      />

      <SummaryTile
        label="Average per assessment"
        value={formatUsd(averageCostPerAssessmentUsd) ?? <Unmeasured />}
        note="Divided by assessments with a known cost, not by all of them"
      />

      <SummaryTile
        label="Cost coverage"
        tone={coverageComplete ? 'neutral' : 'warn'}
        value={`${COUNT.format(assessmentsWithKnownCost)} of ${COUNT.format(totalAssessments)}`}
        note={
          coverageComplete
            ? 'Every assessment in this window is priced'
            : `${COUNT.format(totalAssessments - assessmentsWithKnownCost)} unpriced — the totals above exclude them`
        }
      />

      <SummaryTile
        label="Tokens"
        value={
          totalInputTokens == null && totalOutputTokens == null ? (
            <Unmeasured />
          ) : (
            <>
              <span>{formatCount(totalInputTokens) ?? <Unmeasured />}</span>
              <span className="cost-panel__tile-sep"> in / </span>
              <span>{formatCount(totalOutputTokens) ?? <Unmeasured />}</span>
              <span className="cost-panel__tile-sep"> out</span>
            </>
          )
        }
        note="Summed across every provider call"
      />

      <SummaryTile
        icon={Repeat}
        label="Provider calls"
        value={COUNT.format(totalProviderCalls)}
        note={
          extraCalls > 0
            ? `${COUNT.format(extraCalls)} more than assessments — retries and fallovers`
            : 'One call per assessment'
        }
      />

      <SummaryTile
        icon={AlertTriangle}
        label="Wasted spend"
        tone={unsuccessfulProviderCalls > 0 ? 'warn' : 'neutral'}
        value={formatUsd(wastedCostUsd) ?? <Unmeasured />}
        note={
          unsuccessfulProviderCalls > 0
            ? `${COUNT.format(unsuccessfulProviderCalls)} billed ${
                unsuccessfulProviderCalls === 1 ? 'call' : 'calls'
              } produced nothing usable`
            : 'No billed call went unused'
        }
      />
    </div>
  );
}

function CostRow({ row }) {
  const retried = row.providerCalls > 1;
  const discarded = row.billedButDiscardedCalls > 0;

  return (
    <tr className={discarded ? 'cost-panel__row--waste' : undefined}>
      <th scope="row" className="cost-panel__cell--id">
        <span className="cost-panel__mono" title={row.assessmentId}>
          {shortId(row.assessmentId)}
        </span>
        <span className="cost-panel__subtle" title={`Questionnaire ${row.questionnaireId}`}>
          q/{shortId(row.questionnaireId)}
        </span>
      </th>

      <td>
        <span title={row.createdAt}>{formatTimestamp(row.createdAt, DATE_TIME) ?? <Unmeasured />}</span>
      </td>

      <td>
        <span className="cost-panel__model">
          {PROVIDER_LABELS[row.provider] || row.provider}
        </span>
        <span className="cost-panel__subtle">
          {row.modelVersion} · {row.promptVersion}
        </span>
      </td>

      <td>
        <span
          className={`cost-panel__risk cost-panel__risk--${String(row.aiRiskClassification).toLowerCase()}`}
        >
          {RISK_LABELS[row.aiRiskClassification] || row.aiRiskClassification}
        </span>
      </td>

      <td className="cost-panel__cell--num">{formatCount(row.inputTokens) ?? <Unmeasured />}</td>
      <td className="cost-panel__cell--num">{formatCount(row.outputTokens) ?? <Unmeasured />}</td>
      <td className="cost-panel__cell--num cost-panel__cell--cost">
        {formatUsd(row.costUsd) ?? <Unmeasured />}
      </td>

      <td className="cost-panel__cell--num">
        <span className={retried ? 'cost-panel__calls cost-panel__calls--retried' : undefined}>
          {COUNT.format(row.providerCalls)}
        </span>
        {discarded && (
          <span className="cost-panel__discarded" title="Billed but discarded calls">
            {COUNT.format(row.billedButDiscardedCalls)} wasted
          </span>
        )}
      </td>

      <td className="cost-panel__cell--num">{formatLatency(row.providerLatencyMillis) ?? <Unmeasured />}</td>
    </tr>
  );
}

/**
 * Per-assessment AI spend, read from `/api/admin/costs`.
 *
 * Paging is server-side, so the table deliberately offers no column sorting: sorting
 * the fifty rows currently on screen would silently imply it had ranked all 137.
 *
 * The panel owns its own loading and error state and never unmounts the rest of the
 * console — a costs outage must not hide the doctors waiting for approval. A rejected
 * key is the one exception, and it is handed up via `onKeyRejected` so the whole console
 * locks rather than this one panel claiming the key still works.
 */
export default function CostPanel({ adminKey, onKeyRejected }) {
  // Draft vs applied: the date inputs are edited freely and only committed on submit,
  // so a half-typed year never becomes a request.
  const [draftFrom, setDraftFrom] = useState('');
  const [draftTo, setDraftTo] = useState('');
  const [range, setRange] = useState({ from: '', to: '' });

  const [page, setPage] = useState(0);
  const [size, setSize] = useState(50);

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    if (!adminKey) return;
    setLoading(true);
    setError(null);
    try {
      const payload = await api.getAdminCosts(adminKey, {
        from: toInstant(range.from, 'start'),
        to: toInstant(range.to, 'end'),
        page,
        size,
      });
      setData(payload);
    } catch (err) {
      if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
        onKeyRejected?.(err.message);
        return;
      }
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [adminKey, range, page, size, onKeyRejected]);

  useEffect(() => {
    load();
  }, [load]);

  const applyRange = (event) => {
    event.preventDefault();
    setPage(0);
    setRange({ from: draftFrom, to: draftTo });
  };

  const clearRange = () => {
    setDraftFrom('');
    setDraftTo('');
    setPage(0);
    setRange({ from: '', to: '' });
  };

  const changeSize = (event) => {
    setPage(0);
    setSize(Number(event.target.value));
  };

  const rows = data?.rows || [];
  // Never trust the requested page/size: `size` is clamped to 200 server-side and a
  // negative page is floored, so the pagination footer reads what came back.
  const effectivePage = data?.page ?? page;
  const effectiveSize = data?.size ?? size;
  const totalRows = data?.totalRows ?? 0;
  const totalPages = data?.totalPages ?? 0;
  const firstRow = totalRows === 0 ? 0 : effectivePage * effectiveSize + 1;
  const lastRow = Math.min(firstRow + rows.length - 1, totalRows);
  const rangeApplied = Boolean(range.from || range.to);

  return (
    <section className="cost-panel" aria-labelledby="cost-panel-heading">
      <div className="cost-panel__heading">
        <div>
          <p className="cost-panel__eyebrow">AI spend</p>
          <h2 id="cost-panel-heading">Cost per assessment</h2>
        </div>
        <div className="cost-panel__heading-actions">
          {data && (
            <span className="cost-panel__window">
              {formatTimestamp(data.from, DATE_ONLY)} &ndash; {formatTimestamp(data.to, DATE_ONLY)}
            </span>
          )}
          <button
            type="button"
            className={`admin-refresh-btn ${loading ? 'is-loading' : ''}`}
            onClick={load}
            disabled={loading}
            aria-label="Refresh costs"
          >
            <RefreshCw size={18} />
          </button>
        </div>
      </div>

      <form className="cost-panel__controls" onSubmit={applyRange}>
        <label className="cost-panel__field">
          <span>From</span>
          <input
            type="date"
            value={draftFrom}
            max={draftTo || undefined}
            onChange={(e) => setDraftFrom(e.target.value)}
          />
        </label>
        <label className="cost-panel__field">
          <span>To</span>
          <input
            type="date"
            value={draftTo}
            min={draftFrom || undefined}
            onChange={(e) => setDraftTo(e.target.value)}
          />
        </label>
        <button type="submit" className="cost-panel__btn cost-panel__btn--apply">
          Apply
        </button>
        {rangeApplied && (
          <button type="button" className="cost-panel__btn" onClick={clearRange}>
            Clear dates
          </button>
        )}
        <label className="cost-panel__field cost-panel__field--size">
          <span>Rows</span>
          <select value={size} onChange={changeSize} aria-label="Rows per page">
            {PAGE_SIZES.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
      </form>

      {loading && (
        <div className="cost-panel__loading" role="status" aria-label="Loading cost report">
          <div className="cost-panel__tiles">
            {Array.from({ length: 6 }).map((_, i) => (
              <div className="cost-panel__tile" key={i}>
                <Skeleton width="55%" height={11} />
                <Skeleton width="70%" height={24} style={{ marginTop: 12 }} />
                <Skeleton width="90%" height={10} style={{ marginTop: 10 }} />
              </div>
            ))}
          </div>
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} width="100%" height={40} rounded style={{ marginTop: 8 }} />
          ))}
        </div>
      )}

      {!loading && error && (
        <div className="cost-panel__state">
          <ErrorState
            title="Could not load the cost report"
            message={
              error instanceof ApiError ? error.message : 'Failed to connect to backend server.'
            }
            onRetry={load}
          />
        </div>
      )}

      {!loading && !error && data && (
        <>
          <SummaryTiles summary={data.summary} />

          {rows.length === 0 ? (
            <div className="cost-panel__empty">
              <h3>No assessments in this window</h3>
              <p>
                {rangeApplied
                  ? 'Widen the date range to see priced assessments.'
                  : 'Costs will appear here once assessments are run.'}
              </p>
            </div>
          ) : (
            <>
              <div className="cost-panel__table-scroll">
                <table className="cost-panel__table">
                  <caption className="cost-panel__caption">
                    Per-assessment AI cost for the selected window
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col">Assessment</th>
                      <th scope="col">Created</th>
                      <th scope="col">Model</th>
                      <th scope="col">AI risk</th>
                      <th scope="col" className="cost-panel__cell--num">Tokens in</th>
                      <th scope="col" className="cost-panel__cell--num">Tokens out</th>
                      <th scope="col" className="cost-panel__cell--num">Cost</th>
                      <th scope="col" className="cost-panel__cell--num">Calls</th>
                      <th scope="col" className="cost-panel__cell--num">Latency</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <CostRow key={row.assessmentId} row={row} />
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="cost-panel__pagination">
                <span className="cost-panel__range" role="status">
                  Showing {COUNT.format(firstRow)}&ndash;{COUNT.format(lastRow)} of{' '}
                  {COUNT.format(totalRows)}
                </span>
                <div className="cost-panel__pager">
                  <button
                    type="button"
                    className="cost-panel__btn"
                    onClick={() => setPage(Math.max(0, effectivePage - 1))}
                    disabled={effectivePage <= 0}
                    aria-label="Previous page"
                  >
                    <ChevronLeft size={16} />
                    Previous
                  </button>
                  <span className="cost-panel__page-label">
                    Page {COUNT.format(effectivePage + 1)} of {COUNT.format(Math.max(1, totalPages))}
                  </span>
                  <button
                    type="button"
                    className="cost-panel__btn"
                    onClick={() => setPage(effectivePage + 1)}
                    disabled={effectivePage + 1 >= totalPages}
                    aria-label="Next page"
                  >
                    Next
                    <ChevronRight size={16} />
                  </button>
                </div>
              </div>
            </>
          )}
        </>
      )}
    </section>
  );
}
