/**
 * UX behaviours for the added sections and storefront features.
 *
 * Every element degrades gracefully: without JavaScript the markup still shows
 * its server-rendered content, and each custom element is registered defensively
 * so a duplicated script tag can never throw.
 */

/* -------------------------------------------------------------------------
   Countdown timer
   ------------------------------------------------------------------------- */
if (!customElements.get('countdown-timer')) {
  customElements.define(
    'countdown-timer',
    class CountdownTimer extends HTMLElement {
      connectedCallback() {
        this.endTime = Date.parse(this.dataset.endTime);
        if (Number.isNaN(this.endTime)) return;

        this.units = {
          days: this.querySelector('[data-unit="days"]'),
          hours: this.querySelector('[data-unit="hours"]'),
          minutes: this.querySelector('[data-unit="minutes"]'),
          seconds: this.querySelector('[data-unit="seconds"]'),
        };

        this.tick();
        this.interval = setInterval(() => this.tick(), 1000);
      }

      disconnectedCallback() {
        clearInterval(this.interval);
      }

      tick() {
        const remaining = this.endTime - Date.now();

        if (remaining <= 0) {
          clearInterval(this.interval);
          this.setValues(0, 0, 0, 0);
          this.onExpired();
          return;
        }

        const totalSeconds = Math.floor(remaining / 1000);
        this.setValues(
          Math.floor(totalSeconds / 86400),
          Math.floor((totalSeconds % 86400) / 3600),
          Math.floor((totalSeconds % 3600) / 60),
          totalSeconds % 60
        );
      }

      setValues(days, hours, minutes, seconds) {
        const pad = (value) => String(value).padStart(2, '0');
        if (this.units.days) this.units.days.textContent = days;
        if (this.units.hours) this.units.hours.textContent = pad(hours);
        if (this.units.minutes) this.units.minutes.textContent = pad(minutes);
        if (this.units.seconds) this.units.seconds.textContent = pad(seconds);
      }

      onExpired() {
        const behaviour = this.dataset.onExpire;
        const container = this.closest('[data-countdown-container]') || this;

        if (behaviour === 'hide') {
          container.hidden = true;
        } else if (behaviour === 'message') {
          this.hidden = true;
          container.querySelector('[data-countdown-expired]')?.removeAttribute('hidden');
        }

        this.dispatchEvent(new CustomEvent('countdown:expired', { bubbles: true }));
      }
    }
  );
}

/* -------------------------------------------------------------------------
   Animated statistics
   ------------------------------------------------------------------------- */
if (!customElements.get('stat-counter')) {
  customElements.define(
    'stat-counter',
    class StatCounter extends HTMLElement {
      connectedCallback() {
        this.target = parseFloat(this.dataset.value);
        if (Number.isNaN(this.target)) return;

        this.decimals = (this.dataset.value.split('.')[1] || '').length;

        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
          this.setValue(this.target);
          return;
        }

        this.setValue(0);
        const observer = new IntersectionObserver(
          (entries, obs) => {
            if (!entries[0].isIntersecting) return;
            obs.disconnect();
            this.animate();
          },
          { threshold: 0.4 }
        );
        observer.observe(this);
      }

      animate() {
        const duration = parseInt(this.dataset.duration, 10) || 1600;
        const start = performance.now();

        const step = (now) => {
          const progress = Math.min((now - start) / duration, 1);
          // Ease-out cubic so the number settles instead of stopping abruptly.
          const eased = 1 - Math.pow(1 - progress, 3);
          this.setValue(this.target * eased);
          if (progress < 1) requestAnimationFrame(step);
        };

        requestAnimationFrame(step);
      }

      setValue(value) {
        const rounded = this.decimals > 0 ? value.toFixed(this.decimals) : Math.round(value);
        this.textContent = Number(rounded).toLocaleString(document.documentElement.lang || undefined, {
          minimumFractionDigits: this.decimals,
          maximumFractionDigits: this.decimals,
        });
      }
    }
  );
}

/* -------------------------------------------------------------------------
   Before / after image comparison
   ------------------------------------------------------------------------- */
if (!customElements.get('image-comparison')) {
  customElements.define(
    'image-comparison',
    class ImageComparison extends HTMLElement {
      connectedCallback() {
        this.range = this.querySelector('input[type="range"]');
        if (!this.range) return;

        this.setPosition(this.range.value);
        this.range.addEventListener('input', () => this.setPosition(this.range.value));

        // Dragging anywhere on the image feels more natural than only the handle.
        this.addEventListener('pointerdown', this.onPointerDown.bind(this));
      }

      onPointerDown(event) {
        if (event.target === this.range) return;
        this.movePointer(event);

        const onMove = (moveEvent) => this.movePointer(moveEvent);
        const onUp = () => {
          window.removeEventListener('pointermove', onMove);
          window.removeEventListener('pointerup', onUp);
        };

        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp);
      }

      movePointer(event) {
        const bounds = this.getBoundingClientRect();
        const percent = ((event.clientX - bounds.left) / bounds.width) * 100;
        const clamped = Math.min(100, Math.max(0, percent));
        this.range.value = clamped;
        this.setPosition(clamped);
      }

      setPosition(value) {
        this.style.setProperty('--comparison-position', `${value}%`);
        this.range.setAttribute('aria-valuenow', Math.round(value));
      }
    }
  );
}

/* -------------------------------------------------------------------------
   Scrolling marquee
   ------------------------------------------------------------------------- */
if (!customElements.get('scrolling-marquee')) {
  customElements.define(
    'scrolling-marquee',
    class ScrollingMarquee extends HTMLElement {
      connectedCallback() {
        this.track = this.querySelector('.marquee__track');
        const group = this.querySelector('.marquee__group');
        if (!this.track || !group || group.children.length === 0) return;

        // Snapshot the authored items once. Every rebuild starts from this
        // pristine set, so repeated calls can never compound on their own output.
        this.sourceItems = Array.from(group.children).map((child) => child.cloneNode(true));
        this.lastWidth = 0;

        this.fill();

        // fill() writes to this element's own subtree, so an unguarded observer
        // would retrigger itself forever. Only an actual width change rebuilds,
        // and the work is deferred to the next frame to stay out of the
        // observer's own layout pass.
        this.resizeObserver = new ResizeObserver((entries) => {
          const width = Math.round(entries[0].contentRect.width);
          if (width === this.lastWidth) return;
          cancelAnimationFrame(this.frame);
          this.frame = requestAnimationFrame(() => this.fill());
        });
        this.resizeObserver.observe(this);
      }

      disconnectedCallback() {
        this.resizeObserver?.disconnect();
        cancelAnimationFrame(this.frame);
      }

      /**
       * The CSS animation translates the track by -50%, so the track must hold
       * exactly two identical groups, each at least as wide as the element.
       */
      fill() {
        const width = this.offsetWidth;
        if (width === 0) return;
        this.lastWidth = Math.round(width);

        const group = document.createElement('div');
        group.className = 'marquee__group';
        this.sourceItems.forEach((item) => group.appendChild(item.cloneNode(true)));

        this.track.replaceChildren(group);

        let guard = 0;
        while (group.scrollWidth < width && guard < 20) {
          this.sourceItems.forEach((item) => group.appendChild(item.cloneNode(true)));
          guard += 1;
        }

        const clone = group.cloneNode(true);
        clone.setAttribute('aria-hidden', 'true');
        this.track.appendChild(clone);
      }
    }
  );
}

/* -------------------------------------------------------------------------
   Back to top
   ------------------------------------------------------------------------- */
if (!customElements.get('back-to-top')) {
  customElements.define(
    'back-to-top',
    class BackToTop extends HTMLElement {
      connectedCallback() {
        this.threshold = parseInt(this.dataset.threshold, 10) || 600;
        this.onScroll = throttle(() => {
          this.classList.toggle('is-visible', window.scrollY > this.threshold);
        }, 150);

        window.addEventListener('scroll', this.onScroll, { passive: true });
        this.onScroll();

        this.querySelector('button')?.addEventListener('click', () => {
          window.scrollTo({ top: 0, behavior: 'smooth' });
          document.querySelector('.skip-to-content-link')?.focus({ preventScroll: true });
        });
      }

      disconnectedCallback() {
        window.removeEventListener('scroll', this.onScroll);
      }
    }
  );
}

/* -------------------------------------------------------------------------
   Sticky add to cart
   ------------------------------------------------------------------------- */
if (!customElements.get('sticky-atc')) {
  customElements.define(
    'sticky-atc',
    class StickyAtc extends HTMLElement {
      connectedCallback() {
        this.priceTarget = this.querySelector('[data-sticky-price]');
        this.variantInput = this.querySelector('input[name="id"]');
        this.submitButton = this.querySelector('[type="submit"]');

        this.observeTrigger();

        // The bar carries no picker of its own; it follows the main product
        // form's variant selection.
        this.unsubscribe = subscribe(PUB_SUB_EVENTS.variantChange, ({ data }) => {
          if (!data?.variant) return;
          this.applyVariant(data.variant);
        });
      }

      disconnectedCallback() {
        this.unsubscribe?.();
        this.observer?.disconnect();
      }

      observeTrigger() {
        // The bar appears once the in-page buy buttons have scrolled away. The
        // main product form always renders inside <main>, so scoping the lookup
        // there avoids matching this bar's own submit button.
        const trigger = document.querySelector(
          '#MainContent .product-form__submit:not(.sticky-atc__button)'
        );

        if (!trigger) {
          this.classList.add('is-visible');
          return;
        }

        this.observer = new IntersectionObserver(
          (entries) => {
            const entry = entries[0];
            const scrolledPast = !entry.isIntersecting && entry.boundingClientRect.top < 0;
            this.classList.toggle('is-visible', scrolledPast);
          },
          { threshold: 0 }
        );
        this.observer.observe(trigger);
      }

      applyVariant(variant) {
        if (this.variantInput) this.variantInput.value = variant.id;

        // Mirror whatever the main product info is showing rather than
        // formatting money here — it is already correct and localized. Read on
        // the next frame so the main price has certainly been swapped in.
        if (this.priceTarget) {
          requestAnimationFrame(() => {
            const mainPrice = document.querySelector('.product__info-container .price');
            if (mainPrice) this.priceTarget.innerHTML = mainPrice.innerHTML;
          });
        }

        if (this.submitButton) {
          this.submitButton.disabled = !variant.available;
          const label = this.submitButton.querySelector('[data-sticky-submit-text]');
          if (label) {
            label.textContent = variant.available ? this.dataset.addToCartText : this.dataset.soldOutText;
          }
        }
      }
    }
  );
}

/* -------------------------------------------------------------------------
   Newsletter popup
   ------------------------------------------------------------------------- */
if (!customElements.get('newsletter-popup')) {
  customElements.define(
    'newsletter-popup',
    class NewsletterPopup extends HTMLElement {
      connectedCallback() {
        this.storageKey = `theme:newsletter-popup:${this.dataset.sectionId}`;
        this.dismissDays = parseInt(this.dataset.dismissDays, 10) || 14;

        // The theme editor should always show the popup being edited.
        if (window.Shopify?.designMode) {
          this.open();
          this.bindClose();
          return;
        }

        if (this.isSuppressed()) return;

        this.bindClose();

        // A successful signup redirects back with ?customer_posted=true.
        if (new URLSearchParams(window.location.search).get('customer_posted') === 'true') {
          this.suppress();
          return;
        }

        const delay = (parseInt(this.dataset.delay, 10) || 5) * 1000;
        this.timeout = setTimeout(() => this.open(), delay);
      }

      disconnectedCallback() {
        clearTimeout(this.timeout);
      }

      bindClose() {
        this.querySelectorAll('[data-popup-close]').forEach((element) => {
          element.addEventListener('click', () => this.close());
        });
        this.addEventListener('keydown', (event) => {
          if (event.key === 'Escape') this.close();
        });
      }

      isSuppressed() {
        try {
          const until = parseInt(localStorage.getItem(this.storageKey), 10);
          return Boolean(until) && Date.now() < until;
        } catch (error) {
          return false;
        }
      }

      suppress() {
        try {
          localStorage.setItem(this.storageKey, String(Date.now() + this.dismissDays * 86400000));
        } catch (error) {
          // Non-fatal: the popup simply shows again next visit.
        }
      }

      open() {
        // The cart drawer, menu drawer and modals all share body.overflow-hidden
        // and a single global focus trap. Opening on top of one of them would
        // steal the trap and, on close, unlock scrolling while the drawer is
        // still up — so wait for the coast to clear instead.
        if (document.body.classList.contains('overflow-hidden')) {
          if (!window.Shopify?.designMode) {
            this.timeout = setTimeout(() => this.open(), 2000);
            return;
          }
        } else {
          this.lockedScroll = true;
          document.body.classList.add('overflow-hidden');
        }

        this.classList.add('is-open');
        this.openedBy = document.activeElement;
        trapFocus(this, this.querySelector('input, button'));
      }

      close() {
        this.classList.remove('is-open');
        // Only release the lock this popup took, never one owned by a drawer.
        if (this.lockedScroll) {
          document.body.classList.remove('overflow-hidden');
          this.lockedScroll = false;
        }
        removeTrapFocus(this.openedBy);
        if (!window.Shopify?.designMode) this.suppress();
      }
    }
  );
}

/* -------------------------------------------------------------------------
   Cart resilience

   Two failure modes this recovers from:

   1. The checkout button has no state of its own in Dawn, so a submission that
      never completes — a failed POST, a checkout that bounces the shopper back —
      leaves it looking like it is still working with no way to retry.

   2. Overlay state is stored on <body> and on shared classes. When the browser
      restores this page from the back/forward cache it replays that state
      verbatim, so a scroll lock or a focus trap that was live at navigation
      time comes back with nothing left on screen to release it. The page then
      refuses to scroll.

   Both are cleared on every pageshow, and the busy state additionally expires
   on a timer for the case where no navigation happens at all.
   ------------------------------------------------------------------------- */
(() => {
  const CHECKOUT_TIMEOUT = 12000;
  let busyTimer;

  const resetCheckoutButtons = () => {
    clearTimeout(busyTimer);
    document.querySelectorAll('.cart__checkout-button').forEach((button) => {
      button.removeAttribute('aria-busy');
      button.classList.remove('loading');
      button.querySelector('.loading__spinner')?.classList.add('hidden');
    });
  };

  // Everything that takes the plain body.overflow-hidden lock. The menu drawer
  // is deliberately absent: it uses the breakpoint-scoped variant instead.
  const anyOverlayOpen = () =>
    document.querySelector(
      'cart-drawer.active, newsletter-popup.is-open, modal-dialog[open], details-modal details[open], pickup-availability-drawer[open]'
    );

  const releaseStuckState = () => {
    // Never unlock while something is genuinely open — that would let the page
    // behind an open drawer scroll.
    if (!anyOverlayOpen()) {
      document.body.classList.remove('overflow-hidden');
      if (typeof removeTrapFocus === 'function') removeTrapFocus();
    }

    document
      .querySelectorAll('.cart__items--disabled')
      .forEach((element) => element.classList.remove('cart__items--disabled'));
  };

  document.addEventListener('click', (event) => {
    const button = event.target.closest('.cart__checkout-button');
    if (!button) return;

    // Swallow repeat taps while a submission is already in flight, rather than
    // disabling the button — disabling a submit button during its own click
    // cancels the submission in some browsers.
    if (button.getAttribute('aria-busy') === 'true') {
      event.preventDefault();
      return;
    }

    // Let the browser's own validation messaging happen without a busy state.
    const form = button.form;
    if (form && typeof form.checkValidity === 'function' && !form.checkValidity()) return;

    button.setAttribute('aria-busy', 'true');
    busyTimer = setTimeout(resetCheckoutButtons, CHECKOUT_TIMEOUT);
  });

  window.addEventListener('pageshow', () => {
    resetCheckoutButtons();
    releaseStuckState();
  });
})();
