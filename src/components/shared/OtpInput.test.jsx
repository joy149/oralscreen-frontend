import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import OtpInput from './OtpInput';

function boxes() {
  return screen.getAllByRole('textbox');
}

describe('OtpInput rendering', () => {
  it('renders six labelled boxes by default', () => {
    render(<OtpInput />);

    expect(boxes()).toHaveLength(6);
    expect(screen.getByLabelText('Digit 1 of 6')).toBeInTheDocument();
    expect(screen.getByLabelText('Digit 6 of 6')).toBeInTheDocument();
  });

  it('honours a custom length', () => {
    render(<OtpInput length={4} />);

    expect(boxes()).toHaveLength(4);
    expect(screen.getByLabelText('Digit 4 of 4')).toBeInTheDocument();
  });

  it('focuses the first box on mount so the patient can type straight away', () => {
    render(<OtpInput />);

    expect(boxes()[0]).toHaveFocus();
  });

  it('uses a numeric keypad on mobile', () => {
    render(<OtpInput />);

    expect(boxes()[0]).toHaveAttribute('inputMode', 'numeric');
  });

  it('disables every box while a code is being verified', () => {
    render(<OtpInput submitting />);

    boxes().forEach((box) => expect(box).toBeDisabled());
  });
});

describe('typing a code', () => {
  it('accepts a digit and advances focus', async () => {
    const user = userEvent.setup();
    render(<OtpInput />);

    await user.type(boxes()[0], '1');

    expect(boxes()[0]).toHaveValue('1');
    expect(boxes()[1]).toHaveFocus();
  });

  it('rejects non-digits', async () => {
    const user = userEvent.setup();
    render(<OtpInput />);

    await user.type(boxes()[0], 'a');

    expect(boxes()[0]).toHaveValue('');
  });

  /**
   * Android delivers an SMS autofill as one change event carrying the whole code on the
   * focused box, not as a paste. Keeping only the last character silently dropped five of
   * six digits, so autofill looked broken and the patient retyped the code by hand.
   */
  it('spreads a multi-digit change across the boxes — the Android autofill path', () => {
    const onComplete = vi.fn();
    render(<OtpInput onComplete={onComplete} />);

    fireEvent.change(boxes()[0], { target: { value: '123456' } });

    expect(boxes().map((b) => b.value)).toEqual(['1', '2', '3', '4', '5', '6']);
    expect(onComplete).toHaveBeenCalledWith('123456');
  });

  it('does not truncate autofill at one character', () => {
    render(<OtpInput />);

    // maxLength has to admit the whole code or the browser clips it before React sees it.
    expect(boxes()[0]).toHaveAttribute('maxLength', '6');
  });

  it('stops at the last box when the change carries more digits than fit', () => {
    const onComplete = vi.fn();
    render(<OtpInput length={4} onComplete={onComplete} />);

    fireEvent.change(boxes()[0], { target: { value: '123456' } });

    expect(boxes().map((b) => b.value)).toEqual(['1', '2', '3', '4']);
    expect(onComplete).toHaveBeenCalledWith('1234');
  });

  it('overwrites rather than shifting when typing into a box that already holds a digit', () => {
    render(<OtpInput length={2} />);

    fireEvent.change(boxes()[0], { target: { value: '1' } });
    // What the browser reports when a character is typed after the existing one.
    fireEvent.change(boxes()[0], { target: { value: '19' } });

    expect(boxes()[0]).toHaveValue('9');
    expect(boxes()[1]).toHaveValue('');
  });

  it('offers the code to iOS autofill from the first box only', () => {
    render(<OtpInput />);

    expect(boxes()[0]).toHaveAttribute('autocomplete', 'one-time-code');
    expect(boxes()[1]).toHaveAttribute('autocomplete', 'off');
  });

  it('clears a box when its content is deleted', () => {
    render(<OtpInput length={2} />);

    fireEvent.change(boxes()[0], { target: { value: '1' } });
    fireEvent.change(boxes()[0], { target: { value: '' } });

    expect(boxes()[0]).toHaveValue('');
  });

  it('marks a filled box so it can be styled', async () => {
    const user = userEvent.setup();
    render(<OtpInput />);

    await user.type(boxes()[0], '7');

    expect(boxes()[0]).toHaveClass('is-filled');
    expect(boxes()[1]).not.toHaveClass('is-filled');
  });

  it('fires onComplete once every box is filled', async () => {
    const user = userEvent.setup();
    const onComplete = vi.fn();
    render(<OtpInput length={4} onComplete={onComplete} />);

    await user.type(boxes()[0], '1');
    await user.type(boxes()[1], '2');
    await user.type(boxes()[2], '3');
    expect(onComplete).not.toHaveBeenCalled();

    await user.type(boxes()[3], '4');
    expect(onComplete).toHaveBeenCalledWith('1234');
  });

  it('does not advance past the last box', async () => {
    const user = userEvent.setup();
    render(<OtpInput length={2} />);

    await user.type(boxes()[1], '9');

    expect(boxes()[1]).toHaveFocus();
  });

  it('does not throw when no onComplete handler is supplied', async () => {
    const user = userEvent.setup();
    render(<OtpInput length={1} />);

    await expect(user.type(boxes()[0], '5')).resolves.toBeUndefined();
  });
});

describe('re-submitting', () => {
  it('does not fire onComplete again when a filled code is edited', () => {
    const onComplete = vi.fn();
    render(<OtpInput length={2} onComplete={onComplete} />);

    fireEvent.change(boxes()[0], { target: { value: '12' } });
    expect(onComplete).toHaveBeenCalledTimes(1);

    // Correcting a digit while all boxes are full used to re-submit on every keystroke.
    fireEvent.change(boxes()[1], { target: { value: '2' } });
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('fires again once the code actually changes', () => {
    const onComplete = vi.fn();
    render(<OtpInput length={2} onComplete={onComplete} />);

    fireEvent.change(boxes()[0], { target: { value: '12' } });
    fireEvent.change(boxes()[1], { target: { value: '3' } });

    expect(onComplete).toHaveBeenNthCalledWith(1, '12');
    expect(onComplete).toHaveBeenNthCalledWith(2, '13');
  });
});

describe('reacting to a rejected code', () => {
  it('clears the boxes and returns focus when resetSignal changes', () => {
    const { rerender } = render(<OtpInput length={2} resetSignal={0} />);
    fireEvent.change(boxes()[0], { target: { value: '12' } });

    rerender(<OtpInput length={2} resetSignal={1} />);

    expect(boxes().map((b) => b.value)).toEqual(['', '']);
    expect(boxes()[0]).toHaveFocus();
  });

  it('lets the same code be submitted again after a reset', () => {
    const onComplete = vi.fn();
    const { rerender } = render(<OtpInput length={2} onComplete={onComplete} resetSignal={0} />);
    fireEvent.change(boxes()[0], { target: { value: '12' } });

    rerender(<OtpInput length={2} onComplete={onComplete} resetSignal={1} />);
    fireEvent.change(boxes()[0], { target: { value: '12' } });

    expect(onComplete).toHaveBeenCalledTimes(2);
  });
});

describe('progress feedback', () => {
  it('says nothing while the patient is typing', () => {
    render(<OtpInput />);

    expect(screen.getByRole('status')).toHaveTextContent('');
  });

  it('reports a code being checked, rather than just greying the boxes out', () => {
    render(<OtpInput submitting />);

    expect(screen.getByRole('status')).toHaveTextContent('Verifying…');
  });

  it('closes the boxes when no code is outstanding, but leaves resend open', () => {
    // A failed send leaves nothing to type; resending is the way out, so it must stay live.
    render(<OtpInput disabled resendCooldown={0} />);

    boxes().forEach((box) => expect(box).toBeDisabled());
    expect(screen.getByRole('button', { name: 'Resend OTP Code' })).toBeEnabled();
  });
});

describe('backspace', () => {
  it('steps back to the previous box when the current one is empty', async () => {
    const user = userEvent.setup();
    render(<OtpInput />);

    boxes()[2].focus();
    await user.keyboard('{Backspace}');

    expect(boxes()[1]).toHaveFocus();
  });

  it('stays put when the current box still holds a digit', async () => {
    const user = userEvent.setup();
    render(<OtpInput />);

    await user.type(boxes()[0], '1');
    boxes()[0].focus();
    await user.keyboard('{Backspace}');

    expect(boxes()[0]).toHaveFocus();
  });

  it('stays put on the first box', async () => {
    const user = userEvent.setup();
    render(<OtpInput />);

    boxes()[0].focus();
    await user.keyboard('{Backspace}');

    expect(boxes()[0]).toHaveFocus();
  });

  it('deletes the previous digit as it steps back — one press per digit, not two', async () => {
    const user = userEvent.setup();
    render(<OtpInput length={2} />);

    fireEvent.change(boxes()[0], { target: { value: '1' } });
    expect(boxes()[1]).toHaveFocus();

    await user.keyboard('{Backspace}');

    expect(boxes()[0]).toHaveValue('');
    expect(boxes()[0]).toHaveFocus();
  });
});

describe('arrow keys', () => {
  it('moves left and right between boxes', async () => {
    const user = userEvent.setup();
    render(<OtpInput />);

    boxes()[2].focus();
    await user.keyboard('{ArrowLeft}');
    expect(boxes()[1]).toHaveFocus();

    await user.keyboard('{ArrowRight}');
    expect(boxes()[2]).toHaveFocus();
  });

  it('does not run off either end', async () => {
    const user = userEvent.setup();
    render(<OtpInput length={2} />);

    boxes()[0].focus();
    await user.keyboard('{ArrowLeft}');
    expect(boxes()[0]).toHaveFocus();

    boxes()[1].focus();
    await user.keyboard('{ArrowRight}');
    expect(boxes()[1]).toHaveFocus();
  });
});

describe('pasting a code', () => {
  function paste(text) {
    fireEvent.paste(screen.getByLabelText('Digit 1 of 6').parentElement, {
      clipboardData: { getData: () => text },
    });
  }

  it('fills every box and submits — the SMS-autofill path', () => {
    const onComplete = vi.fn();
    render(<OtpInput onComplete={onComplete} />);

    paste('123456');

    expect(boxes().map((b) => b.value)).toEqual(['1', '2', '3', '4', '5', '6']);
    expect(onComplete).toHaveBeenCalledWith('123456');
  });

  it('strips surrounding text from a pasted SMS', () => {
    const onComplete = vi.fn();
    render(<OtpInput onComplete={onComplete} />);

    paste('Your code is 654321');

    expect(onComplete).toHaveBeenCalledWith('654321');
  });

  it('truncates a longer paste to the code length', () => {
    const onComplete = vi.fn();
    render(<OtpInput length={4} onComplete={onComplete} />);

    fireEvent.paste(screen.getByLabelText('Digit 1 of 4').parentElement, {
      clipboardData: { getData: () => '123456789' },
    });

    expect(onComplete).toHaveBeenCalledWith('1234');
  });

  it('fills what it can from a partial paste and parks focus after it', () => {
    const onComplete = vi.fn();
    render(<OtpInput onComplete={onComplete} />);

    paste('123');

    expect(boxes().map((b) => b.value)).toEqual(['1', '2', '3', '', '', '']);
    expect(boxes()[3]).toHaveFocus();
    expect(onComplete).not.toHaveBeenCalled();
  });

  it('ignores a paste with no digits at all', () => {
    const onComplete = vi.fn();
    render(<OtpInput onComplete={onComplete} />);

    paste('no digits here');

    expect(boxes().map((b) => b.value)).toEqual(['', '', '', '', '', '']);
    expect(onComplete).not.toHaveBeenCalled();
  });
});

describe('resend cooldown', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('counts down from the configured cooldown', () => {
    render(<OtpInput resendCooldown={3} />);

    expect(screen.getByText('3s')).toBeInTheDocument();

    act(() => vi.advanceTimersByTime(1000));
    expect(screen.getByText('2s')).toBeInTheDocument();
  });

  it('replaces the timer with a resend button when it reaches zero', () => {
    render(<OtpInput resendCooldown={2} />);

    expect(screen.queryByRole('button', { name: /resend/i })).not.toBeInTheDocument();

    act(() => vi.advanceTimersByTime(2000));

    expect(screen.getByRole('button', { name: 'Resend OTP Code' })).toBeInTheDocument();
  });

  it('clears the entered digits, restarts the cooldown and calls onResend', async () => {
    const onResend = vi.fn();
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<OtpInput resendCooldown={2} onResend={onResend} />);

    await user.type(boxes()[0], '9');
    act(() => vi.advanceTimersByTime(2000));

    await user.click(screen.getByRole('button', { name: 'Resend OTP Code' }));

    expect(onResend).toHaveBeenCalledTimes(1);
    expect(boxes()[0]).toHaveValue('');
    expect(boxes()[0]).toHaveFocus();
    expect(screen.getByText('2s')).toBeInTheDocument();
  });

  it('disables resend while a code is being verified', () => {
    render(<OtpInput resendCooldown={1} submitting />);

    act(() => vi.advanceTimersByTime(1000));

    expect(screen.getByRole('button', { name: 'Resend OTP Code' })).toBeDisabled();
  });

  it('runs no cooldown until a code has actually gone out', () => {
    // The parent shows this screen before the send resolves, so a cooldown anchored to mount
    // would start counting against a code that does not exist yet.
    render(<OtpInput resendCooldown={30} cooldownStartedAt={null} />);

    expect(screen.getByRole('button', { name: 'Resend OTP Code' })).toBeInTheDocument();
  });

  it('starts counting from the moment the code was sent', () => {
    const { rerender } = render(<OtpInput resendCooldown={3} cooldownStartedAt={null} />);

    rerender(<OtpInput resendCooldown={3} cooldownStartedAt={Date.now()} />);

    expect(screen.getByText('3s')).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(1000));
    expect(screen.getByText('2s')).toBeInTheDocument();
  });

  it('reports the remaining time from the clock, not from ticks it may have missed', () => {
    // Mobile browsers throttle intervals in a backgrounded tab. Counting ticks left the
    // number frozen where it was when the patient switched to their SMS app.
    render(<OtpInput resendCooldown={30} />);

    act(() => vi.advanceTimersByTime(10000));

    expect(screen.getByText('20s')).toBeInTheDocument();
  });
});
