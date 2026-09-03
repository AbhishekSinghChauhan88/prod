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
        this.group = this.querySelector('.marquee__group');
        if (!this.track || !this.group) return;

        this.fill();
        this.resizeObserver = new ResizeObserver(debounce(() => this.fill(), 200));
        this.resizeObserver.observe(this);
      }

      disconnectedCallback() {
        this.resizeObserver?.disconnect();
      }

      /**
       * The CSS animation translates the track by -50%, so the track must hold
       * exactly two identical groups, each at least as wide as the element.
       */
      fill() {
        this.track.querySelectorAll('.marquee__group').forEach((group, index) => {
          if (index > 0) group.remove();
        });

        const originalItems = Array.from(this.group.children).map((child) => child.cloneNode(true));
        if (originalItems.length === 0) return;

        let guard = 0;
        while (this.group.scrollWidth < this.offsetWidth && guard < 20) {
          originalItems.forEach((item) => this.group.appendChild(item.cloneNode(true)));
          guard += 1;
        }

        const clone = this.group.cloneNode(true);
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
        this.select = this.querySelector('[data-sticky-variant]');
        this.priceTarget = this.querySelector('[data-sticky-price]');
        this.variantInput = this.querySelector('input[name="id"]');
        this.submitButton = this.querySelector('[type="submit"]');

        this.observeTrigger();
        this.select?.addEventListener('change', () => this.onSelectChange());

        // Keep in step with the main product form's variant picker.
        this.unsubscribe = subscribe(PUB_SUB_EVENTS.variantChange, ({ data }) => {
          if (!data?.variant) return;
          this.applyVariant(String(data.variant.id));
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

      onSelectChange() {
        const option = this.select.selectedOptions[0];
        if (!option) return;
        this.applyVariant(option.value, option);
      }

      applyVariant(variantId, knownOption) {
        if (this.select && this.select.value !== variantId) {
          const match = Array.from(this.select.options).find((option) => option.value === variantId);
          if (match) this.select.value = variantId;
        }

        if (this.variantInput) this.variantInput.value = variantId;

        const option = knownOption || Array.from(this.select?.options || []).find((item) => item.value === variantId);
        if (!option) return;

        if (this.priceTarget && option.dataset.price) this.priceTarget.textContent = option.dataset.price;

        const available = option.dataset.available === 'true';
        if (this.submitButton) {
          this.submitButton.disabled = !available;
          const label = this.submitButton.querySelector('[data-sticky-submit-text]');
          if (label) {
            label.textContent = available ? this.dataset.addToCartText : this.dataset.soldOutText;
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
        this.classList.add('is-open');
        this.openedBy = document.activeElement;
        document.body.classList.add('overflow-hidden');
        trapFocus(this, this.querySelector('input, button'));
      }

      close() {
        this.classList.remove('is-open');
        document.body.classList.remove('overflow-hidden');
        removeTrapFocus(this.openedBy);
        if (!window.Shopify?.designMode) this.suppress();
      }
    }
  );
}
