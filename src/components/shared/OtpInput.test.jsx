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

  it('keeps only the last digit when a box already holds one', () => {
    render(<OtpInput length={2} />);

    fireEvent.change(boxes()[0], { target: { value: '12' } });

    expect(boxes()[0]).toHaveValue('2');
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
});
