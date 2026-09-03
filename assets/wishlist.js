/**
 * Wishlist — saves products to localStorage, no account or app required.
 *
 * <wishlist-button data-product-handle="tee"> toggles membership,
 * <wishlist-count> mirrors the total in the header, and
 * <wishlist-list> renders the saved products on the wishlist page.
 */
if (!customElements.get('wishlist-button')) {
  customElements.define(
    'wishlist-button',
    class WishlistButton extends HTMLElement {
      constructor() {
        super();
        this.store = window.ThemeProductLists.wishlist;
        this.button = this.querySelector('button');
        this.handle = this.dataset.productHandle;
        this.onStoreChange = this.render.bind(this);
      }

      connectedCallback() {
        this.render();
        this.button?.addEventListener('click', this.onClick.bind(this));
        document.addEventListener('theme:wishlist:change', this.onStoreChange);
      }

      disconnectedCallback() {
        document.removeEventListener('theme:wishlist:change', this.onStoreChange);
      }

      onClick(event) {
        event.preventDefault();
        event.stopPropagation();
        if (!this.handle) return;

        const added = this.store.toggle(this.handle);
        this.render();

        const message = added ? this.dataset.addedText : this.dataset.removedText;
        if (message) this.announce(message);
      }

      render() {
        if (!this.button || !this.handle) return;
        const saved = this.store.has(this.handle);

        this.button.setAttribute('aria-pressed', saved ? 'true' : 'false');
        this.button.setAttribute('aria-label', saved ? this.dataset.removeLabel || '' : this.dataset.addLabel || '');

        const label = this.querySelector('[data-wishlist-label]');
        if (label) label.textContent = saved ? this.dataset.savedText || '' : this.dataset.saveText || '';
      }

      announce(message) {
        let region = document.getElementById('WishlistLiveRegion');
        if (!region) {
          region = document.createElement('div');
          region.id = 'WishlistLiveRegion';
          region.setAttribute('role', 'status');
          region.setAttribute('aria-live', 'polite');
          region.className = 'visually-hidden';
          document.body.appendChild(region);
        }
        region.textContent = message;
      }
    }
  );
}

if (!customElements.get('wishlist-count')) {
  customElements.define(
    'wishlist-count',
    class WishlistCount extends HTMLElement {
      constructor() {
        super();
        this.store = window.ThemeProductLists.wishlist;
        this.onStoreChange = this.render.bind(this);
      }

      connectedCallback() {
        this.render();
        document.addEventListener('theme:wishlist:change', this.onStoreChange);
      }

      disconnectedCallback() {
        document.removeEventListener('theme:wishlist:change', this.onStoreChange);
      }

      render() {
        const count = this.store.size;
        this.textContent = count > 0 ? count : '';
        this.toggleAttribute('hidden', count === 0);
      }
    }
  );
}

if (!customElements.get('wishlist-list')) {
  customElements.define(
    'wishlist-list',
    class WishlistList extends HTMLElement {
      constructor() {
        super();
        this.store = window.ThemeProductLists.wishlist;
        this.grid = this.querySelector('[data-wishlist-grid]');
        this.emptyState = this.querySelector('[data-wishlist-empty]');
        this.loading = this.querySelector('[data-wishlist-loading]');
        this.clearButton = this.querySelector('[data-wishlist-clear]');
        this.sectionId = this.dataset.cardSection || 'wishlist-card';
        this.renderedHandles = null;
      }

      connectedCallback() {
        this.render();
        this.clearButton?.addEventListener('click', () => {
          this.store.clear();
          this.render();
        });
        this.onStoreChange = () => this.render();
        document.addEventListener('theme:wishlist:change', this.onStoreChange);
      }

      disconnectedCallback() {
        document.removeEventListener('theme:wishlist:change', this.onStoreChange);
      }

      async render() {
        const handles = this.store.read();
        const signature = handles.join(',');

        // A removal made from inside this list only needs the card pulled out.
        if (this.renderedHandles && signature && this.renderedHandles.startsWith(signature)) {
          this.removeStaleCards(handles);
          this.renderedHandles = signature;
          this.toggleEmpty(handles.length === 0);
          return;
        }

        this.renderedHandles = signature;

        if (handles.length === 0) {
          if (this.grid) this.grid.innerHTML = '';
          this.loading?.setAttribute('hidden', '');
          this.toggleEmpty(true);
          return;
        }

        this.toggleEmpty(false);
        this.loading?.removeAttribute('hidden');

        const cards = await window.ThemeProductLists.renderCards(handles, this.sectionId);

        this.loading?.setAttribute('hidden', '');

        if (!this.grid) return;
        this.grid.innerHTML = '';
        cards.forEach((card) => {
          const item = document.createElement('li');
          item.className = 'grid__item';
          item.appendChild(card);
          this.grid.appendChild(item);
        });

        this.toggleEmpty(cards.length === 0);
      }

      removeStaleCards(handles) {
        this.grid?.querySelectorAll('[data-product-handle]').forEach((card) => {
          if (!handles.includes(card.dataset.productHandle)) card.closest('.grid__item')?.remove();
        });
      }

      toggleEmpty(isEmpty) {
        this.emptyState?.toggleAttribute('hidden', !isEmpty);
        this.grid?.toggleAttribute('hidden', isEmpty);
        this.clearButton?.toggleAttribute('hidden', isEmpty);
      }
    }
  );
}
