import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import PrivacyPolicyModal from './PrivacyPolicyModal';

function setup(props = {}) {
  const onClose = vi.fn();
  const onAgree = vi.fn();
  const utils = render(
    <PrivacyPolicyModal isOpen onClose={onClose} onAgree={onAgree} {...props} />
  );
  return { onClose, onAgree, ...utils };
}

describe('visibility', () => {
  it('renders nothing when closed', () => {
    const { container } = render(<PrivacyPolicyModal isOpen={false} onClose={vi.fn()} />);

    expect(container).toBeEmptyDOMElement();
  });

  it('renders a labelled modal dialog when open', () => {
    setup();

    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(
      screen.getByRole('heading', { name: 'Privacy Policy & Terms of Service' })
    ).toBeInTheDocument();
  });

  it('covers the four consent topics a patient is agreeing to', () => {
    setup();

    expect(screen.getByRole('heading', { name: /Data Protection & Health Privacy/ })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Screening & Clinical Review/ })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /AI Evaluation/ })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Data Retention & Patient Rights/ })).toBeInTheDocument();
  });
});

describe('body scroll lock', () => {
  it('locks scrolling while open', () => {
    setup();

    expect(document.body.style.overflow).toBe('hidden');
  });

  it('releases the lock on unmount', () => {
    const { unmount } = setup();
    unmount();

    expect(document.body.style.overflow).toBe('');
  });

  it('never locks scrolling when it was not opened', () => {
    render(<PrivacyPolicyModal isOpen={false} onClose={vi.fn()} />);

    expect(document.body.style.overflow).toBe('');
  });
});

describe('dismissal', () => {
  it('closes on the X button', async () => {
    const user = userEvent.setup();
    const { onClose } = setup();

    await user.click(screen.getByRole('button', { name: 'Close Privacy Policy' }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes when the overlay behind the card is clicked', async () => {
    const user = userEvent.setup();
    const { onClose } = setup();

    await user.click(screen.getByRole('dialog'));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does not close when the card itself is clicked', async () => {
    const user = userEvent.setup();
    const { onClose } = setup();

    await user.click(screen.getByRole('heading', { name: /Data Protection/ }));

    expect(onClose).not.toHaveBeenCalled();
  });

  it('closes on Escape', async () => {
    const user = userEvent.setup();
    const { onClose } = setup();

    await user.keyboard('{Escape}');

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('stops listening for Escape once unmounted', async () => {
    const user = userEvent.setup();
    const { onClose, unmount } = setup();
    unmount();

    await user.keyboard('{Escape}');

    expect(onClose).not.toHaveBeenCalled();
  });

  it('ignores other keys', async () => {
    const user = userEvent.setup();
    const { onClose } = setup();

    await user.keyboard('{Enter}');

    expect(onClose).not.toHaveBeenCalled();
  });
});

describe('agreeing', () => {
  it('records the consent and then closes', async () => {
    const user = userEvent.setup();
    const { onAgree, onClose } = setup();

    await user.click(screen.getByRole('button', { name: 'I Understand & Agree' }));

    expect(onAgree).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('still closes when no onAgree handler was supplied', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<PrivacyPolicyModal isOpen onClose={onClose} />);

    await user.click(screen.getByRole('button', { name: 'I Understand & Agree' }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
