import { useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, ShieldCheck, Lock, FileText, Sparkles, UserCheck } from 'lucide-react';
import './PrivacyPolicyModal.css';

export default function PrivacyPolicyModal({ isOpen, onClose, onAgree }) {
  const handleAgree = () => {
    if (onAgree) onAgree();
    onClose();
  };

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };

    if (isOpen) {
      document.body.style.overflow = 'hidden';
      window.addEventListener('keydown', handleKeyDown);
    }

    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="privacy-modal-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="privacy-modal-title">
          <motion.div
            className="privacy-modal-card"
            onClick={(e) => e.stopPropagation()}
            initial={{ opacity: 0, scale: 0.95, y: 15 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 15 }}
            transition={{ duration: 0.2 }}
          >
            <div className="privacy-modal__header">
              <div className="privacy-modal__header-title">
                <ShieldCheck className="privacy-modal__icon" aria-hidden="true" />
                <h2 id="privacy-modal-title">Privacy Policy & Terms of Service</h2>
              </div>
              <button
                type="button"
                className="privacy-modal__close"
                onClick={onClose}
                aria-label="Close Privacy Policy"
              >
                <X size={20} />
              </button>
            </div>

            <div className="privacy-modal__body">
              <div className="privacy-modal__intro">
                <p>
                  Your privacy and health data security are our highest priorities. Please read how OralScreen handles your information.
                </p>
              </div>

              <section className="privacy-modal__section">
                <h3>
                  <Lock size={16} aria-hidden="true" /> 1. Data Protection & Health Privacy
                </h3>
                <p>
                  All photos, symptom disclosures, and contact details captured during your screening are encrypted end-to-end both in transit and at rest, complying with standard healthcare privacy regulations.
                </p>
              </section>

              <section className="privacy-modal__section">
                <h3>
                  <FileText size={16} aria-hidden="true" /> 2. Screening & Clinical Review
                </h3>
                <p>
                  OralScreen provides automated preliminary triage assistance. However, all screenings are reviewed by licensed dental professionals. The results provided are for initial screening purposes and do not replace an in-person clinical exam.
                </p>
              </section>

              <section className="privacy-modal__section">
                <h3>
                  <Sparkles size={16} aria-hidden="true" /> 3. AI Evaluation & De-identified Data Usage
                </h3>
                <p>
                  By accepting this, you consent to your images/information being analyzed by AI software for detailed image screening and preliminary examination.
                </p>
              </section>

              <section className="privacy-modal__section">
                <h3>
                  <UserCheck size={16} aria-hidden="true" /> 4. Data Retention & Patient Rights
                </h3>
                <p>
                  Your screening records are retained securely to enable follow-up care and longitudinal tracking. You have the right to request a copy of your records or demand deletion at any time by contacting our support team.
                </p>
              </section>
            </div>

            <div className="privacy-modal__footer">
              <button type="button" className="btn btn-primary" onClick={handleAgree}>
                I Understand & Agree
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
