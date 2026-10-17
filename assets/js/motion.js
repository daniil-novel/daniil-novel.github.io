/*
 * Obsidian motion — local, dependency-free, progressive enhancement.
 * Load with <script src="assets/js/motion.js" defer></script>.
 *
 * Markup contract:
 *   <span class="motion-line"><span data-intro="line">Daniil</span></span>
 *   <p data-intro="fade">...</p>
 *   <figure data-intro="photo">
 *     <div data-parallax-frame><img data-parallax ...></div><figcaption>...</figcaption>
 *   </figure>
 *   <header data-reveal>...</header>
 *   <article data-reveal data-reveal-delay="60">...</article>
 *   <a data-nav href="#research"><span data-underline>Research</span></a>
 *   <a href="..."><span data-underline>CV</span><span data-arrow="diagonal">↗</span></a>
 *   <div data-progress aria-hidden="true"></div>
 *   <button data-motion-toggle aria-pressed="true" aria-label="Animations">
 *     <span data-motion-text>Motion: on</span>
 *   </button>
 *
 * data-intro and data-reveal must be distinct nodes. Intro line masks are layout
 * wrappers; do not put data-parallax and data-intro on the same node. Parallax
 * belongs on the image inside its own clipping frame, never on the caption.
 * Visible content is NEVER hidden by CSS. Reveal animations run once per visit.
 * A broken/unsupported animation path cancels all effects and leaves content visible.
 */
(() => {
  'use strict';

  if (window.ResearchMotion) return;

  const STORAGE_KEY = 'daniil-research-motion';
  const EASE = 'cubic-bezier(0.16, 1, 0.3, 1)';
  const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
  let booted = false;

  function boot() {
    if (booted) return;
    booted = true;

    const root = document.documentElement;
    const introItems = [...document.querySelectorAll('[data-intro]')];
    const revealItems = [...document.querySelectorAll('[data-reveal]')];
    const toggleButtons = [...document.querySelectorAll('[data-motion-toggle]')];
    const progressBars = [...document.querySelectorAll('[data-progress]')];
    const parallaxItems = [...document.querySelectorAll('[data-parallax]')];
    const navItems = [...document.querySelectorAll('[data-nav]')];
    const seen = new WeakSet();
    const active = new Map();
    const parallax = parallaxItems.map(element => ({
      element,
      frame: element.closest('[data-parallax-frame]') || element.parentElement,
      current: 0,
      target: 0
    }));

    let events;
    let reduced;
    let desktop;
    let observer;
    let resizeObserver;
    let enabled = false;
    let failed = false;
    let destroyed = false;
    let manualChoice = null;
    let reason = 'initializing';
    let raf = 0;
    let firstPass = true;
    let lastProgress = -1;
    let lastNav = null;
    let still = false;

    function cancelAnimations() {
      for (const record of active.values()) {
        try { record.animation.cancel(); } catch (_) { /* Content has a visible base state. */ }
        record.element.classList.remove('is-motion-running');
      }
      active.clear();
    }

    function resetParallax() {
      for (const item of parallax) {
        item.current = 0;
        item.target = 0;
        item.element.classList.remove('is-motion-parallax');
        item.element.style.removeProperty('--motion-parallax-y');
      }
    }

    function syncButtons() {
      const locked = failed || destroyed || still || reason === 'unsupported' || Boolean(reduced?.matches);
      for (const button of toggleButtons) {
        const text = button.querySelector('[data-motion-text]') || button;
        text.textContent = `Motion: ${enabled ? 'on' : 'off'}`;
        button.setAttribute('aria-pressed', String(enabled));
        button.setAttribute('aria-label', button.dataset.motionLabel || 'Animations');
        button.setAttribute('aria-disabled', String(locked));
        if (still) button.title = 'Animation is disabled in the static preview.';
        else if (reduced?.matches) button.title = 'Reduced motion is enabled in your system settings.';
        else if (failed || destroyed || reason === 'unsupported') button.title = 'Animation is unavailable; all content remains visible.';
        else button.title = enabled ? 'Turn animations off' : 'Turn animations on';
      }
    }

    function failOpen(error) {
      if (failed || destroyed) return;
      failed = true;
      enabled = false;
      reason = 'error';
      root.dataset.motion = 'off';
      root.dataset.motionReason = reason;
      root.classList.remove('motion-ready');
      cancelAnimationFrame(raf);
      raf = 0;
      observer?.disconnect();
      resizeObserver?.disconnect();
      events?.abort();
      cancelAnimations();
      resetParallax();
      syncButtons();
      // The site remains fully readable and all native links keep working.
      if (window.console?.warn) console.warn('[motion] Effects disabled; content remains visible.', error);
    }

    function guarded(callback) {
      return (...args) => {
        if (failed || destroyed) return;
        try { return callback(...args); } catch (error) { failOpen(error); }
      };
    }

    function listen(target, type, callback, options = {}) {
      target.addEventListener(type, guarded(callback), { ...options, signal: events.signal });
    }

    function finishRecord(record) {
      try { record.animation.cancel(); } catch (_) { /* Base styles are visible. */ }
      if (active.get(record.element) === record) {
        active.delete(record.element);
        record.element.classList.remove('is-motion-running');
      }
    }

    function makeVisible(node) {
      for (const record of [...active.values()]) {
        if (record.element === node || record.element.contains(node) || node.contains?.(record.element)) {
          finishRecord(record);
        }
      }
      const group = node.closest?.('[data-reveal]');
      if (group) seen.add(group);
    }

    function play(element, keyframes, timing, kind) {
      if (!enabled || document.hidden) return;
      const previous = active.get(element);
      if (previous) finishRecord(previous);
      element.classList.add('is-motion-running');
      const animation = element.animate(keyframes, {
        easing: EASE,
        fill: 'backwards',
        ...timing
      });
      const record = { animation, element, kind };
      active.set(element, record);
      const clean = () => {
        if (active.get(element) !== record) return;
        active.delete(element);
        element.classList.remove('is-motion-running');
      };
      // Cancellation rejects finished; handling both paths prevents unhandled rejections.
      animation.finished.then(clean, clean);
    }

    function delayFrom(element, key, fallback, maximum) {
      const value = Number(element.dataset[key]);
      return element.dataset[key] !== undefined && Number.isFinite(value)
        ? clamp(value, 0, maximum)
        : fallback;
    }

    function intro() {
      if (!enabled || document.hidden || window.scrollY > 12 || location.hash) return;
      introItems.forEach((element, index) => {
        if (element.closest('[data-reveal]')) return;
        const kind = element.dataset.intro || 'fade';
        if (kind === 'line') {
          play(element, [
            { opacity: 0.08, transform: 'translate3d(0, 108%, 0)' },
            { opacity: 1, transform: 'none' }
          ], { duration: 900, delay: delayFrom(element, 'introDelay', Math.min(index * 65, 260), 450) }, 'intro');
        } else if (kind === 'photo') {
          play(element, [
            { opacity: 0, transform: 'translate3d(0, 14px, 0)' },
            { opacity: 1, transform: 'none' }
          ], { duration: 1050, delay: delayFrom(element, 'introDelay', 150, 450) }, 'intro');
        } else {
          play(element, [
            { opacity: 0, transform: 'translate3d(0, 12px, 0)' },
            { opacity: 1, transform: 'none' }
          ], { duration: 720, delay: delayFrom(element, 'introDelay', Math.min(index * 55, 330), 450) }, 'intro');
        }
      });
    }

    function reveal(element, rect) {
      if (seen.has(element)) return;
      seen.add(element);
      if (!enabled || document.hidden) return;
      const height = document.documentElement.clientHeight || window.innerHeight;
      // Skip an entrance if fast scrolling/anchor navigation already put it in the reading area.
      if (rect.top < height * 0.78 || rect.bottom <= 0 || element.contains(document.activeElement)) return;
      play(element, [
        { opacity: 0, transform: 'translate3d(0, 18px, 0)' },
        { opacity: 1, transform: 'none' }
      ], { duration: 760, delay: delayFrom(element, 'revealDelay', 0, 140) }, 'reveal');
    }

    function watchReveals() {
      observer?.disconnect();
      if (!enabled) return;
      observer = new IntersectionObserver(guarded(entries => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          reveal(entry.target, entry.boundingClientRect);
          observer.unobserve(entry.target);
        }
      }), { threshold: 0, rootMargin: '0px 0px 36px 0px' });
      const height = document.documentElement.clientHeight || window.innerHeight;
      for (const element of revealItems) {
        const rect = element.getBoundingClientRect();
        if (rect.top < height && rect.bottom > 0) seen.add(element);
        if (!seen.has(element)) observer.observe(element);
      }
    }

    function configureParallax() {
      const available = enabled && desktop.matches;
      for (const item of parallax) {
        item.element.classList.toggle('is-motion-parallax', available);
        if (!available) {
          item.current = item.target = 0;
          item.element.style.removeProperty('--motion-parallax-y');
        }
      }
    }

    function configure() {
      const supported = typeof Element.prototype.animate === 'function'
        && typeof IntersectionObserver === 'function';
      reason = still ? 'still' : reduced.matches ? 'system' : !supported ? 'unsupported'
        : manualChoice === 'off' ? 'user' : 'enabled';
      enabled = !failed && !destroyed && reason === 'enabled';
      root.dataset.motion = enabled ? 'on' : 'off';
      root.dataset.motionReason = reason;
      root.classList.add('motion-ready');
      cancelAnimations();
      observer?.disconnect();
      syncButtons();
      configureParallax();
      watchReveals();
      schedule();
    }

    const sections = [];
    function collectSections() {
      sections.length = 0;
      for (const link of navItems) {
        try {
          const url = new URL(link.getAttribute('href'), location.href);
          if (url.origin !== location.origin || url.pathname !== location.pathname || !url.hash) continue;
          const id = decodeURIComponent(url.hash.slice(1));
          const element = document.getElementById(id);
          if (element) sections.push({ link, id, element });
        } catch (_) { /* A malformed or external navigation URL is not a motion target. */ }
      }
    }

    function updateFrame() {
      raf = 0;
      if (document.hidden || failed || destroyed) return;
      const height = document.documentElement.clientHeight || window.innerHeight;
      const scroll = window.scrollY || 0;
      const total = Math.max(0, root.scrollHeight - height);
      const progress = total ? clamp(scroll / total, 0, 1) : 0;
      let activeId = null;
      let activeTop = -Infinity;

      // Finish all layout reads before making writes.
      for (const section of sections) {
        const top = section.element.getBoundingClientRect().top;
        if (top <= height * 0.32 && top >= activeTop) {
          activeTop = top;
          activeId = section.id;
        }
      }
      if (scroll + height >= root.scrollHeight - 6 && sections.length) {
        activeId = sections[sections.length - 1].id;
      }

      const complete = [];
      for (const record of active.values()) {
        if (record.kind === 'intro' && scroll > 30) complete.push(record);
        else if (record.kind === 'reveal' && record.element.getBoundingClientRect().top < height * 0.62) {
          complete.push(record);
        }
      }

      let moving = false;
      const photoWrites = [];
      if (enabled && desktop.matches) {
        for (const item of parallax) {
          const rect = item.frame.getBoundingClientRect();
          if (rect.bottom <= 0 || rect.top >= height || rect.height <= 0) {
            item.current = item.target = 0;
          } else {
            const amplitude = Math.min(12, rect.height * 0.018);
            item.target = clamp((height * 0.5 - (rect.top + rect.height * 0.5)) / (height * 0.8), -1, 1) * amplitude;
            item.current += (item.target - item.current) * 0.13;
            if (Math.abs(item.target - item.current) < 0.015) item.current = item.target;
            else moving = true;
          }
          photoWrites.push([item.element, item.current]);
        }
      }

      for (const record of complete) finishRecord(record);
      if (Math.abs(progress - lastProgress) > 0.00005) {
        for (const element of progressBars) element.style.setProperty('--reading-progress', progress.toFixed(5));
        lastProgress = progress;
      }
      if (lastNav !== activeId || firstPass) {
        for (const section of sections) {
          if (section.id === activeId) section.link.setAttribute('aria-current', 'location');
          else section.link.removeAttribute('aria-current');
        }
        lastNav = activeId;
      }
      for (const [element, value] of photoWrites) {
        element.style.setProperty('--motion-parallax-y', `${value.toFixed(3)}px`);
      }
      firstPass = false;
      if (moving) schedule();
    }

    function schedule() {
      if (!raf && !failed && !destroyed && !document.hidden) raf = requestAnimationFrame(guarded(updateFrame));
    }

    function setEnabled(value, persist = true) {
      if (failed || destroyed) return;
      manualChoice = value ? 'on' : 'off';
      if (persist) {
        try { localStorage.setItem(STORAGE_KEY, manualChoice); } catch (_) { /* File/private contexts may deny storage. */ }
      }
      configure();
    }

    function destroy() {
      if (destroyed) return;
      enabled = false;
      reason = 'destroyed';
      root.dataset.motion = 'off';
      root.dataset.motionReason = reason;
      root.classList.remove('motion-ready');
      cancelAnimationFrame(raf);
      raf = 0;
      observer?.disconnect();
      resizeObserver?.disconnect();
      events?.abort();
      cancelAnimations();
      resetParallax();
      destroyed = true;
      syncButtons();
    }

    window.ResearchMotion = Object.freeze({
      setEnabled: guarded(setEnabled),
      refresh: guarded(() => { collectSections(); lastNav = null; watchReveals(); schedule(); }),
      destroy,
      getState: () => ({ enabled, reason, activeAnimations: active.size, still, failed, destroyed })
    });

    try {
      events = new AbortController();
      reduced = matchMedia('(prefers-reduced-motion: reduce)');
      desktop = matchMedia('(min-width: 960px) and (hover: hover) and (pointer: fine)');
      still = new URLSearchParams(location.search).get('view') === 'still';
      try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved === 'on' || saved === 'off') manualChoice = saved;
      } catch (_) { /* A storage denial must not affect rendering. */ }

      collectSections();
      configure();
      intro();
      for (const button of toggleButtons) {
        listen(button, 'click', event => {
          if (button.getAttribute('aria-disabled') === 'true') {
            event.preventDefault();
            return;
          }
          setEnabled(!enabled);
        });
      }
      listen(reduced, 'change', configure);
      listen(desktop, 'change', () => { configureParallax(); schedule(); });
      listen(document, 'focusin', event => makeVisible(event.target));
      listen(window, 'scroll', schedule, { passive: true });
      listen(window, 'resize', schedule, { passive: true });
      listen(window, 'hashchange', schedule);
      listen(window, 'pageshow', schedule);
      listen(window, 'pagehide', () => {
        cancelAnimationFrame(raf);
        raf = 0;
        cancelAnimations();
      });
      listen(document, 'visibilitychange', () => {
        if (document.hidden) {
          cancelAnimationFrame(raf);
          raf = 0;
          cancelAnimations();
        } else schedule();
      });
      if (typeof ResizeObserver === 'function' && document.body) {
        resizeObserver = new ResizeObserver(guarded(schedule));
        resizeObserver.observe(document.body);
      }
    } catch (error) {
      failOpen(error);
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
