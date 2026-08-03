import { useState, useRef, useEffect } from 'react';
import './OtpInput.css';

export default function OtpInput({
  length = 6,
  onComplete,
  submitting = false,
  onResend,
  resendCooldown = 60,
}) {
  const [otp, setOtp] = useState(Array(length).fill(''));
  const [timer, setTimer] = useState(resendCooldown);
  const inputsRef = useRef([]);

  useEffect(() => {
    // Focus first input box on mount
    if (inputsRef.current[0]) {
      inputsRef.current[0].focus();
    }
  }, []);

  useEffect(() => {
    let interval = null;
    if (timer > 0) {
      interval = setInterval(() => {
        setTimer((prev) => prev - 1);
      }, 1000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [timer]);

  const handleChange = (index, value) => {
    const digit = value.replace(/\D/g, '').slice(-1);
    const newOtp = [...otp];
    newOtp[index] = digit;
    setOtp(newOtp);

    // Auto advance to next input box
    if (digit && index < length - 1) {
      inputsRef.current[index + 1]?.focus();
    }

    // Trigger onComplete when all digits filled
    const fullCode = newOtp.join('');
    if (fullCode.length === length && onComplete) {
      onComplete(fullCode);
    }
  };

  const handleKeyDown = (index, e) => {
    if (e.key === 'Backspace') {
      if (!otp[index] && index > 0) {
        inputsRef.current[index - 1]?.focus();
      }
    }
  };

  const handlePaste = (e) => {
    e.preventDefault();
    const pastedData = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, length);
    if (!pastedData) return;

    const newOtp = Array(length).fill('');
    for (let i = 0; i < pastedData.length; i++) {
      newOtp[i] = pastedData[i];
    }
    setOtp(newOtp);

    const targetFocusIndex = Math.min(pastedData.length, length - 1);
    inputsRef.current[targetFocusIndex]?.focus();

    const fullCode = newOtp.join('');
    if (fullCode.length === length && onComplete) {
      onComplete(fullCode);
    }
  };

  const handleResendClick = () => {
    if (timer > 0) return;
    setTimer(resendCooldown);
    setOtp(Array(length).fill(''));
    if (inputsRef.current[0]) inputsRef.current[0].focus();
    if (onResend) onResend();
  };

  return (
    <div className="otp-container">
      <div className="otp-boxes" onPaste={handlePaste}>
        {otp.map((digit, index) => (
          <input
            key={index}
            ref={(el) => (inputsRef.current[index] = el)}
            type="text"
            inputMode="numeric"
            maxLength={1}
            value={digit}
            onChange={(e) => handleChange(index, e.target.value)}
            onKeyDown={(e) => handleKeyDown(index, e)}
            className={`otp-box ${digit ? 'is-filled' : ''}`}
            disabled={submitting}
            aria-label={`Digit ${index + 1} of ${length}`}
          />
        ))}
      </div>

      <div className="otp-resend">
        {timer > 0 ? (
          <span className="otp-resend__timer">
            Resend code in <strong>{timer}s</strong>
          </span>
        ) : (
          <button
            type="button"
            className="otp-resend__btn"
            onClick={handleResendClick}
            disabled={submitting}
          >
            Resend OTP Code
          </button>
        )}
      </div>
    </div>
  );
}
