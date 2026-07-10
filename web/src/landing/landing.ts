// ============================================================================
// Shadoken — marketing landing page.
//
// renderLanding() paints the entire pre-game experience into the given root
// element and wires every interaction (nav, hamburger, smooth-scroll,
// scroll-reveal, FAQ accordion, CTA buttons). It talks to the rest of the app
// exclusively through the shared event bus:
//   - "Enter the Arena"  → bus.emit('game:enter', { multiplayer: true })
//   - "Practice Solo"    → bus.emit('game:enter', { multiplayer: false })
//
// It renders an empty `#nav-wallet` slot; main.ts mounts the Phantom connect
// button there. This module NEVER renders a connect button itself.
// ============================================================================

import './landing.css';
import { bus } from '../events';

const GITHUB_URL = 'https://github.com/itsnevu/shadoken';

// ---- Small building blocks --------------------------------------------------

interface Feature {
  icon: string;
  title: string;
  body: string;
}

const FEATURES: Feature[] = [
  {
    icon: icoGravity(),
    title: 'Gravity, bent 90°',
    body:
      'Flip the world a quarter-turn on command. Walls become floors, ceilings become launchpads — every chamber is a puzzle of orientation.',
  },
  {
    icon: icoSwarm(),
    title: 'Command 42 ninjas',
    body:
      'You do not move one hero — you conduct an entire school. Deploy the swarm, sweep the chamber, and count who survives the blades.',
  },
  {
    icon: icoArena(),
    title: 'Real-time arena',
    body:
      'Race live ghosts through the same seeded chambers. Everyone shares one world, one gravity, one countdown. Last swarm standing wins.',
  },
  {
    icon: icoPhantom(),
    title: 'Connect Phantom',
    body:
      'Sign in with your Solana wallet in one tap. No passwords, no email — your key is your identity across the whole arena.',
  },
  {
    icon: icoPwa(),
    title: 'Install & play offline',
    body:
      'Shadoken is a full PWA. Add it to your home screen, launch it fullscreen, and practice solo even with no signal.',
  },
  {
    icon: icoDevices(),
    title: 'Mobile & desktop',
    body:
      'One build, every screen. Twitch-precise keys on desktop, buttery on-screen controls on mobile — identical physics on both.',
  },
];

interface RoadPhase {
  tag: string;
  title: string;
  body: string;
  done: boolean;
}

const ROADMAP: RoadPhase[] = [
  {
    tag: 'Phase 01 · Live',
    title: 'Genesis Arena',
    body:
      'The core loop: gravity-bending chambers, 42-ninja swarms, Phantom sign-in and real-time races against live ghosts.',
    done: true,
  },
  {
    tag: 'Phase 02',
    title: 'On-chain leaderboards & NFT skins',
    body:
      'Immutable high scores on Solana and collectible ninja skins you truly own — mint, trade and deploy them into the arena.',
    done: false,
  },
  {
    tag: 'Phase 03',
    title: 'Tournaments & $SHDK',
    body:
      'Scheduled bracket tournaments, staking, and the $SHDK token powering entry, rewards and community governance.',
    done: false,
  },
  {
    tag: 'Phase 04',
    title: 'Native mobile apps',
    body:
      'First-class iOS and Android builds with push notifications, haptics and deep wallet integration for play anywhere.',
    done: false,
  },
];

interface Faq {
  q: string;
  a: string;
}

const FAQS: Faq[] = [
  {
    q: 'What is Phantom?',
    a:
      'Phantom is a free, non-custodial Solana wallet available as a browser extension and mobile app. In Shadoken it is simply your login and identity — you sign a message to prove the wallet is yours. It never triggers a transaction or charges gas just to play.',
  },
  {
    q: 'Do I need crypto to play?',
    a:
      'No. Shadoken runs on Solana devnet, where everything is free. You never spend real SOL to enter the arena or race — you only need a Phantom wallet so the game knows who you are.',
  },
  {
    q: 'Is it really multiplayer?',
    a:
      'Yes. When you enter the arena you join a live Colyseus room and race real players through the exact same seeded chambers, in real time. If the server is unreachable the game gracefully drops you into solo practice instead.',
  },
  {
    q: 'Can I install it?',
    a:
      'Absolutely. Shadoken is a Progressive Web App. On desktop use your browser’s install button; on iOS tap Share → Add to Home Screen; on Android accept the install prompt. It then launches fullscreen and works offline for solo runs.',
  },
];

// ---- Public entry -----------------------------------------------------------

export function renderLanding(root: HTMLElement): void {
  root.innerHTML = markup();
  wire(root);
}

// ---- Markup -----------------------------------------------------------------

function markup(): string {
  return `
  ${backdrop()}
  <a class="lp-skip sr-only" href="#lp-hero">Skip to content</a>

  <header class="lp-nav" data-nav>
    <div class="lp-nav__inner">
      <a class="lp-brand" href="#lp-hero" data-scroll aria-label="Shadoken home">
        <span class="lp-brand__mark" aria-hidden="true">
          <span class="lp-brand__blade"></span>
        </span>
        <span class="lp-brand__word">SHADO<span class="lp-brand__ken">KEN</span></span>
      </a>

      <nav class="lp-nav__links" data-menu aria-label="Primary">
        <a href="#lp-hero" data-scroll data-nav-link>Play</a>
        <a href="#lp-features" data-scroll data-nav-link>Features</a>
        <a href="#lp-how" data-scroll data-nav-link>How to Play</a>
        <a href="#lp-roadmap" data-scroll data-nav-link>Roadmap</a>
        <a href="${GITHUB_URL}" target="_blank" rel="noopener" data-nav-link>GitHub</a>
      </nav>

      <div class="lp-nav__actions">
        <!-- main.ts mounts the Phantom connect button here. Do not fill it. -->
        <div id="nav-wallet"></div>
        <button class="lp-burger" data-burger aria-label="Toggle menu" aria-expanded="false">
          <span></span><span></span><span></span>
        </button>
      </div>
    </div>
  </header>

  <main class="lp">
    ${hero()}
    ${marquee()}
    ${features()}
    ${howToPlay()}
    ${showcase()}
    ${roadmap()}
    ${faq()}
    ${cta()}
  </main>

  ${footer()}
  `;
}

function backdrop(): string {
  return `
  <div class="lp-bg" aria-hidden="true">
    <div class="lp-bg__glow lp-bg__glow--red"></div>
    <div class="lp-bg__glow lp-bg__glow--purple"></div>
    <div class="lp-bg__grid"></div>
    <div class="lp-blade lp-blade--a" data-parallax="0.10">${bladeSvg()}</div>
    <div class="lp-blade lp-blade--b" data-parallax="0.18">${bladeSvg()}</div>
    <div class="lp-blade lp-blade--c" data-parallax="0.06">${bladeSvg()}</div>
    <div class="lp-spikes lp-spikes--top" data-parallax="0.04">${spikesSvg()}</div>
    <div class="lp-spikes lp-spikes--bottom" data-parallax="0.04">${spikesSvg()}</div>
  </div>`;
}

function hero(): string {
  return `
  <section class="lp-hero" id="lp-hero">
    <div class="lp-hero__inner">
      <div class="lp-hero__copy reveal">
        <span class="lp-badge">
          <span class="lp-badge__dot"></span>
          Powered by Solana &middot; Phantom
        </span>
        <h1 class="lp-hero__title">
          Command a <span class="lp-hl">swarm of 42 ninjas</span>
          through gravity-bending chambers.
        </h1>
        <p class="lp-hero__sub">
          Shadoken is a Web3, real-time multiplayer arena. Flip the world 90&deg;,
          pour your school through the blades, and race live ghosts across endless
          seeded chambers. Free to play. Yours to install.
        </p>
        <div class="lp-hero__cta">
          <button class="btn btn--primary btn--lg" data-enter="mp">
            ${icoPlay()} Enter the Arena
          </button>
          <button class="btn btn--ghost btn--lg" data-enter="solo">
            Practice Solo
          </button>
        </div>
        <ul class="lp-hero__stats">
          <li><strong>42</strong><span>ninjas / swarm</span></li>
          <li><strong>&#8734;</strong><span>chambers</span></li>
          <li><strong>90&deg;</strong><span>gravity flips</span></li>
          <li><strong>0</strong><span>gas to play</span></li>
        </ul>
      </div>

      <div class="lp-hero__art reveal" aria-hidden="true">
        <div class="lp-hero__logo-wrap">
          <div class="lp-hero__ring"></div>
          <img class="lp-hero__logo" src="/logo.png" alt="" width="600" height="315" loading="eager" decoding="async" />
        </div>
        <div class="lp-hero__swarm">${swarmSvg()}</div>
      </div>
    </div>
    <a class="lp-hero__scroll" href="#lp-features" data-scroll aria-label="Scroll to features">
      <span></span>
    </a>
  </section>`;
}

function marquee(): string {
  const items = [
    'GRAVITY-BENDING', 'REAL-TIME ARENA', '42 NINJAS', 'PHANTOM SIGN-IN',
    'INSTALLABLE PWA', 'SOLANA DEVNET', 'RACE LIVE GHOSTS', 'MOBILE + DESKTOP',
  ];
  const row = items.map((t) => `<span>${t}</span><span class="lp-marquee__dot">&bull;</span>`).join('');
  return `
  <div class="lp-marquee" aria-hidden="true">
    <div class="lp-marquee__track">${row}${row}</div>
  </div>`;
}

function features(): string {
  const cards = FEATURES.map(
    (f, i) => `
    <article class="lp-feat reveal" style="--i:${i}">
      <div class="lp-feat__ico">${f.icon}</div>
      <h3 class="lp-feat__title">${f.title}</h3>
      <p class="lp-feat__body">${f.body}</p>
    </article>`,
  ).join('');
  return `
  <section class="lp-section" id="lp-features">
    ${sectionHead('Features', 'Everything the arena throws at you', 'Six pillars that make every run feel alive — and dangerous.')}
    <div class="lp-feat-grid">${cards}</div>
  </section>`;
}

function howToPlay(): string {
  const desktop = [
    ['A / D &nbsp;or&nbsp; &larr; &rarr;', 'Move the swarm'],
    ['Space', 'Jump'],
    ['Shift &nbsp;or&nbsp; &uarr;', 'Rotate gravity 90&deg;'],
    ['Tap / Click', 'Deploy ninjas'],
  ].map(
    ([k, v]) => `<li><kbd>${k}</kbd><span>${v}</span></li>`,
  ).join('');

  const steps = [
    ['Connect', 'Tap Connect and approve in Phantom. No password, no gas — just a signature.'],
    ['Enter the Arena', 'Join a live room seeded to the same chambers as every other racer.'],
    ['Survive', 'Bend gravity, dodge the blades, and outlast the swarm to climb the board.'],
  ].map(
    ([t, b], i) => `
    <li class="lp-step reveal" style="--i:${i}">
      <span class="lp-step__num">${i + 1}</span>
      <div>
        <h4>${t}</h4>
        <p>${b}</p>
      </div>
    </li>`,
  ).join('');

  return `
  <section class="lp-section" id="lp-how">
    ${sectionHead('How to Play', 'Master the chamber in three moves', 'Precise on a keyboard, effortless on a thumb.')}
    <div class="lp-how">
      <div class="lp-how__controls reveal">
        <div class="lp-ctrlcard">
          <div class="lp-ctrlcard__head">${icoKeyboard()}<h3>Desktop controls</h3></div>
          <ul class="lp-keys">${desktop}</ul>
        </div>
        <div class="lp-ctrlcard">
          <div class="lp-ctrlcard__head">${icoTouch()}<h3>Mobile controls</h3></div>
          <div class="lp-touch">
            <div class="lp-touch__pad">
              <button type="button" tabindex="-1" aria-hidden="true">&#9664;</button>
              <button type="button" tabindex="-1" aria-hidden="true">&#9654;</button>
            </div>
            <div class="lp-touch__actions">
              <button type="button" tabindex="-1" aria-hidden="true" class="lp-touch__a">A</button>
              <button type="button" tabindex="-1" aria-hidden="true" class="lp-touch__b">B</button>
            </div>
          </div>
          <p class="lp-touch__hint">On-screen D-pad to move, A to jump, B to flip gravity. Tap the field to deploy your swarm.</p>
        </div>
      </div>
      <ol class="lp-steps">${steps}</ol>
    </div>
  </section>`;
}

function showcase(): string {
  return `
  <section class="lp-section lp-section--wide" id="lp-showcase">
    ${sectionHead('Gameplay', 'One world. One gravity. Every ninja for the swarm.', 'Seeded chambers, saw-blades and a school of ninjas pouring across the axis.')}
    <div class="lp-shots">
      <figure class="lp-shot reveal">
        <div class="lp-shot__frame">
          <img src="/gameplay_0.png" alt="Shadoken gameplay: a swarm of ninjas crossing a gravity chamber past a spinning saw-blade" loading="lazy" decoding="async" />
        </div>
        <figcaption>Deploy the swarm &mdash; watch the chamber count climb.</figcaption>
      </figure>
      <figure class="lp-shot reveal" style="--i:1">
        <div class="lp-shot__frame">
          <img src="/gameplay_1.png" alt="Shadoken gameplay: gravity-bent chamber with hazards and scoring" loading="lazy" decoding="async" />
        </div>
        <figcaption>Flip gravity to thread the impossible gap.</figcaption>
      </figure>
    </div>
  </section>`;
}

function roadmap(): string {
  const phases = ROADMAP.map(
    (p, i) => `
    <li class="lp-phase reveal${p.done ? ' is-done' : ''}" style="--i:${i}">
      <span class="lp-phase__node" aria-hidden="true"></span>
      <div class="lp-phase__card">
        <span class="lp-phase__tag">${p.tag}</span>
        <h3>${p.title}</h3>
        <p>${p.body}</p>
      </div>
    </li>`,
  ).join('');
  return `
  <section class="lp-section" id="lp-roadmap">
    ${sectionHead('Roadmap', 'Where the swarm is headed', 'From the Genesis Arena to a full on-chain competitive ecosystem.')}
    <ol class="lp-timeline">${phases}</ol>
  </section>`;
}

function faq(): string {
  const rows = FAQS.map(
    (f, i) => `
    <div class="lp-faq__item reveal" style="--i:${i}">
      <button class="lp-faq__q" data-faq aria-expanded="false">
        <span>${f.q}</span>
        <span class="lp-faq__chev" aria-hidden="true"></span>
      </button>
      <div class="lp-faq__a"><div class="lp-faq__a-inner"><p>${f.a}</p></div></div>
    </div>`,
  ).join('');
  return `
  <section class="lp-section" id="lp-faq">
    ${sectionHead('FAQ', 'Questions, answered', 'The short version: it’s free, it’s multiplayer, and it installs.')}
    <div class="lp-faq">${rows}</div>
  </section>`;
}

function cta(): string {
  return `
  <section class="lp-cta reveal">
    <div class="lp-cta__inner">
      <h2>Your school is waiting.</h2>
      <p>Connect your wallet and pour 42 ninjas into the arena. Free on devnet — no gas, no catch.</p>
      <div class="lp-cta__btns">
        <button class="btn btn--primary btn--lg" data-enter="mp">${icoPlay()} Enter the Arena</button>
        <button class="btn btn--ghost btn--lg" data-enter="solo">Practice Solo</button>
      </div>
    </div>
  </section>`;
}

function footer(): string {
  const year = new Date().getFullYear();
  return `
  <footer class="lp-footer">
    <div class="lp-footer__inner">
      <div class="lp-footer__brand">
        <span class="lp-brand__word">SHADO<span class="lp-brand__ken">KEN</span></span>
        <p>A school of ninjas. Any axis. Endless chambers.</p>
      </div>
      <nav class="lp-footer__nav" aria-label="Footer">
        <a href="#lp-hero" data-scroll>Play</a>
        <a href="#lp-features" data-scroll>Features</a>
        <a href="#lp-how" data-scroll>How to Play</a>
        <a href="#lp-roadmap" data-scroll>Roadmap</a>
        <a href="#lp-faq" data-scroll>FAQ</a>
        <a href="${GITHUB_URL}" target="_blank" rel="noopener">GitHub</a>
      </nav>
    </div>
    <div class="lp-footer__base">
      <p class="lp-footer__credit">
        Originally &ldquo;Numerous Ninjas&rdquo; by Adam Anderson &amp; David Pokora
        &mdash; reborn for the web.
      </p>
      <p class="lp-footer__copy">
        &copy; ${year} Shadoken &middot;
        <a href="${GITHUB_URL}" target="_blank" rel="noopener">itsnevu/shadoken</a>
      </p>
    </div>
  </footer>`;
}

// ---- Section header helper --------------------------------------------------

function sectionHead(eyebrow: string, title: string, sub: string): string {
  return `
  <header class="lp-head reveal">
    <span class="lp-eyebrow">${eyebrow}</span>
    <h2 class="lp-head__title">${title}</h2>
    <p class="lp-head__sub">${sub}</p>
  </header>`;
}

// ---- Interaction wiring -----------------------------------------------------

function wire(root: HTMLElement): void {
  const reduceMotion =
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // CTA buttons → bus events.
  root.querySelectorAll<HTMLButtonElement>('[data-enter]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const mp = btn.dataset.enter === 'mp';
      bus.emit('game:enter', { multiplayer: mp });
    });
  });

  // Nav element + mobile menu.
  const nav = root.querySelector<HTMLElement>('[data-nav]');
  const burger = root.querySelector<HTMLButtonElement>('[data-burger]');

  const closeMenu = () => {
    nav?.classList.remove('is-open');
    burger?.setAttribute('aria-expanded', 'false');
  };
  burger?.addEventListener('click', () => {
    const open = nav?.classList.toggle('is-open') ?? false;
    burger.setAttribute('aria-expanded', String(open));
  });

  // Smooth-scroll for in-page anchors.
  root.querySelectorAll<HTMLAnchorElement>('[data-scroll]').forEach((a) => {
    a.addEventListener('click', (e) => {
      const id = a.getAttribute('href');
      if (!id || !id.startsWith('#')) return;
      const target = root.querySelector<HTMLElement>(id);
      if (!target) return;
      e.preventDefault();
      closeMenu();
      target.scrollIntoView({
        behavior: reduceMotion ? 'auto' : 'smooth',
        block: 'start',
      });
    });
  });

  // Sticky-nav condensed state on scroll.
  const onScroll = () => {
    if (window.scrollY > 24) nav?.classList.add('is-scrolled');
    else nav?.classList.remove('is-scrolled');
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  // Scrollspy: highlight the active nav link.
  const navLinks = Array.from(
    root.querySelectorAll<HTMLAnchorElement>('[data-nav-link]'),
  );
  const sectionIds = ['lp-hero', 'lp-features', 'lp-how', 'lp-roadmap'];
  const spy = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const id = entry.target.id;
        navLinks.forEach((l) =>
          l.classList.toggle('is-active', l.getAttribute('href') === `#${id}`),
        );
      });
    },
    { rootMargin: '-45% 0px -50% 0px', threshold: 0 },
  );
  sectionIds.forEach((id) => {
    const el = root.querySelector(`#${id}`);
    if (el) spy.observe(el);
  });

  // Scroll-reveal animations.
  const reveals = Array.from(root.querySelectorAll<HTMLElement>('.reveal'));
  if (reduceMotion || !('IntersectionObserver' in window)) {
    reveals.forEach((el) => el.classList.add('is-visible'));
  } else {
    const io = new IntersectionObserver(
      (entries, obs) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible');
            obs.unobserve(entry.target);
          }
        });
      },
      { rootMargin: '0px 0px -8% 0px', threshold: 0.12 },
    );
    reveals.forEach((el) => io.observe(el));
  }

  // FAQ accordion.
  root.querySelectorAll<HTMLButtonElement>('[data-faq]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const open = btn.getAttribute('aria-expanded') === 'true';
      btn.setAttribute('aria-expanded', String(!open));
      btn.parentElement?.classList.toggle('is-open', !open);
    });
  });

  // Subtle parallax on the backdrop (skipped for reduced motion).
  if (!reduceMotion) {
    const layers = Array.from(
      root.querySelectorAll<HTMLElement>('[data-parallax]'),
    );
    let ticking = false;
    const apply = () => {
      const y = window.scrollY;
      for (const layer of layers) {
        const depth = Number(layer.dataset.parallax) || 0;
        layer.style.transform = `translate3d(0, ${(y * depth).toFixed(1)}px, 0)`;
      }
      ticking = false;
    };
    window.addEventListener(
      'scroll',
      () => {
        if (!ticking) {
          ticking = true;
          window.requestAnimationFrame(apply);
        }
      },
      { passive: true },
    );
    apply();
  }
}

// ---- Inline SVG icons -------------------------------------------------------
// Kept as small, self-contained functions so the markup stays readable.

function icoPlay(): string {
  return svg('<path d="M8 5v14l11-7z" fill="currentColor"/>');
}

function icoGravity(): string {
  return svg(
    '<path d="M12 3v12M12 15l-4-4M12 15l4-4" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/><circle cx="12" cy="19" r="2.4" fill="currentColor"/>',
  );
}

function icoSwarm(): string {
  return svg(
    '<circle cx="7" cy="8" r="2.2" fill="currentColor"/><circle cx="13" cy="6.5" r="2.2" fill="currentColor" opacity=".8"/><circle cx="17.5" cy="10" r="2.2" fill="currentColor" opacity=".6"/><circle cx="9.5" cy="13.5" r="2.2" fill="currentColor" opacity=".75"/><circle cx="15" cy="15" r="2.2" fill="currentColor" opacity=".55"/><circle cx="6" cy="17.5" r="2.2" fill="currentColor" opacity=".4"/>',
  );
}

function icoArena(): string {
  return svg(
    '<circle cx="12" cy="12" r="8.5" stroke="currentColor" stroke-width="2" fill="none"/><path d="M12 3.5v17M3.5 12h17" stroke="currentColor" stroke-width="1.2" opacity=".5"/><circle cx="12" cy="12" r="2.6" fill="currentColor"/>',
  );
}

function icoPhantom(): string {
  return svg(
    '<path d="M4 13a8 8 0 0 1 16 0v6a1 1 0 0 1-1.6.8L16 18l-2 2-2-2-2 2-2.4-1.2A1 1 0 0 1 4 18z" fill="currentColor"/><circle cx="9.5" cy="11.5" r="1.3" fill="var(--panel)"/><circle cx="14.5" cy="11.5" r="1.3" fill="var(--panel)"/>',
  );
}

function icoPwa(): string {
  return svg(
    '<rect x="6" y="3" width="12" height="18" rx="2.5" stroke="currentColor" stroke-width="2" fill="none"/><path d="M9 6.5h6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><path d="M12 15l0 3M12 18l-1.5-1.5M12 18l1.5-1.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>',
  );
}

function icoDevices(): string {
  return svg(
    '<rect x="2.5" y="5" width="13" height="9" rx="1.5" stroke="currentColor" stroke-width="2" fill="none"/><rect x="15.5" y="9" width="6" height="10" rx="1.5" stroke="currentColor" stroke-width="2" fill="none"/><path d="M6 17.5h5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>',
  );
}

function icoKeyboard(): string {
  return svg(
    '<rect x="2.5" y="6" width="19" height="12" rx="2" stroke="currentColor" stroke-width="2" fill="none"/><path d="M7 10h.01M11 10h.01M15 10h.01M8 14h8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
  );
}

function icoTouch(): string {
  return svg(
    '<path d="M10 11V6.5a1.5 1.5 0 0 1 3 0V13l3 1a2 2 0 0 1 1.3 2.4l-.8 3A2 2 0 0 1 15.6 21H11a2 2 0 0 1-1.6-.8L5.5 15a1.6 1.6 0 0 1 2.3-2.2z" stroke="currentColor" stroke-width="2" fill="none" stroke-linejoin="round"/>',
  );
}

function svg(inner: string): string {
  return `<svg viewBox="0 0 24 24" width="24" height="24" role="img" focusable="false">${inner}</svg>`;
}

// Decorative saw-blade used in the parallax backdrop.
function bladeSvg(): string {
  const teeth = 12;
  let path = '';
  for (let i = 0; i < teeth; i++) {
    const a = (i / teeth) * Math.PI * 2;
    const x = 50 + Math.cos(a) * 50;
    const y = 50 + Math.sin(a) * 50;
    path += `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)} `;
    const a2 = ((i + 0.5) / teeth) * Math.PI * 2;
    const x2 = 50 + Math.cos(a2) * 38;
    const y2 = 50 + Math.sin(a2) * 38;
    path += `L${x2.toFixed(1)} ${y2.toFixed(1)} `;
  }
  return `<svg viewBox="0 0 100 100" width="100%" height="100%" aria-hidden="true">
    <path d="${path}Z" fill="currentColor"/>
    <circle cx="50" cy="50" r="10" fill="var(--bg)"/>
  </svg>`;
}

// Row of spikes for the backdrop edges.
function spikesSvg(): string {
  const n = 40;
  let path = 'M0 12 ';
  for (let i = 0; i < n; i++) {
    path += `L${((i + 0.5) / n * 100).toFixed(2)} 0 L${((i + 1) / n * 100).toFixed(2)} 12 `;
  }
  return `<svg viewBox="0 0 100 12" preserveAspectRatio="none" width="100%" height="100%" aria-hidden="true">
    <path d="${path}Z" fill="currentColor"/>
  </svg>`;
}

// A little cluster of ninja "chibi" heads for the hero art.
function swarmSvg(): string {
  const dots: { x: number; y: number; o: number }[] = [
    { x: 20, y: 20, o: 1 }, { x: 44, y: 12, o: 0.85 }, { x: 66, y: 22, o: 0.7 },
    { x: 32, y: 40, o: 0.9 }, { x: 56, y: 42, o: 0.6 }, { x: 12, y: 56, o: 0.5 },
    { x: 78, y: 48, o: 0.55 }, { x: 40, y: 66, o: 0.65 }, { x: 64, y: 68, o: 0.45 },
  ];
  const heads = dots.map(
    (d, i) => `<g transform="translate(${d.x} ${d.y})" opacity="${d.o}" style="--i:${i}" class="lp-swarm__head">
      <rect x="-6" y="-6" width="12" height="14" rx="4" fill="currentColor"/>
      <rect x="-4" y="-2" width="8" height="3.4" rx="1.7" fill="var(--bg)"/>
    </g>`,
  ).join('');
  return `<svg viewBox="0 0 100 90" width="100%" height="100%" aria-hidden="true">${heads}</svg>`;
}
