import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import ErrorState from './ErrorState';
import LoadingState from './LoadingState';

describe('ErrorState', () => {
  it('shows calm default copy, never a raw server response', () => {
    render(<ErrorState />);

    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: "Something didn't go through" })).toBeInTheDocument();
    expect(
      screen.getByText("We couldn't complete that. Please check your connection and try again.")
    ).toBeInTheDocument();
  });

  it('accepts a custom title and message', () => {
    render(<ErrorState title="Assessments unavailable" message="We could not load your history." />);

    expect(screen.getByRole('heading', { name: 'Assessments unavailable' })).toBeInTheDocument();
    expect(screen.getByText('We could not load your history.')).toBeInTheDocument();
  });

  it('offers no retry button when there is nothing to retry', () => {
    render(<ErrorState />);

    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('renders a retry button when a handler is supplied and calls it', async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    render(<ErrorState onRetry={onRetry} />);

    await user.click(screen.getByRole('button', { name: 'Try again' }));

    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('accepts a custom retry label', () => {
    render(<ErrorState onRetry={() => {}} retryLabel="Reload results" />);

    expect(screen.getByRole('button', { name: 'Reload results' })).toBeInTheDocument();
  });

  it('is announced as an alert so screen readers interrupt', () => {
    render(<ErrorState />);

    expect(screen.getByRole('alert')).toHaveClass('error-state');
  });
});

describe('LoadingState', () => {
  it('announces a default loading message politely', () => {
    render(<LoadingState />);

    const status = screen.getByRole('status');
    expect(status).toHaveAttribute('aria-live', 'polite');
    expect(status).toHaveTextContent('Loading…');
  });

  it('accepts a custom message', () => {
    render(<LoadingState message="Checking your details…" />);

    expect(screen.getByRole('status')).toHaveTextContent('Checking your details…');
  });
});
