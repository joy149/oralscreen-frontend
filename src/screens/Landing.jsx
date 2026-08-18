import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Check } from 'lucide-react';
import oralscreenLogo from '../assets/oralscreen-mark.png';
import './Landing.css';

/**
 * The public landing page — what `/` shows to anyone who is not already signed in.
 *
 * <p>Before this existed, `/` was the OTP form: a stranger met a phone-number field with
 * no explanation of what the product was, who reviewed it, or what came back. That is a
 * reasonable front door for staff and a terrible one for the patients this is aimed at,
 * who are being asked to photograph the inside of their own mouth.
 *
 * <p>The signed-in patient never sees this page — `PatientLanding` in App.jsx resolves `/`
 * to `PatientHome` for them. Sign-in itself moved to `/start`.
 *
 * <p>Every claim here is drawn from the product, not invented: the six questionnaire
 * items and the duration question come from QuestionnaireForm, the four capture angles
 * from PhotoUpload, the three tiers from RiskTier, and the 24-hour figure from
 * AssessmentPending's VITE_REVIEW_SLA default. There are deliberately no statistics.
 */

/* The capture illustration is an odontogram — the arch diagram on a dental chart — and
   emphatically not a photograph. An intraoral photo on a marketing page repels the exact
   visitor the product exists for: the one already anxious about a patch in their mouth.
   The geometry is computed so the arch stays adjustable rather than being 16 frozen paths. */
const ARCH = (() => {
  const CX = 150;
  const CY = 46;
  const RX_OUTER = 112;
  const RY_OUTER = 100;
  const RX_INNER = 78;
  const RY_INNER = 66;
  const FROM = 18;
  const TO = 162;
  const COUNT = 16;
  const FLAGGED = [11, 12];

  const step = (TO - FROM) / COUNT;
  const at = (rx, ry, deg) => {
    const r = (deg * Math.PI) / 180;
    return [CX + rx * Math.cos(r), CY + ry * Math.sin(r)];
  };
  const n = (v) => v.toFixed(1);

  const tooth = (i) => {
    const pad = step * 0.09; // a hairline gap, so the segments read as separate teeth
    const a = FROM + i * step + pad;
    const b = FROM + (i + 1) * step - pad;
    const [ox0, oy0] = at(RX_OUTER, RY_OUTER, a);
    const [ox1, oy1] = at(RX_OUTER, RY_OUTER, b);
    const [ix1, iy1] = at(RX_INNER, RY_INNER, b);
    const [ix0, iy0] = at(RX_INNER, RY_INNER, a);
    return `M${n(ox0)} ${n(oy0)} L${n(ox1)} ${n(oy1)} L${n(ix1)} ${n(iy1)} L${n(ix0)} ${n(iy0)} Z`;
  };

  const mid = FROM + ((Math.min(...FLAGGED) + Math.max(...FLAGGED) + 1) / 2) * step;
  const [leaderX, leaderY] = at((RX_OUTER + RX_INNER) / 2, (RY_OUTER + RY_INNER) / 2, mid);

  return {
    plain: Array.from({ length: COUNT }, (_, i) => i)
      .filter((i) => !FLAGGED.includes(i))
      .map(tooth),
    flagged: FLAGGED.map(tooth),
    leader: `M${n(leaderX)} ${n(leaderY)} L150.0 76.0`,
  };
})();

/** Reduced motion, read defensively: matchMedia is missing in some embedded webviews,
    and the front door must not white-screen on a browser that lacks it. */
function prefersReducedMotion() {
  if (typeof window.matchMedia !== 'function') return false;
  const query = window.matchMedia('(prefers-reduced-motion: reduce)');
  return Boolean(query && query.matches);
}

function OdontogramArch() {
  return (
    <svg
      className="vf__arch"
      viewBox="30 44 240 112"
      preserveAspectRatio="xMidYMid meet"
      aria-hidden="true"
    >
      {ARCH.plain.map((d) => (
        <path key={d} className="vf__tooth" d={d} />
      ))}
      <g className="vf__flag">
        {ARCH.flagged.map((d) => (
          <path key={d} className="vf__tooth vf__tooth--on" d={d} />
        ))}
        <path className="vf__leader" d={ARCH.leader} />
        <rect className="vf__chip" x="96" y="52" width="108" height="21" rx="5" />
        <text className="vf__chiptext" x="150" y="66.5" textAnchor="middle">
          REGION FLAGGED
        </text>
      </g>
    </svg>
  );
}

const FAQS = [
  {
    q: 'Is this a diagnosis?',
    a: `No. It's a screening — a way to find out whether something is worth a professional
        look, and how soon. A diagnosis needs an in-person examination, and where one is
        warranted your dentist's note will say so.`,
  },
  {
    q: 'What does it cost?',
    a: 'Nothing during the pilot. There is no card to enter and nothing to cancel.',
  },
  {
    q: 'How good do the photos have to be?',
    a: `Good enough is genuinely good enough. The camera shows an oval guide for each of the
        four views, and if a photo is too dark or blurred to read, you'll be asked to retake
        that one rather than being scored on it.`,
  },
  {
    q: "What if I don't have symptoms?",
    a: `You can still screen. Habits like tobacco, alcohol, and paan or gutkha carry risk on
        their own, and the earliest changes are usually the ones that don't hurt yet.`,
  },
  {
    q: 'Who is the dentist reviewing it?',
    a: `A licensed practitioner, named on your result along with the date and time they
        reviewed it. Until then your screening is clearly marked as awaiting review.`,
  },
  {
    q: 'Can I see my past screenings?',
    a: `Yes. Everything you've submitted stays in your history with its tier and the
        dentist's note, so you can see whether something has changed over months rather
        than relying on memory.`,
  },
];

const STEPS = [
  { n: 1, label: 'History' },
  { n: 2, label: 'Capture' },
  { n: 3, label: 'Review' },
];

const FACTS = [
  { value: 6, label: 'Questions' },
  { value: 4, label: 'Guided photos' },
  { value: 2, prefix: '~', suffix: ' min', label: 'To complete' },
  { value: 24, suffix: ' hr', label: 'Dentist review' },
];

export default function Landing() {
  const navigate = useNavigate();
  const navRef = useRef(null);
  const progressRef = useRef(null);
  const rootRef = useRef(null);
  const tabRefs = useRef([]);
  const [activeStep, setActiveStep] = useState(1);

  function goToStep(n) {
    setActiveStep(Math.min(STEPS.length, Math.max(1, n)));
  }

  /* Arrow keys move focus along with the selection, as the tablist pattern requires.
     Back/Next deliberately do NOT: focusing a tab scrolls it into view, so clicking
     Next at the foot of the section threw the page back up to the tab strip. Leaving
     focus on the button also means Next can be pressed repeatedly. */
  function goToTab(n) {
    goToStep(n);
    const tab = tabRefs.current[n - 1];
    if (tab) tab.focus();
  }

  function handleTabKeys(event) {
    const keys = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };
    if (event.key in keys) {
      event.preventDefault();
      // Wraps, as the tablist pattern expects.
      goToTab(((activeStep - 1 + keys[event.key] + STEPS.length) % STEPS.length) + 1);
    } else if (event.key === 'Home') {
      event.preventDefault();
      goToTab(1);
    } else if (event.key === 'End') {
      event.preventDefault();
      goToTab(STEPS.length);
    }
  }

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return undefined;

    const reduced = prefersReducedMotion();

    /* Reveal on scroll. Anything already on screen at mount is revealed immediately:
       the observer's negative bottom margin means an element low in the first viewport
       never intersects until the visitor scrolls, which left the hero's fact row
       invisible on load. */
    const revealables = Array.from(root.querySelectorAll('.landing-rv'));
    let observer;
    if (reduced || typeof IntersectionObserver === 'undefined') {
      revealables.forEach((el) => el.classList.add('is-in'));
    } else {
      observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              entry.target.classList.add('is-in');
              observer.unobserve(entry.target);
            }
          });
        },
        { rootMargin: '0px 0px -12% 0px', threshold: 0.12 }
      );
      revealables.forEach((el) => {
        if (el.getBoundingClientRect().top < window.innerHeight) {
          el.classList.add('is-in');
          return;
        }
        observer.observe(el);
      });
    }

    let raf = 0;
    let counterRaf = 0;
    let ticking = false;

    function frame() {
      ticking = false;
      const y = window.pageYOffset || document.documentElement.scrollTop || 0;
      const scrollable = Math.max(
        1,
        document.documentElement.scrollHeight - window.innerHeight
      );

      if (progressRef.current) {
        progressRef.current.style.transform = `scaleX(${Math.min(1, y / scrollable)})`;
      }
      if (navRef.current) {
        navRef.current.classList.toggle('is-stuck', y > 40);
      }

      if (!reduced) {
        root.querySelectorAll('[data-parallax]').forEach((el) => {
          const rate = parseFloat(el.dataset.parallax) || 0;
          const rect = el.getBoundingClientRect();
          if (rect.bottom > -200 && rect.top < window.innerHeight + 200) {
            const offset = (rect.top + rect.height / 2 - window.innerHeight / 2) * rate;
            el.style.transform = `translate3d(0, ${offset.toFixed(1)}px, 0)`;
          }
        });
      }

    }

    function onScroll() {
      if (ticking) return;
      ticking = true;
      raf = requestAnimationFrame(frame);
    }

    // Counters
    const counters = Array.from(root.querySelectorAll('[data-count]'));
    function runCounters() {
      const start = performance.now();
      const duration = 950;
      function tick(now) {
        const k = Math.min(1, (now - start) / duration);
        const eased = 1 - Math.pow(1 - k, 3);
        counters.forEach((el) => {
          const target = parseFloat(el.dataset.count);
          el.textContent = `${el.dataset.prefix || ''}${Math.round(target * eased)}${
            el.dataset.suffix || ''
          }`;
        });
        if (k < 1) counterRaf = requestAnimationFrame(tick);
      }
      counterRaf = requestAnimationFrame(tick);
    }
    if (!reduced) runCounters();

    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    frame();

    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      if (raf) cancelAnimationFrame(raf);
      if (counterRaf) cancelAnimationFrame(counterRaf);
      if (observer) observer.disconnect();
    };
  }, []);

  /* global.css pins scroll-behavior to auto with !important, so anchor navigation is
     smoothed here instead of in CSS. */
  function jumpTo(event, id) {
    event.preventDefault();
    const target = document.getElementById(id);
    if (!target) return;
    target.scrollIntoView({
      behavior: prefersReducedMotion() ? 'auto' : 'smooth',
      block: 'start',
    });
  }

  const startScreening = () => navigate('/start');

  return (
    <div className="landing" ref={rootRef}>
      <div className="landing__progress" ref={progressRef} aria-hidden="true" />

      <nav className="landing__nav" ref={navRef} aria-label="Main">
        <div className="landing__nav-inner">
          <button
            type="button"
            className="landing__brand"
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            aria-label="OralScreen — back to top"
          >
            <img src={oralscreenLogo} alt="" className="landing__brand-mark" width="30" height="30" />
            <span>OralScreen</span>
          </button>

          <div className="landing__nav-links">
            <a href="#how" onClick={(e) => jumpTo(e, 'how')}>How it works</a>
            <a href="#result" onClick={(e) => jumpTo(e, 'result')}>Your result</a>
            <a href="#review" onClick={(e) => jumpTo(e, 'review')}>Dentist review</a>
            <a href="#privacy" onClick={(e) => jumpTo(e, 'privacy')}>Privacy</a>
          </div>

          <div className="landing__nav-cta">
            <button
              type="button"
              className="landing__clinician"
              onClick={() => navigate('/doctor/login')}
            >
              Clinician sign-in
            </button>
            <button
              type="button"
              className="landing-btn landing-btn--primary landing-btn--sm"
              onClick={startScreening}
            >
              Start a screening
            </button>
          </div>
        </div>
      </nav>

      <header className="landing__hero">
        <div className="landing__orb landing__orb--1" data-parallax="0.18" aria-hidden="true" />
        <div className="landing__orb landing__orb--2" data-parallax="-0.10" aria-hidden="true" />

        <div className="landing__wrap landing__hero-grid">
          <div>
            <p className="landing-note landing-rv">Guided oral screening · India</p>
            <h1 className="landing-rv" style={{ '--d': '70ms' }}>
              Two minutes today.
              <br />
              A dentist&rsquo;s eyes <em>by tomorrow.</em>
            </h1>
            <p className="landing__hero-sub landing-rv" style={{ '--d': '150ms' }}>
              Answer six questions about your mouth, take four guided photos with the phone in
              your hand, and get a risk reading back. A licensed dentist reviews every single
              one — no exceptions, no upsell, no clinic visit to find out.
            </p>

            <div className="landing__hero-actions landing-rv" style={{ '--d': '230ms' }}>
              <button
                type="button"
                className="landing-btn landing-btn--primary"
                onClick={startScreening}
              >
                Start free screening
                <ArrowRight size={16} />
              </button>
              <a
                className="landing-btn landing-btn--ghost"
                href="#how"
                onClick={(e) => jumpTo(e, 'how')}
              >
                See how it works
              </a>
            </div>

            <p className="landing__hero-fine landing-rv" style={{ '--d': '300ms' }}>
              No app to install · Sign in with your mobile number · Free during the pilot
            </p>

            <div className="landing__facts landing-rv" style={{ '--d': '370ms' }}>
              {FACTS.map((fact) => (
                <div className="landing__fact" key={fact.label}>
                  <div
                    className="landing__fact-n"
                    data-count={fact.value}
                    data-prefix={fact.prefix}
                    data-suffix={fact.suffix}
                  >
                    {fact.prefix || ''}
                    {fact.value}
                    {fact.suffix || ''}
                  </div>
                  <div className="landing__fact-l">{fact.label}</div>
                </div>
              ))}
            </div>
          </div>

          <div
            className="landing-scan landing-rv"
            style={{ '--d': '200ms' }}
            data-parallax="0.06"
            aria-label="Illustration of a screening in progress"
          >
            <div className="landing-scan__chrome">
              <span className="landing-scan__rec" aria-hidden="true" />
              <span>Capture · front teeth &amp; gums</span>
              <span className="landing-scan__step">2 of 3</span>
            </div>

            <div className="landing-scan__field" aria-hidden="true">
              <div className="landing-scan__vignette" />
              <div className="vf__grid" />
              <OdontogramArch />
              <div className="landing-scan__guide" />
              <div className="landing-scan__sweep" />
            </div>

            <div className="landing-scan__readout">
              <div className="landing-scan__line">
                <span className="landing-scan__tick" aria-hidden="true">
                  <Check size={11} strokeWidth={3.4} />
                </span>
                Symptoms &amp; habits
                <span className="landing-scan__val">6 / 6</span>
              </div>
              <div className="landing-scan__line">
                <span className="landing-scan__tick" aria-hidden="true">
                  <Check size={11} strokeWidth={3.4} />
                </span>
                Photos captured
                <span className="landing-scan__val">4 / 4</span>
              </div>
              <div className="landing-scan__line">
                <span className="landing-chip landing-chip--moderate">
                  <i aria-hidden="true" />
                  Moderate
                </span>
                <span className="landing-scan__val">Awaiting dentist</span>
              </div>
            </div>
          </div>
        </div>

        <div className="landing__cue" aria-hidden="true">
          <span>Scroll to screen</span>
          <span className="landing__cue-line" />
        </div>
      </header>

      {/* Advanced by clicking, not by scrolling. A pinned section that consumes scroll
          decouples what you are reading from where you are on the page, breaks the
          keyboard, and leaves anyone who scrolls quickly stranded past content they
          never saw. Scrolling scrolls; the steps are a tablist. */}
      <section className="landing-rig" id="how">
        <div className="landing-rig__inner">
          <div className="landing-rig__head">
            <p className="landing-note landing-note--deep">How it works</p>
            <h2>Three steps, in the order a dentist would ask.</h2>
          </div>

          <div className="landing-rig__tabs" role="tablist" aria-label="How a screening works">
            {STEPS.map((step) => (
              <button
                key={step.n}
                type="button"
                role="tab"
                id={`how-tab-${step.n}`}
                aria-controls={`how-panel-${step.n}`}
                aria-selected={activeStep === step.n}
                tabIndex={activeStep === step.n ? 0 : -1}
                ref={(el) => { tabRefs.current[step.n - 1] = el; }}
                className={`landing-rig__tab${activeStep === step.n ? ' is-on' : ''}`}
                onClick={() => setActiveStep(step.n)}
                onKeyDown={handleTabKeys}
              >
                <span className="landing-rig__tab-n">STEP 0{step.n}</span>
                <span className="landing-rig__tab-label">{step.label}</span>
              </button>
            ))}
          </div>

              <article
                className={`landing-stage landing-stage--1${activeStep === 1 ? ' is-active' : ''}`}
                id="how-panel-1"
                role="tabpanel"
                aria-labelledby="how-tab-1"
                hidden={activeStep !== 1}
              >
                <div>
                  <p className="landing-stage__n">STEP 01 — HISTORY</p>
                  <h2>Tell us what you&rsquo;ve noticed.</h2>
                  <p className="landing-stage__p">
                    How long the symptom has been there, then six yes/no questions. Habits
                    matter here, so we ask about them plainly rather than burying them in a form.
                  </p>
                  <ul className="landing-stage__list">
                    <li>Duration</li>
                    <li>Pain</li>
                    <li>Bleeding</li>
                    <li>Swallowing</li>
                    <li>Tobacco</li>
                    <li>Alcohol</li>
                    <li>Paan / gutkha</li>
                  </ul>
                </div>
                <div className="landing-dev">
                  <div className="landing-dev__screen">
                    <div className="landing-dev__bar">
                      <span>OralScreen</span>
                      <span>STEP 1 OF 3</span>
                    </div>
                    <div className="landing-dev__track">
                      <div className="landing-dev__fill landing-dev__fill--answers" />
                    </div>
                    <p className="landing-dev__label">Symptoms</p>
                    <p className="landing-dev__q">How long have you noticed it?</p>
                    <div className="landing-dev__opts">
                      <span className="landing-dev__opt">7–10 days</span>
                      <span className="landing-dev__opt landing-dev__opt--answer" data-q="1">
                        Over 1 month
                      </span>
                    </div>
                    <p className="landing-dev__q">Do you use paan or gutkha?</p>
                    <div className="landing-dev__opts">
                      <span className="landing-dev__opt landing-dev__opt--answer" data-q="2">Yes</span>
                      <span className="landing-dev__opt">No</span>
                    </div>
                    <p className="landing-dev__q">Any bleeding?</p>
                    <div className="landing-dev__opts">
                      <span className="landing-dev__opt">Yes</span>
                      <span className="landing-dev__opt landing-dev__opt--answer" data-q="3">No</span>
                    </div>
                  </div>
                </div>
              </article>

              <article
                className={`landing-stage landing-stage--2${activeStep === 2 ? ' is-active' : ''}`}
                id="how-panel-2"
                role="tabpanel"
                aria-labelledby="how-tab-2"
                hidden={activeStep !== 2}
              >
                <div>
                  <p className="landing-stage__n">STEP 02 — CAPTURE</p>
                  <h2>Four photos, and the phone tells you where to aim.</h2>
                  <p className="landing-stage__p">
                    An on-screen oval frames each view. Front, up, down, and to the side — the
                    same four a dentist checks by hand. Too dark or too blurred to read, and
                    you&rsquo;re asked to retake that one rather than scored on it.
                  </p>
                  <ul className="landing-stage__list">
                    <li>Front teeth &amp; gums</li>
                    <li>Upper arch</li>
                    <li>Lower floor</li>
                    <li>Inner cheek / tongue</li>
                  </ul>
                </div>
                <div className="landing-dev">
                  <div className="landing-dev__screen">
                    <div className="landing-dev__bar">
                      <span>OralScreen</span>
                      <span>STEP 2 OF 3</span>
                    </div>
                    <div className="landing-dev__track">
                      <div className="landing-dev__fill" style={{ width: '66%' }} />
                    </div>
                    <div className="landing-dev__angles">
                      <span className="landing-dev__angle is-on">Front</span>
                      <span className="landing-dev__angle">Upper</span>
                      <span className="landing-dev__angle">Lower</span>
                      <span className="landing-dev__angle">Cheek</span>
                    </div>
                    <div className="landing-dev__capture">
                      <div className="vf__grid" />
                      <OdontogramArch />
                      <div className="landing-dev__oval" />
                      <div className="landing-dev__sweep" />
                    </div>
                    <p className="landing-dev__note">Center front teeth &amp; gums inside the oval</p>
                  </div>
                </div>
              </article>

              <article
                className={`landing-stage landing-stage--3${activeStep === 3 ? ' is-active' : ''}`}
                id="how-panel-3"
                role="tabpanel"
                aria-labelledby="how-tab-3"
                hidden={activeStep !== 3}
              >
                <div>
                  <p className="landing-stage__n">STEP 03 — REVIEW</p>
                  <h2>A reading in moments. A verdict by tomorrow.</h2>
                  <p className="landing-stage__p">
                    The model returns a risk tier straight away, and your screen says
                    &ldquo;awaiting dentist review&rdquo; until a licensed dentist has actually
                    looked. When their tier differs from the model&rsquo;s, theirs is the one
                    you see.
                  </p>
                  <ul className="landing-stage__list">
                    <li>Risk tier</li>
                    <li>Dentist&rsquo;s note</li>
                    <li>Home care</li>
                    <li>Kept in your history</li>
                  </ul>
                </div>
                <div className="landing-dev">
                  <div className="landing-dev__screen">
                    <div className="landing-dev__bar">
                      <span>OralScreen</span>
                      <span>STEP 3 OF 3</span>
                    </div>
                    <div className="landing-dev__track">
                      <div className="landing-dev__fill" style={{ width: '100%' }} />
                    </div>
                    <div className="landing-dev__cardlet landing-dev__cardlet--r1">
                      <p className="landing-dev__label">Your result</p>
                      <span className="landing-chip landing-chip--moderate">
                        <i aria-hidden="true" />
                        Moderate
                      </span>
                      <div className="landing-dev__row">
                        <span>Reviewed by dentist</span>
                        <span aria-hidden="true">✓</span>
                      </div>
                      <div className="landing-dev__row">
                        <span>14 Aug 2026</span>
                        <span>#A-4192</span>
                      </div>
                    </div>
                    <div className="landing-dev__cardlet landing-dev__cardlet--r2">
                      <p className="landing-dev__label">Daily home care</p>
                      <div className="landing-dev__row"><span>Rinse after every meal</span></div>
                      <div className="landing-dev__row"><span>Cut back on paan</span></div>
                      <div className="landing-dev__row"><span>Recheck in 14 days</span></div>
                    </div>
                  </div>
                </div>
              </article>

          <div className="landing-rig__nav">
            <button
              type="button"
              className="landing-btn landing-btn--outline-deep"
              onClick={() => goToStep(activeStep - 1)}
              disabled={activeStep === 1}
            >
              Back
            </button>
            <p className="landing-rig__count">Step {activeStep} of {STEPS.length}</p>
            {activeStep < STEPS.length ? (
              <button
                type="button"
                className="landing-btn landing-btn--on-deep"
                onClick={() => goToStep(activeStep + 1)}
              >
                Next step
                <ArrowRight size={16} />
              </button>
            ) : (
              <button
                type="button"
                className="landing-btn landing-btn--on-deep"
                onClick={startScreening}
              >
                Start free screening
                <ArrowRight size={16} />
              </button>
            )}
          </div>
        </div>
      </section>

      <section className="landing-sec" id="result">
        <div className="landing__wrap">
          <div className="landing-head">
            <p className="landing-note landing-rv">What comes back</p>
            <h2 className="landing-rv" style={{ '--d': '70ms' }}>
              A place on a scale — not a red light or a green one.
            </h2>
            <p className="landing-rv" style={{ '--d': '140ms' }}>
              Risk is a gradient, so we report it as one. Every tier says what it means and
              what to do next, in language that doesn&rsquo;t need a dictionary.
            </p>
          </div>

          <div className="landing-rail">
            <div className="landing-rail__bar landing-rv" aria-hidden="true" />
            <div className="landing-rail__tiers">
              <article className="landing-tier landing-rv" style={{ '--d': '80ms' }}>
                <span className="landing-chip landing-chip--mild"><i aria-hidden="true" />No / mild</span>
                <h3>Nothing that needs urgency</h3>
                <p>
                  Keep an eye on it and follow the home care tips your result comes with.
                  Screen again if anything changes.
                </p>
              </article>
              <article className="landing-tier landing-rv" style={{ '--d': '180ms' }}>
                <span className="landing-chip landing-chip--moderate"><i aria-hidden="true" />Moderate</span>
                <h3>Worth a closer look</h3>
                <p>
                  Your dentist&rsquo;s note will say what they saw and how soon to have it
                  examined in person.
                </p>
              </article>
              <article className="landing-tier landing-rv" style={{ '--d': '280ms' }}>
                <span className="landing-chip landing-chip--high"><i aria-hidden="true" />High</span>
                <h3>See someone soon</h3>
                <p>
                  You&rsquo;ll be told clearly and directly, with the reasoning attached, so
                  you can walk into a clinic already knowing what to ask.
                </p>
              </article>
            </div>
          </div>
        </div>
      </section>

      <section className="landing-sec landing-sec--tint" id="review">
        <div className="landing__wrap landing-split">
          <div>
            <p className="landing-note landing-rv">Dentist review</p>
            <h2
              className="landing-rv"
              style={{
                '--d': '70ms',
                fontSize: 'clamp(30px, 3.7vw, 45px)',
                lineHeight: 1.06,
                letterSpacing: '-0.028em',
                fontWeight: 700,
                margin: '18px 0 0',
              }}
            >
              The model screens. A person decides.
            </h2>
            <p
              className="landing-rv"
              style={{ '--d': '140ms', marginTop: '16px', fontSize: '18px', color: 'var(--color-ink-soft)' }}
            >
              An AI reading on its own is a guess with good manners. Every screening goes to a
              licensed dentist who confirms it, corrects it, or escalates it — and you always
              see which of the two you&rsquo;re reading.
            </p>
            <ul className="landing-ticks">
              <li className="landing-rv" style={{ '--d': '200ms' }}>
                <Check size={17} strokeWidth={2.6} />
                <span>
                  <strong>Every result, without exception.</strong> Not a sample, not the
                  worrying ones only.
                </span>
              </li>
              <li className="landing-rv" style={{ '--d': '270ms' }}>
                <Check size={17} strokeWidth={2.6} />
                <span>
                  <strong>Labelled honestly.</strong> Your screen says &ldquo;awaiting dentist
                  review&rdquo; until a dentist has actually looked.
                </span>
              </li>
              <li className="landing-rv" style={{ '--d': '340ms' }}>
                <Check size={17} strokeWidth={2.6} />
                <span>
                  <strong>The dentist can disagree.</strong> When their tier differs from the
                  model&rsquo;s, theirs is the one you see.
                </span>
              </li>
            </ul>
          </div>

          <div className="landing-review landing-rv" style={{ '--d': '160ms' }}>
            <div className="landing-review__head">
              <span className="landing-review__avatar" aria-hidden="true">RK</span>
              <span>
                <span className="landing-review__who">Dr. R. Kulkarni, BDS</span>
                <br />
                <span className="landing-review__meta">REVIEWED 14 AUG · 09:42 IST</span>
              </span>
              <span className="landing-chip landing-chip--moderate" style={{ marginLeft: 'auto' }}>
                <i aria-hidden="true" />
                Moderate
              </span>
            </div>
            <div className="landing-review__body">
              <p className="landing-review__ai">
                Model reading: pale patch on the left buccal mucosa, present more than one
                month, with reported paan use. Tier: moderate.
              </p>
              <p className="landing-review__verdict">
                Agreed with the model. The area is well defined and hasn&rsquo;t changed size,
                but with a month of history and daily paan I&rsquo;d want it looked at in
                person. Book an OPD visit in the next two weeks — this is not urgent, and it
                is not something to leave.
              </p>
              <div className="landing-review__sign">
                <span>Signed · Reg. no. on file</span>
                <span>Case #A-4192</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="landing-sec landing-sec--deep" id="privacy">
        <div className="landing__orb landing__orb--3" data-parallax="0.12" aria-hidden="true" />
        <div className="landing__wrap landing-split">
          <div>
            <p className="landing-note landing-note--deep landing-rv">Privacy</p>
            <h2
              className="landing-rv"
              style={{
                '--d': '70ms',
                fontSize: 'clamp(30px, 3.7vw, 45px)',
                lineHeight: 1.06,
                letterSpacing: '-0.028em',
                fontWeight: 700,
                margin: '18px 0 0',
              }}
            >
              Photos of your mouth are not content.
            </h2>
            <p className="landing-rv" style={{ '--d': '140ms', marginTop: '16px', fontSize: '18px' }}>
              We ask for something genuinely personal, so the rules are short enough to read.
              Your screening is yours, your dentist&rsquo;s, and no one else&rsquo;s.
            </p>
          </div>
          <ul className="landing-ticks" style={{ marginTop: 0 }}>
            <li className="landing-rv" style={{ '--d': '200ms' }}>
              <Check size={17} strokeWidth={2.6} />
              <span>
                <strong>Seen only by your reviewing dentist.</strong> Not sold, not shared, not
                shown to advertisers.
              </span>
            </li>
            <li className="landing-rv" style={{ '--d': '270ms' }}>
              <Check size={17} strokeWidth={2.6} />
              <span>
                <strong>Your number is the only ID we need.</strong> No email, no address, no
                payment details.
              </span>
            </li>
            <li className="landing-rv" style={{ '--d': '340ms' }}>
              <Check size={17} strokeWidth={2.6} />
              <span>
                <strong>You consent before anything is stored.</strong> The policy is one
                screen, in plain words, before you upload.
              </span>
            </li>
          </ul>
        </div>
      </section>

      <section className="landing-sec landing-sec--tint" id="faq">
        <div className="landing__wrap" style={{ maxWidth: '860px' }}>
          <div className="landing-head" style={{ maxWidth: 'none' }}>
            <p className="landing-note landing-rv">Questions</p>
            <h2 className="landing-rv" style={{ '--d': '70ms' }}>Before you start.</h2>
          </div>
          <div className="landing-faq landing-rv" style={{ '--d': '140ms' }}>
            {FAQS.map((item, index) => (
              <details key={item.q} open={index === 0}>
                <summary>{item.q}</summary>
                <p className="landing-faq__a">{item.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section className="landing-cta" id="start-cta">
        <div className="landing__orb landing__orb--4" aria-hidden="true" />
        <div className="landing__wrap">
          <p className="landing-note landing-rv">Start now</p>
          <h2 className="landing-rv" style={{ '--d': '70ms' }}>
            The check you keep meaning to book takes two minutes.
          </h2>
          <p className="landing-rv" style={{ '--d': '140ms' }}>
            Enter your mobile number, answer six questions, take four photos. A dentist will
            have looked at it by this time tomorrow.
          </p>
          <div className="landing-cta__actions landing-rv" style={{ '--d': '210ms' }}>
            <button
              type="button"
              className="landing-btn landing-btn--primary"
              onClick={startScreening}
            >
              Start free screening
              <ArrowRight size={16} />
            </button>
            <a
              className="landing-btn landing-btn--ghost"
              href="#how"
              onClick={(e) => jumpTo(e, 'how')}
            >
              Read how it works
            </a>
          </div>
        </div>
      </section>

      <footer className="landing-foot">
        <div className="landing__wrap">
          <div className="landing-foot__in">
            <span className="landing__brand">
              <img src={oralscreenLogo} alt="" className="landing__brand-mark" width="30" height="30" />
              <span>OralScreen</span>
            </span>
            <div className="landing-foot__links">
              <a href="#how" onClick={(e) => jumpTo(e, 'how')}>How it works</a>
              <a href="#result" onClick={(e) => jumpTo(e, 'result')}>Your result</a>
              <a href="#privacy" onClick={(e) => jumpTo(e, 'privacy')}>Privacy</a>
              <a href="#faq" onClick={(e) => jumpTo(e, 'faq')}>Questions</a>
              <button type="button" onClick={() => navigate('/doctor/login')}>
                Clinician sign-in
              </button>
            </div>
          </div>
          <p className="landing-foot__legal">
            OralScreen is a screening tool, not a diagnostic device, and does not replace an
            in-person dental examination. Results are generated by an AI model and reviewed
            afterward by a licensed dentist. If you have severe pain, difficulty breathing or
            swallowing, or bleeding that will not stop, seek care immediately rather than
            waiting for a review.
          </p>
        </div>
      </footer>
    </div>
  );
}
