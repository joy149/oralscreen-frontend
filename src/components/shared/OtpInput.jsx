import { useState, useRef, useEffect } from 'react';
import './OtpInput.css';

const emptyCode = (length) => Array(length).fill('');

export default function OtpInput({
  length = 6,
  onComplete,
  submitting = false,
  disabled = false,
  onResend,
  resendCooldown = 30,
  cooldownStartedAt,
  resetSignal = 0,
}) {
  const [otp, setOtp] = useState(() => emptyCode(length));
  const inputsRef = useRef([]);
  // `handleChange` submits whenever the boxes are full, which includes edits made *after*
  // they were already full — without this the same code re-submits on every keystroke.
  const lastSubmittedRef = useRef(null);

  // `busy` gates the resend button; `disabled` (no code is actually outstanding, e.g. the
  // send failed) must not, since resending is the way out of that state.
  //
  // Deliberately no "dispatching" state: the screen presents as ready the moment it opens,
  // so the wait reads as the SMS being delivered rather than as the app doing something.
  const busy = submitting;
  const entryDisabled = busy || disabled;

  const focusBox = (index) => inputsRef.current[index]?.focus();

  useEffect(() => {
    focusBox(0);
  }, []);

  // Bumped by the parent when a code is rejected. Clearing here rather than leaving the
  // wrong digits in place saves the patient six backspaces on the unhappy path.
  const [shake, setShake] = useState(false);
  useEffect(() => {
    if (!resetSignal) return undefined;
    setOtp(emptyCode(length));
    lastSubmittedRef.current = null;
    focusBox(0);
    setShake(true);
    const settle = setTimeout(() => setShake(false), 400);
    return () => clearTimeout(settle);
  }, [resetSignal, length]);

  // --- resend cooldown ------------------------------------------------------
  // Anchored to a timestamp rather than counted down tick by tick: mobile browsers throttle
  // intervals in a backgrounded tab, and reading the wall clock means the number is right
  // when the patient comes back from their SMS app instead of frozen where it was.
  // Controlled when the parent passes `cooldownStartedAt` — it knows when the code really
  // went out. Uncontrolled, the component runs its own from mount and from each resend.
  const cooldownControlled = cooldownStartedAt !== undefined;
  const [ownCooldownFrom, setOwnCooldownFrom] = useState(() => Date.now());
  const cooldownFrom = cooldownControlled ? cooldownStartedAt : ownCooldownFrom;
  const [secondsLeft, setSecondsLeft] = useState(() => (cooldownFrom == null ? 0 : resendCooldown));

  useEffect(() => {
    if (cooldownFrom == null) {
      setSecondsLeft(0);
      return undefined;
    }
    const deadline = cooldownFrom + resendCooldown * 1000;
    const tick = () => {
      const left = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      setSecondsLeft(left);
      return left;
    };
    if (tick() === 0) return undefined;

    const interval = setInterval(() => {
      if (tick() === 0) clearInterval(interval);
    }, 1000);
    return () => clearInterval(interval);
  }, [cooldownFrom, resendCooldown]);

  // --- entry ----------------------------------------------------------------
  function submitIfComplete(next) {
    const code = next.join('');
    if (code.length !== length) return;
    if (code === lastSubmittedRef.current) return;
    lastSubmittedRef.current = code;
    onComplete?.(code);
  }

  function applyDigits(startIndex, digits) {
    const next = [...otp];
    let cursor = startIndex;
    for (const digit of digits) {
      if (cursor >= length) break;
      next[cursor] = digit;
      cursor += 1;
    }
    setOtp(next);
    focusBox(Math.min(cursor, length - 1));
    submitIfComplete(next);
  }

  const handleChange = (index, value) => {
    const digits = value.replace(/\D/g, '');

    if (!digits) {
      const next = [...otp];
      next[index] = '';
      setOtp(next);
      lastSubmittedRef.current = null;
      return;
    }

    // Android delivers an SMS autofill as a single change event carrying the whole code on
    // the focused box — not as a paste. Keeping only the last character (what this did
    // before) threw away five of six digits and made autofill look broken.
    //
    // Typing into a box that already holds a digit also produces a multi-character value,
    // so the existing digit is stripped first: that is an overwrite, not a code drop.
    const previous = otp[index];
    const incoming =
      previous && digits.length > 1 && digits.startsWith(previous)
        ? digits.slice(previous.length)
        : digits;

    applyDigits(index, incoming);
  };

  const handleKeyDown = (index, e) => {
    if (e.key === 'Backspace') {
      lastSubmittedRef.current = null;
      // A box with a digit in it is cleared by the browser's own handling.
      if (otp[index] || index === 0) return;
      // Empty box: step back *and* delete, so one press removes one digit rather than
      // needing a second press to clear the box we just landed on.
      e.preventDefault();
      const next = [...otp];
      next[index - 1] = '';
      setOtp(next);
      focusBox(index - 1);
      return;
    }

    if (e.key === 'ArrowLeft' && index > 0) {
      e.preventDefault();
      focusBox(index - 1);
    } else if (e.key === 'ArrowRight' && index < length - 1) {
      e.preventDefault();
      focusBox(index + 1);
    }
  };

  const handlePaste = (e) => {
    e.preventDefault();
    const pastedData = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, length);
    if (!pastedData) return;

    const next = emptyCode(length);
    for (let i = 0; i < pastedData.length; i++) {
      next[i] = pastedData[i];
    }
    setOtp(next);
    focusBox(Math.min(pastedData.length, length - 1));
    submitIfComplete(next);
  };

  const handleResendClick = () => {
    if (secondsLeft > 0 || busy) return;
    setOtp(emptyCode(length));
    lastSubmittedRef.current = null;
    focusBox(0);
    if (!cooldownControlled) setOwnCooldownFrom(Date.now());
    onResend?.();
  };

  // Only the check the patient triggered themselves is narrated.
  const status = submitting ? 'Verifying…' : null;

  return (
    <div className="otp-container">
      <div className={`otp-boxes ${shake ? 'is-shaking' : ''}`} onPaste={handlePaste}>
        {otp.map((digit, index) => (
          <input
            key={index}
            ref={(el) => (inputsRef.current[index] = el)}
            type="text"
            inputMode="numeric"
            // iOS Safari offers the incoming code above the keyboard off the back of this.
            // It belongs on the first box only — otherwise the suggestion targets whichever
            // box has focus and lands the whole code in the wrong place.
            autoComplete={index === 0 ? 'one-time-code' : 'off'}
            // Deliberately `length`, not 1: autofill deposits the full code into a single
            // box, and a maxLength of 1 would truncate it before `handleChange` ever sees it.
            // The controlled value is always a single character, so nothing shows twice.
            maxLength={length}
            value={digit}
            onChange={(e) => handleChange(index, e.target.value)}
            onKeyDown={(e) => handleKeyDown(index, e)}
            onFocus={(e) => e.target.select()}
            className={`otp-box ${digit ? 'is-filled' : ''}`}
            disabled={entryDisabled}
            aria-label={`Digit ${index + 1} of ${length}`}
          />
        ))}
      </div>

      <div className="otp-status" role="status" aria-live="polite">
        {status && (
          <span className="otp-status__busy">
            <span className="otp-status__spinner" aria-hidden="true" />
            {status}
          </span>
        )}
      </div>

      <div className="otp-resend">
        {secondsLeft > 0 ? (
          <span className="otp-resend__timer">
            Resend code in <strong>{secondsLeft}s</strong>
          </span>
        ) : (
          <button
            type="button"
            className="otp-resend__btn"
            onClick={handleResendClick}
            disabled={busy}
          >
            Resend OTP Code
          </button>
        )}
      </div>
    </div>
  );
}
