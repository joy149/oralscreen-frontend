import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import HomeCareRecommendations from './HomeCareRecommendations';

function items() {
  return screen.getAllByRole('listitem').map((li) => li.textContent);
}

describe('when there is nothing to show', () => {
  it.each([
    ['null', null],
    ['undefined', undefined],
    ['an empty string', ''],
    ['a whitespace-only string', '   '],
    ['an empty array', []],
    ['a number', 42],
  ])('renders nothing for %s', (_label, raw) => {
    const { container } = render(<HomeCareRecommendations recommendations={raw} />);

    expect(container).toBeEmptyDOMElement();
  });

  it('drops entries that are blank once their bullet marker is stripped', () => {
    const { container } = render(<HomeCareRecommendations recommendations={['- ', null, '']} />);

    expect(container).toBeEmptyDOMElement();
  });
});

describe('the card itself', () => {
  it('has a heading and a subhead', () => {
    render(<HomeCareRecommendations recommendations={['Brush twice daily']} />);

    expect(screen.getByRole('heading', { name: 'Daily Home Care Tips' })).toBeInTheDocument();
    expect(
      screen.getByText('Recommended actions you can start doing daily at home')
    ).toBeInTheDocument();
  });
});

describe('normalising a string array', () => {
  it('renders one item per entry', () => {
    render(<HomeCareRecommendations recommendations={['Brush twice daily', 'Floss nightly']} />);

    expect(items()).toEqual(['Brush twice daily', 'Floss nightly']);
  });

  it('strips leading bullets, dashes and numbering', () => {
    render(
      <HomeCareRecommendations
        recommendations={['- Brush twice daily', '• Floss nightly', '1. Rinse', '> Avoid tobacco']}
      />
    );

    expect(items()).toEqual(['Brush twice daily', 'Floss nightly', 'Rinse', 'Avoid tobacco']);
  });
});

describe('normalising an object array', () => {
  it('renders a title and body from title/description', () => {
    render(
      <HomeCareRecommendations
        recommendations={[{ title: 'Brushing', description: 'Twice a day, two minutes.' }]}
      />
    );

    expect(screen.getByRole('heading', { level: 4, name: 'Brushing' })).toBeInTheDocument();
    expect(screen.getByText('Twice a day, two minutes.')).toBeInTheDocument();
  });

  it.each([
    ['heading', { heading: 'Flossing' }],
    ['header', { header: 'Flossing' }],
    ['title', { title: 'Flossing' }],
  ])('accepts %s as the title key', (_key, raw) => {
    render(<HomeCareRecommendations recommendations={[raw]} />);

    expect(screen.getByRole('heading', { level: 4, name: 'Flossing' })).toBeInTheDocument();
  });

  it.each([
    ['description', { description: 'Once a day' }],
    ['text', { text: 'Once a day' }],
    ['tip', { tip: 'Once a day' }],
    ['details', { details: 'Once a day' }],
    ['recommendation', { recommendation: 'Once a day' }],
  ])('accepts %s as the body key', (_key, raw) => {
    render(<HomeCareRecommendations recommendations={[raw]} />);

    expect(screen.getByText('Once a day')).toBeInTheDocument();
  });

  it('trims surrounding whitespace', () => {
    render(<HomeCareRecommendations recommendations={[{ title: '  Brushing  ', text: '  Daily  ' }]} />);

    expect(screen.getByRole('heading', { level: 4, name: 'Brushing' })).toBeInTheDocument();
    expect(screen.getByText('Daily')).toBeInTheDocument();
  });

  /**
   * KNOWN DEFECT, pinned rather than asserted as desirable.
   *
   * `parseItem` falls through to `String(item)` for an object whose keys it does not
   * recognise, so the patient's result screen renders the literal text
   * "[object Object]" as a home-care tip. The `if (typeof item === 'object')` branch
   * should `return null` when it finds neither a title nor a body, instead of falling
   * through to the stringify fallback (which only makes sense for numbers/booleans).
   *
   * These two tests will fail when that is fixed — that is the point. Replace them with
   * `expect(container).toBeEmptyDOMElement()` at that time.
   */
  it('currently renders "[object Object]" for an unrecognised object shape', () => {
    render(<HomeCareRecommendations recommendations={[{ colour: 'blue' }]} />);

    expect(screen.getByRole('listitem')).toHaveTextContent('[object Object]');
  });

  it('currently renders "[object Object]" for an empty object payload', () => {
    render(<HomeCareRecommendations recommendations={{}} />);

    expect(screen.getByRole('listitem')).toHaveTextContent('[object Object]');
  });
});

describe('normalising a wrapper object', () => {
  it.each(['tips', 'recommendations', 'items', 'list'])('unwraps the %s key', (key) => {
    render(<HomeCareRecommendations recommendations={{ [key]: ['Brush twice daily'] }} />);

    expect(items()).toEqual(['Brush twice daily']);
  });

  it('treats a bare object as a single item', () => {
    render(<HomeCareRecommendations recommendations={{ title: 'Brushing', text: 'Daily' }} />);

    expect(screen.getAllByRole('listitem')).toHaveLength(1);
    expect(screen.getByRole('heading', { level: 4, name: 'Brushing' })).toBeInTheDocument();
  });
});

describe('normalising a single string', () => {
  it('splits a multi-line block into one item per line', () => {
    render(
      <HomeCareRecommendations recommendations={'- Brush twice daily\n- Floss nightly\n- Rinse'} />
    );

    expect(items()).toEqual(['Brush twice daily', 'Floss nightly', 'Rinse']);
  });

  it('keeps a single-line string as one item', () => {
    render(<HomeCareRecommendations recommendations="Brush twice daily" />);

    expect(items()).toEqual(['Brush twice daily']);
  });

  it('handles CRLF line endings', () => {
    render(<HomeCareRecommendations recommendations={'Brush\r\nFloss'} />);

    expect(items()).toEqual(['Brush', 'Floss']);
  });
});
