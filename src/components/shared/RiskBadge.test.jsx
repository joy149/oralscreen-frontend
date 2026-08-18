import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import RiskBadge from './RiskBadge';

describe('RiskBadge', () => {
  it.each([
    ['NO_MILD_RISK', 'No / mild risk', 1],
    ['MODERATE_RISK', 'Moderate risk', 2],
    ['HIGH_RISK', 'High risk', 3],
  ])('renders %s as the leading verdict and positions the gauge', (classification, label, position) => {
    render(<RiskBadge classification={classification} />);

    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(label);

    const meter = screen.getByRole('meter', { name: 'Risk level' });
    expect(meter).toHaveAttribute('aria-valuenow', String(position));
    expect(meter).toHaveAttribute('aria-valuemin', '1');
    expect(meter).toHaveAttribute('aria-valuemax', '3');
    expect(meter).toHaveAttribute('aria-valuetext', label);
  });

  it('gives each tier its own guidance', () => {
    const { rerender } = render(<RiskBadge classification="NO_MILD_RISK" />);
    expect(screen.getByText(/Nothing here needs urgent attention/)).toBeInTheDocument();

    rerender(<RiskBadge classification="MODERATE_RISK" />);
    expect(screen.getByText(/A dentist should examine this in person/)).toBeInTheDocument();

    rerender(<RiskBadge classification="HIGH_RISK" />);
    expect(screen.getByText(/needs to be seen urgently/)).toBeInTheDocument();
  });

  it('falls back to a calm "unavailable" card for an unrecognised classification', () => {
    render(<RiskBadge classification="SOMETHING_ELSE" />);

    expect(screen.getByRole('heading', { name: 'Result unavailable' })).toBeInTheDocument();
    expect(screen.getByText(/A dentist will still review it/)).toBeInTheDocument();
    expect(screen.queryByRole('meter')).not.toBeInTheDocument();
  });

  it('falls back the same way when no classification is supplied at all', () => {
    render(<RiskBadge />);

    expect(screen.getByRole('heading', { name: 'Result unavailable' })).toBeInTheDocument();
  });

  it('defaults to the large size and honours an override', () => {
    const { container, rerender } = render(<RiskBadge classification="HIGH_RISK" />);
    expect(container.querySelector('.risk-gauge--large')).toBeInTheDocument();

    rerender(<RiskBadge classification="HIGH_RISK" size="small" />);
    expect(container.querySelector('.risk-gauge--small')).toBeInTheDocument();
  });

  it('marks only the active zone and label', () => {
    const { container } = render(<RiskBadge classification="MODERATE_RISK" />);

    const activeZones = container.querySelectorAll('.risk-gauge__zone.is-active');
    expect(activeZones).toHaveLength(1);
    expect(activeZones[0]).toHaveClass('risk-gauge__zone--moderate_risk');

    const activeLabels = container.querySelectorAll('.risk-gauge__labels .is-active');
    expect(activeLabels).toHaveLength(1);
    expect(activeLabels[0]).toHaveTextContent('Moderate');
  });

  it('shows all three tiers on the scale so the ordinal scale is legible', () => {
    const { container } = render(<RiskBadge classification="NO_MILD_RISK" />);

    expect(container.querySelectorAll('.risk-gauge__zone')).toHaveLength(3);
    expect(container.querySelector('.risk-gauge__labels')).toHaveTextContent(
      'No / mildModerateHigh'
    );
  });
});
