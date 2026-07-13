import './LoadingState.css';

export default function LoadingState({ message = 'Loading…' }) {
  return (
    <div className="loading-state" role="status" aria-live="polite">
      <div className="loading-state__spinner" aria-hidden="true" />
      <p>{message}</p>
    </div>
  );
}
