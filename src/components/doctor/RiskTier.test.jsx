import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import RiskTier from './RiskTier';

describe('RiskTier', () => {
  it.each([
    ['NO_MILD_RISK', 'No / mild', 'risk-tier--no_mild_risk'],
    ['MODERATE_RISK', 'Moderate', 'risk-tier--moderate_risk'],
    ['HIGH_RISK', 'High', 'risk-tier--high_risk'],
  ])('renders %s as "%s"', (classification, label, modifier) => {
    const { container } = render(<RiskTier classification={classification} />);

    expect(screen.getByText(label)).toBeInTheDocument();
    expect(container.firstChild).toHaveClass(modifier);
  });

  it('shows "Not assessed" for a missing classification', () => {
    const { container } = render(<RiskTier />);

    expect(screen.getByText('Not assessed')).toBeInTheDocument();
    expect(container.firstChild).toHaveClass('risk-tier--unknown');
  });

  it('shows "Not assessed" for a classification the UI does not know', () => {
    const { container } = render(<RiskTier classification="PENDING_REVIEW" />);

    expect(screen.getByText('Not assessed')).toBeInTheDocument();
    // The modifier still tracks the raw value, so unknown states are visible in the DOM.
    expect(container.firstChild).toHaveClass('risk-tier--pending_review');
  });
});
