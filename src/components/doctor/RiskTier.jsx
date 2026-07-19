import './RiskTier.css';

const LABELS = {
  NO_MILD_RISK: 'No / mild',
  MODERATE_RISK: 'Moderate',
  HIGH_RISK: 'High',
};

export default function RiskTier({ classification }) {
  const label = LABELS[classification] || 'Not assessed';
  const modifier = classification?.toLowerCase() || 'unknown';

  return (
    <span className={`risk-tier risk-tier--${modifier}`}>
      <span aria-hidden="true" />
      {label}
    </span>
  );
}
