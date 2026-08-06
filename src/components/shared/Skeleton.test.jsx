import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import Skeleton, { CaseSkeleton, QueueSkeleton, QuestionnaireSkeleton } from './Skeleton';
import PageTransition from './PageTransition';

describe('Skeleton', () => {
  it('defaults to a full-width 16px text line', () => {
    const { container } = render(<Skeleton />);

    expect(container.firstChild).toHaveStyle({ width: '100%', height: '16px' });
  });

  it('is hidden from assistive tech — the surrounding container does the announcing', () => {
    const { container } = render(<Skeleton />);

    expect(container.firstChild).toHaveAttribute('aria-hidden', 'true');
  });

  it('converts numeric dimensions to pixels and passes strings through', () => {
    const { container } = render(<Skeleton width={120} height="2rem" />);

    expect(container.firstChild).toHaveStyle({ width: '120px', height: '2rem' });
  });

  it('applies the rounded modifier', () => {
    const { container } = render(<Skeleton rounded />);

    expect(container.firstChild).toHaveClass('skeleton--rounded');
  });

  it('makes a square avatar from `size` when circle is set', () => {
    const { container } = render(<Skeleton circle size={40} />);

    expect(container.firstChild).toHaveClass('skeleton--circle');
    expect(container.firstChild).toHaveStyle({ width: '40px', height: '40px' });
  });

  it('falls back to height for a circle with no explicit size', () => {
    const { container } = render(<Skeleton circle height={24} />);

    expect(container.firstChild).toHaveStyle({ width: '24px', height: '24px' });
  });

  it('merges an extra className and inline style overrides', () => {
    const { container } = render(<Skeleton className="mt-2" style={{ marginTop: '8px' }} />);

    expect(container.firstChild).toHaveClass('mt-2');
    expect(container.firstChild).toHaveStyle({ marginTop: '8px' });
  });
});

describe('QueueSkeleton', () => {
  it('announces what is loading', () => {
    render(<QueueSkeleton />);

    expect(screen.getByRole('status', { name: 'Loading screening cases' })).toBeInTheDocument();
  });

  it('mimics five rows by default', () => {
    const { container } = render(<QueueSkeleton />);

    expect(container.querySelectorAll('.skeleton-queue__row')).toHaveLength(5);
  });

  it('honours a custom row count', () => {
    const { container } = render(<QueueSkeleton rows={2} />);

    expect(container.querySelectorAll('.skeleton-queue__row')).toHaveLength(2);
  });
});

describe('CaseSkeleton', () => {
  it('announces what is loading and lays out the case sections', () => {
    const { container } = render(<CaseSkeleton />);

    expect(screen.getByRole('status', { name: 'Loading case details' })).toBeInTheDocument();
    expect(container.querySelectorAll('.skeleton-case__section')).toHaveLength(3);
    expect(container.querySelector('.skeleton-case__photos')).toBeInTheDocument();
  });
});

describe('QuestionnaireSkeleton', () => {
  it('announces what is loading and mimics the six toggle rows', () => {
    const { container } = render(<QuestionnaireSkeleton />);

    expect(screen.getByRole('status', { name: 'Loading your answers' })).toBeInTheDocument();
    expect(container.querySelectorAll('.skeleton-questionnaire__toggle-row')).toHaveLength(6);
  });
});

describe('PageTransition', () => {
  it('renders its children inside the transition wrapper', () => {
    const { container } = render(
      <PageTransition>
        <p>Screen body</p>
      </PageTransition>
    );

    expect(screen.getByText('Screen body')).toBeInTheDocument();
    expect(container.querySelector('.page-transition')).toBeInTheDocument();
  });
});
