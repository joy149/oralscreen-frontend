import './RiskBadge.css';

const TIERS = [
  {
    key: 'NO_MILD_RISK',
    label: 'No / mild risk',
    guidance: 'Follow the oral hygiene advice below and check back if anything changes.',
  },
  {
    key: 'MODERATE_RISK',
    label: 'Moderate risk',
    guidance: 'This needs a doctor to take a look. Please book an appointment.',
  },
  {
    key: 'HIGH_RISK',
    label: 'High risk',
    guidance: 'This needs urgent attention. Please book an appointment as soon as possible.',
  },
];

/**
 * Risk is a real ordinal scale (mild -> moderate -> high), so it's shown as
 * a position on a three-zone gauge rather than a single colored badge —
 * the position itself carries the clinical meaning.
 */
export default function RiskBadge({ classification, size = 'large' }) {
  const activeIndex = TIERS.findIndex((t) => t.key === classification);
  const tier = TIERS[activeIndex] ?? null;

  return (
    <div className={`risk-gauge risk-gauge--${size}`}>
      <div className="risk-gauge__track">
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
          <h2>{tier.label}</h2>
          <p>{tier.guidance}</p>
        </div>
      )}
    </div>
  );
}
