import './ErrorState.css';

/**
 * The backend has no global exception handler yet (see 05_OPEN_DECISIONS_AND_ROADMAP.md,
 * item #6), so a bad id can surface as a raw 500 with a stack trace instead of
 * a clean 404. This component never shows that raw response to a patient —
 * it always shows plain, calm language and a retry action.
 */
export default function ErrorState({
  title = "Something didn't go through",
  message = "We couldn't complete that. Please check your connection and try again.",
  onRetry,
  retryLabel = 'Try again',
}) {
  return (
    <div className="error-state" role="alert">
      <div className="error-state__icon" aria-hidden="true">!</div>
      <h3>{title}</h3>
      <p>{message}</p>
      {onRetry && (
        <button type="button" className="btn btn-secondary" onClick={onRetry}>
          {retryLabel}
        </button>
      )}
    </div>
  );
}
