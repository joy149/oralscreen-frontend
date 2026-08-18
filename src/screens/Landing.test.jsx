import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import Landing from './Landing';
import { routerFuture } from '../test/utils';

const navigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => navigate };
});

function renderLanding() {
  return render(
    <MemoryRouter future={routerFuture}>
      <Landing />
    </MemoryRouter>
  );
}

beforeEach(() => {
  navigate.mockClear();
});

/**
 * The landing page is the product's front door, so what matters is that it sends people
 * to the right place and that the scroll-driven "how it works" rig degrades safely. The
 * visual treatment isn't asserted here — jsdom has no layout engine, so opacity driven by
 * a `--p` custom property and a sticky viewport are both meaningless in this environment.
 */
describe('the landing page', () => {
  it('opens with what the product is rather than a sign-in field', () => {
    renderLanding();

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      /A dentist’s eyes by tomorrow/i
    );
    expect(screen.queryByLabelText(/mobile number/i)).not.toBeInTheDocument();
  });

  it.each([
    'Start a screening',
    'Start free screening',
  ])('sends "%s" to the sign-in form at /start', async (label) => {
    const user = userEvent.setup();
    renderLanding();

    await user.click(screen.getAllByRole('button', { name: label })[0]);

    expect(navigate).toHaveBeenCalledWith('/start');
  });

  it('keeps a way in for clinicians without giving them the hero', async () => {
    const user = userEvent.setup();
    renderLanding();

    const links = screen.getAllByRole('button', { name: /clinician sign-in/i });
    await user.click(links[0]);

    expect(navigate).toHaveBeenCalledWith('/doctor/login');
  });

  it('states the three risk tiers by the names the results use', () => {
    renderLanding();

    ['No / mild', 'Moderate', 'High'].forEach((tier) => {
      expect(screen.getAllByText(tier).length).toBeGreaterThan(0);
    });
  });

  it('describes the screening with the questions and angles the app actually asks for', async () => {
    const user = userEvent.setup();
    renderLanding();

    const rig = document.querySelector('.landing-rig');
    ['Paan / gutkha', 'Tobacco', 'Bleeding'].forEach((item) => {
      expect(within(rig).getByText(item)).toBeInTheDocument();
    });

    await user.click(screen.getByRole('tab', { name: /Capture/ }));
    ['Front teeth & gums', 'Upper arch', 'Lower floor', 'Inner cheek / tongue'].forEach((angle) => {
      expect(within(rig).getByText(angle)).toBeInTheDocument();
    });
  });

  it('renders all three steps in the DOM, showing the first and hiding the rest', () => {
    renderLanding();

    const panels = [...document.querySelectorAll('.landing-stage')];
    expect(panels).toHaveLength(3);
    expect(panels.map((p) => p.hasAttribute('hidden'))).toEqual([false, true, true]);
    expect(screen.getByText(/Tell us what you’ve noticed/i)).toBeInTheDocument();
  });

  /**
   * The steps used to advance by consuming scroll. That decoupled what the visitor was
   * reading from where they were on the page — scrolling changed the step while the mock
   * had already left the viewport — so advancing is now an explicit action and scrolling
   * only scrolls.
   */
  it('advances a step when Next is clicked, not when the page scrolls', async () => {
    const user = userEvent.setup();
    renderLanding();

    expect(screen.getByRole('tab', { name: /History/ })).toHaveAttribute('aria-selected', 'true');

    await user.click(screen.getByRole('button', { name: /Next step/ }));

    expect(screen.getByRole('tab', { name: /Capture/ })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tabpanel')).toHaveAttribute('id', 'how-panel-2');
  });

  it('lets a step be opened directly from its tab', async () => {
    const user = userEvent.setup();
    renderLanding();

    await user.click(screen.getByRole('tab', { name: /Review/ }));

    expect(screen.getByRole('tabpanel')).toHaveAttribute('id', 'how-panel-3');
    expect(screen.getByText(/A reading in moments/i)).toBeInTheDocument();
  });

  it('walks the steps with the arrow keys, wrapping at the ends', async () => {
    const user = userEvent.setup();
    renderLanding();

    const first = screen.getByRole('tab', { name: /History/ });
    first.focus();

    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: /Capture/ })).toHaveAttribute('aria-selected', 'true');

    await user.keyboard('{ArrowLeft}{ArrowLeft}');
    expect(screen.getByRole('tab', { name: /Review/ })).toHaveAttribute('aria-selected', 'true');
  });

  it('offers the sign-up call to action once the last step is reached', async () => {
    const user = userEvent.setup();
    renderLanding();

    await user.click(screen.getByRole('tab', { name: /Review/ }));
    const cta = within(document.querySelector('.landing-rig__nav')).getByRole('button', {
      name: /Start free screening/,
    });
    await user.click(cta);

    expect(navigate).toHaveBeenCalledWith('/start');
  });

  it('disables Back on the first step so there is nowhere invalid to go', () => {
    renderLanding();

    expect(screen.getByRole('button', { name: 'Back' })).toBeDisabled();
  });

  /**
   * The capture illustration must never become a photograph. The whole point of the
   * odontogram is that a real intraoral image would repel the anxious visitor this page
   * exists to reassure, so assert the diagram is what renders.
   */
  it('illustrates capture with a tooth diagram and no imagery to fetch', () => {
    renderLanding();

    const arches = document.querySelectorAll('.vf__arch');
    expect(arches.length).toBeGreaterThan(0);
    arches.forEach((arch) => {
      expect(arch.querySelectorAll('.vf__tooth')).toHaveLength(16);
      expect(arch.querySelectorAll('.vf__tooth--on')).toHaveLength(2);
    });

    // The brand mark is the only bitmap on the page; nothing clinical is loaded.
    const srcs = [...document.querySelectorAll('img')].map((img) => img.getAttribute('src'));
    expect(srcs.every((src) => src.includes('oralscreen-mark'))).toBe(true);
  });

  it('carries the not-a-diagnosis disclaimer', () => {
    renderLanding();

    expect(
      screen.getByText(/screening tool, not a diagnostic device/i)
    ).toBeInTheDocument();
  });

  /**
   * Nothing on this page may hijack scrolling: no sticky pin consuming it, and no
   * scroll-linked custom property standing in for one. Asserted against the source
   * because jsdom has no layout engine and cannot exercise either.
   */
  it('leaves scrolling alone — no pin, and no scroll-driven step machinery', () => {
    // Comments stripped first: the point is what the stylesheet declares, not what its
    // prose mentions.
    const css = readFileSync(resolve(process.cwd(), 'src/screens/Landing.css'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '');
    const jsx = readFileSync(resolve(process.cwd(), 'src/screens/Landing.jsx'), 'utf8');

    expect(css).not.toMatch(/position:\s*sticky/);
    expect(css).not.toMatch(/height:\s*\d+vh/);
    expect(css).not.toMatch(/var\(--p[,)]/);
    expect(jsx).not.toMatch(/setProperty\('--p'/);
  });

  it('survives an environment with no IntersectionObserver by revealing everything', () => {
    const original = globalThis.IntersectionObserver;
    // @ts-expect-error — deliberately removing it to exercise the fallback path
    delete globalThis.IntersectionObserver;
    try {
      renderLanding();
      const hidden = [...document.querySelectorAll('.landing-rv')].filter(
        (el) => !el.classList.contains('is-in')
      );
      expect(hidden).toHaveLength(0);
    } finally {
      globalThis.IntersectionObserver = original;
    }
  });
});
