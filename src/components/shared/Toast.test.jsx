import { act, render, renderHook, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider, useToast } from './Toast';

const wrapper = ({ children }) => <ToastProvider>{children}</ToastProvider>;

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useToast outside a provider', () => {
  it('throws instead of silently doing nothing', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(() => renderHook(() => useToast())).toThrow(
      'useToast must be used within a <ToastProvider>'
    );
  });
});

describe('showing toasts', () => {
  it.each([
    ['success', 'Review saved', '✓'],
    ['error', 'Upload failed', '!'],
    ['info', 'Session expires soon', 'i'],
  ])('renders a %s toast with its message and icon', (variant, message, icon) => {
    const { result } = renderHook(() => useToast(), { wrapper });

    act(() => result.current[variant](message));

    const toast = screen.getByRole('status');
    expect(toast).toHaveTextContent(message);
    expect(toast).toHaveClass(`toast--${variant}`);
    expect(toast).toHaveTextContent(icon);
  });

  it('announces toasts politely to assistive tech', () => {
    const { result } = renderHook(() => useToast(), { wrapper });

    act(() => result.current.info('Heads up'));

    expect(screen.getByRole('status').closest('.toast-container')).toHaveAttribute(
      'aria-live',
      'polite'
    );
  });

  it('stacks several toasts at once', () => {
    const { result } = renderHook(() => useToast(), { wrapper });

    act(() => {
      result.current.success('One');
      result.current.error('Two');
    });

    expect(screen.getAllByRole('status')).toHaveLength(2);
  });

  it('returns an id so a caller can dismiss its own toast', () => {
    const { result } = renderHook(() => useToast(), { wrapper });
    let id;

    act(() => { id = result.current.info('Working…'); });
    expect(screen.getByRole('status')).toBeInTheDocument();

    act(() => result.current.dismiss(id));
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});

describe('auto-dismiss', () => {
  it('clears an info toast after the 4s default', () => {
    const { result } = renderHook(() => useToast(), { wrapper });

    act(() => result.current.info('Heads up'));
    act(() => vi.advanceTimersByTime(3999));
    expect(screen.getByRole('status')).toBeInTheDocument();

    act(() => vi.advanceTimersByTime(1));
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('keeps an error toast up for 6s — errors need longer to read', () => {
    const { result } = renderHook(() => useToast(), { wrapper });

    act(() => result.current.error('Upload failed'));
    act(() => vi.advanceTimersByTime(4000));
    expect(screen.getByRole('status')).toBeInTheDocument();

    act(() => vi.advanceTimersByTime(2000));
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('honours an explicit duration', () => {
    const { result } = renderHook(() => useToast(), { wrapper });

    act(() => result.current.success('Saved', 1000));
    act(() => vi.advanceTimersByTime(1000));

    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('honours an explicit duration on an error too', () => {
    const { result } = renderHook(() => useToast(), { wrapper });

    act(() => result.current.error('Nope', 500));
    act(() => vi.advanceTimersByTime(500));

    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});

describe('manual dismissal', () => {
  it('removes the toast when its close button is pressed', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const { result } = renderHook(() => useToast(), { wrapper });

    act(() => result.current.success('Saved'));
    await user.click(screen.getByRole('button', { name: 'Dismiss' }));

    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('removes only the toast that was dismissed', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const { result } = renderHook(() => useToast(), { wrapper });

    act(() => {
      result.current.success('Keep me');
      result.current.error('Dismiss me');
    });

    const dismissButtons = screen.getAllByRole('button', { name: 'Dismiss' });
    await user.click(dismissButtons[1]);

    const remaining = screen.getAllByRole('status');
    expect(remaining).toHaveLength(1);
    expect(remaining[0]).toHaveTextContent('Keep me');
  });

  it('is a no-op when dismissing an id that is already gone', () => {
    const { result } = renderHook(() => useToast(), { wrapper });

    expect(() => act(() => result.current.dismiss(9999))).not.toThrow();
  });
});

describe('the toast api object', () => {
  it('keeps a stable identity so it is safe in a dependency array', () => {
    const { result, rerender } = renderHook(() => useToast(), { wrapper });
    const first = result.current;

    act(() => result.current.info('anything'));
    rerender();

    expect(result.current).toBe(first);
  });

  it('renders children alongside the toast layer', () => {
    render(
      <ToastProvider>
        <p>App content</p>
      </ToastProvider>
    );

    expect(screen.getByText('App content')).toBeInTheDocument();
  });
});
