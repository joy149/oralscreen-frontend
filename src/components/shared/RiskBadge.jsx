import { ShieldCheck, AlertTriangle, AlertOctagon } from 'lucide-react';
import HomeCareRecommendations from './HomeCareRecommendations';
import './RiskBadge.css';

const TIERS = [
  {
    key: 'NO_MILD_RISK',
    label: 'No / mild risk',
    guidance: 'Follow the oral hygiene advice below and check back if anything changes.',
    icon: ShieldCheck,
  },
  {
    key: 'MODERATE_RISK',
    label: 'Moderate risk',
    guidance: 'This needs a doctor to take a look. Please book an appointment.',
    icon: AlertTriangle,
  },
  {
    key: 'HIGH_RISK',
    label: 'High risk',
    guidance: 'This needs urgent attention. Please book an appointment as soon as possible.',
    icon: AlertOctagon,
  },
];

/**
 * Risk is a real ordinal scale (mild -> moderate -> high), so it's shown as
 * a position on a three-zone gauge with visual icon chips for accessible interpretation.
 */
export default function RiskBadge({ classification, recommendations, size = 'large' }) {
  const activeIndex = TIERS.findIndex((t) => t.key === classification);
  const tier = TIERS[activeIndex] ?? null;
  const ActiveIcon = tier?.icon;

  return (
    <div className={`risk-gauge risk-gauge--${size}`}>
      <div className="risk-gauge__track" role="img" aria-label={`Risk gauge: ${tier?.label || 'Unknown risk'}`}>
        {TIERS.map((t, i) => (
          <div
            key={t.key}
            className={`risk-gauge__zone risk-gauge__zone--${t.key.toLowerCase()} ${
              i === activeIndex ? 'is-active' : ''
            }`}
          />
        ))}
        {activeIndex >= 0 && (
          <div
            className="risk-gauge__marker"
            style={{ left: `${(activeIndex + 0.5) * (100 / TIERS.length)}%` }}
            aria-hidden="true"
          />
        )}
      </div>
      <div className="risk-gauge__labels">
        {TIERS.map((t) => (
          <span key={t.key} className={t.key === classification ? 'is-active' : ''}>
            {t.label}
          </span>
        ))}
      </div>
      {tier && (
        <div className={`risk-gauge__result risk-gauge__result--${tier.key.toLowerCase()}`}>
          <div className="risk-gauge__title-row">
            {ActiveIcon && <ActiveIcon className="risk-gauge__icon" size={24} aria-hidden="true" />}
            <h2>{tier.label}</h2>
          </div>
          <p>{tier.guidance}</p>
        </div>
      )}
      {size === 'large' && <HomeCareRecommendations recommendations={recommendations} />}
    </div>
  );
}
