/**
 * Human-readable age of a timestamp — "Just now", "12m ago", "3d ago".
 *
 * <p>Past a week the relative form stops helping: "38d ago" is harder to place than a
 * date, so it falls back to an absolute en-IN one.
 *
 * <p>Shared by the past-assessments list and the home screen's recent rows. It lived in
 * `PastAssessments` until the home screen needed the same rows; copying it would have let
 * one assessment read as two different ages depending on which screen you came from.
 */
export default function relativeTime(value) {
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return 'Unknown date';
  const seconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if (seconds < 60) return 'Just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
  return new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }).format(timestamp);
}
