import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import ChoiceGroup from './ChoiceGroup';

function setup(props = {}) {
  const onChange = vi.fn();
  const utils = render(
    <ChoiceGroup id="tobacco" label="Do you use tobacco?" value={null} onChange={onChange} {...props} />
  );
  return { onChange, ...utils };
}

describe('ChoiceGroup', () => {
  it('labels the group for screen readers', () => {
    setup();

    expect(screen.getByRole('group', { name: 'Do you use tobacco?' })).toBeInTheDocument();
  });

  it('renders an optional hint', () => {
    setup({ hint: 'Including chewing tobacco' });

    expect(screen.getByText('Including chewing tobacco')).toBeInTheDocument();
  });

  it('omits the hint element when none is given', () => {
    const { container } = setup();

    expect(container.querySelector('.choice-group__hint')).toBeNull();
  });

  it('leaves both options unpressed when unanswered — "no" and "not answered" are different', () => {
    setup({ value: null });

    expect(screen.getByRole('button', { name: 'No' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: 'Yes' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('marks Yes as pressed when the answer is true', () => {
    setup({ value: true });

    expect(screen.getByRole('button', { name: 'Yes' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'No' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('marks No as pressed when the answer is false', () => {
    setup({ value: false });

    expect(screen.getByRole('button', { name: 'No' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Yes' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('reports true when Yes is chosen', async () => {
    const user = userEvent.setup();
    const { onChange } = setup();

    await user.click(screen.getByRole('button', { name: 'Yes' }));

    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('reports false when No is chosen', async () => {
    const user = userEvent.setup();
    const { onChange } = setup();

    await user.click(screen.getByRole('button', { name: 'No' }));

    expect(onChange).toHaveBeenCalledWith(false);
  });

  it('re-reports the same answer if tapped again — the form owns the state', async () => {
    const user = userEvent.setup();
    const { onChange } = setup({ value: true });

    await user.click(screen.getByRole('button', { name: 'Yes' }));

    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('uses buttons of type="button" so it cannot submit the questionnaire', () => {
    setup();

    expect(screen.getByRole('button', { name: 'Yes' })).toHaveAttribute('type', 'button');
    expect(screen.getByRole('button', { name: 'No' })).toHaveAttribute('type', 'button');
  });
});
