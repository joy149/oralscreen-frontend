/**
 * A response that isn't a bare array (e.g. wrapped in `{ content: [...] }`) shouldn't
 * crash a list — normalize defensively, mirroring DoctorQueue's queueItems().
 */
export function assessmentItems(payload) {
  if (Array.isArray(payload)) return payload;
  for (const key of ['content', 'assessments', 'data']) {
    if (Array.isArray(payload?.[key])) return payload[key];
  }
  return [];
}

/**
 * Newest first.
 *
 * <p>The endpoint's ordering isn't part of its contract, and the home screen makes a claim
 * the list view never did — that the top row is the *latest* screening, and that the
 * "awaiting review" card refers to the most recent unreviewed one. Sort rather than trust.
 * Undated records sink to the bottom instead of poisoning the comparison with NaN.
 */
export function byNewestFirst(items) {
  return items.slice().sort((a, b) => {
    const left = new Date(a?.createdAt).getTime();
    const right = new Date(b?.createdAt).getTime();
    if (!Number.isFinite(left) && !Number.isFinite(right)) return 0;
    if (!Number.isFinite(left)) return 1;
    if (!Number.isFinite(right)) return -1;
    return right - left;
  });
}
