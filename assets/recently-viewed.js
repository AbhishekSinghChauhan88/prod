/**
 * Recently viewed products.
 *
 * <recently-viewed-tracker> records the product being viewed;
 * <recently-viewed-products> renders the rest of the list.
 */
if (!customElements.get('recently-viewed-tracker')) {
  customElements.define(
    'recently-viewed-tracker',
    class RecentlyViewedTracker extends HTMLElement {
      connectedCallback() {
        const handle = this.dataset.productHandle;
        if (handle) window.ThemeProductLists.recentlyViewed.add(handle);
      }
    }
  );
}

if (!customElements.get('recently-viewed-products')) {
  customElements.define(
    'recently-viewed-products',
    class RecentlyViewedProducts extends HTMLElement {
      connectedCallback() {
        // Rendering is deferred until the section is close to the viewport so a
        // list of card requests never competes with the initial page load.
        const observer = new IntersectionObserver(
          (entries, obs) => {
            if (!entries[0].isIntersecting) return;
            obs.disconnect();
            this.render();
          },
          { rootMargin: '0px 0px 400px 0px' }
        );
        observer.observe(this);
      }

      async render() {
        const exclude = this.dataset.excludeHandle;
        const limit = parseInt(this.dataset.limit, 10) || 6;
        const handles = window.ThemeProductLists.recentlyViewed
          .read()
          .filter((handle) => handle !== exclude)
          .slice(0, limit);

        const minimum = parseInt(this.dataset.minimum, 10) || 1;
        if (handles.length < minimum) return;

        const cards = await window.ThemeProductLists.renderCards(handles, this.dataset.cardSection || 'wishlist-card');
        if (cards.length < minimum) return;

        const grid = this.querySelector('[data-recently-viewed-grid]');
        if (!grid) return;

        cards.forEach((card) => {
          const item = document.createElement('li');
          item.className = `grid__item ${this.dataset.itemClass || ''}`.trim();
          item.appendChild(card);
          grid.appendChild(item);
        });

        this.removeAttribute('hidden');
        this.closest('.recently-viewed-section')?.removeAttribute('hidden');
      }
    }
  );
}
