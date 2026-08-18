import { ShieldCheck, AlertTriangle, AlertOctagon } from 'lucide-react';
import { motion } from 'motion/react';
import './RiskBadge.css';

const TIERS = [
  {
    key: 'NO_MILD_RISK',
    label: 'No / mild risk',
    short: 'No / mild',
    guidance: 'Nothing here needs urgent attention. Follow the home care advice below and check back if anything changes.',
    icon: ShieldCheck,
  },
  {
    key: 'MODERATE_RISK',
    label: 'Moderate risk',
    short: 'Moderate',
    guidance: 'A dentist should examine this in person. Book an appointment when you can.',
    icon: AlertTriangle,
  },
  {
    key: 'HIGH_RISK',
    label: 'High risk',
    short: 'High',
    guidance: 'This needs to be seen urgently. Please book an appointment as soon as possible.',
    icon: AlertOctagon,
  },
];

/**
 * Risk is a real ordinal scale (mild -> moderate -> high).
 *
 * The verdict leads and the gauge follows: this is the one thing the patient
 * opened the app to find out, so it must not sit below supporting material or
 * animate in after it. Only the gauge marker animates — sliding to its position
 * is what actually teaches the scale.
 */
export default function RiskBadge({ classification, size = 'large' }) {
  const activeIndex = TIERS.findIndex((t) => t.key === classification);
  const tier = TIERS[activeIndex] ?? null;
  const ActiveIcon = tier?.icon;

  if (!tier) {
    return (
      <div className="risk-gauge risk-gauge--unknown">
        <h2>Result unavailable</h2>
        <p>We couldn&apos;t read a risk level for this screening. A dentist will still review it.</p>
      </div>
    );
  }

  return (
    <div className={`risk-gauge risk-gauge--${size}`}>
      <div className={`risk-gauge__result risk-gauge__result--${tier.key.toLowerCase()}`}>
        <div className="risk-gauge__title-row">
          {ActiveIcon && <ActiveIcon className="risk-gauge__icon" size={28} aria-hidden="true" />}
          <h2>{tier.label}</h2>
        </div>
        <p>{tier.guidance}</p>
      </div>

      <div
        className="risk-gauge__scale"
        role="meter"
        aria-valuenow={activeIndex + 1}
        aria-valuemin={1}
        aria-valuemax={TIERS.length}
        aria-valuetext={tier.label}
        aria-label="Risk level"
      >
        <div className="risk-gauge__track" aria-hidden="true">
          {TIERS.map((t, i) => (
            <div
              key={t.key}
              className={`risk-gauge__zone risk-gauge__zone--${t.key.toLowerCase()} ${
                i === activeIndex ? 'is-active' : ''
              }`}
            />
          ))}
          <motion.div
            className="risk-gauge__marker"
            initial={{ left: '16.67%' }}
            animate={{ left: `${(activeIndex + 0.5) * (100 / TIERS.length)}%` }}
            transition={{ duration: 0.45, ease: [0.23, 1, 0.32, 1] }}
          />
        </div>
        <div className="risk-gauge__labels" aria-hidden="true">
          {TIERS.map((t) => (
            <span key={t.key} className={t.key === classification ? 'is-active' : ''}>
              {t.short}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
