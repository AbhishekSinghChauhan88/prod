/**
 * Shared localStorage-backed product lists (wishlist, recently viewed) plus the
 * helper used to render them as real theme product cards.
 *
 * Lists hold product handles — handles survive across sessions and can be
 * re-rendered through the Section Rendering API, so the cards always match the
 * theme's own card settings instead of being rebuilt in JavaScript.
 */
class ProductListStore {
  constructor(key, limit = 100) {
    this.key = key;
    this.limit = limit;
    this.listeners = new Set();
  }

  read() {
    try {
      const raw = localStorage.getItem(this.key);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.filter((handle) => typeof handle === 'string') : [];
    } catch (error) {
      return [];
    }
  }

  write(handles) {
    const next = handles.slice(0, this.limit);
    try {
      localStorage.setItem(this.key, JSON.stringify(next));
    } catch (error) {
      // Storage can be unavailable (private mode, quota). The list stays in-memory only.
    }
    this.listeners.forEach((listener) => listener(next));
    document.dispatchEvent(new CustomEvent(`${this.key}:change`, { detail: { handles: next } }));
    return next;
  }

  has(handle) {
    return this.read().includes(handle);
  }

  add(handle) {
    const handles = this.read().filter((item) => item !== handle);
    handles.unshift(handle);
    return this.write(handles);
  }

  remove(handle) {
    return this.write(this.read().filter((item) => item !== handle));
  }

  toggle(handle) {
    const added = !this.has(handle);
    if (added) {
      this.add(handle);
    } else {
      this.remove(handle);
    }
    return added;
  }

  clear() {
    return this.write([]);
  }

  get size() {
    return this.read().length;
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}

window.ThemeProductLists = {
  wishlist: new ProductListStore('theme:wishlist', 100),
  recentlyViewed: new ProductListStore('theme:recently-viewed', 20),

  /**
   * Renders theme product cards for the given handles.
   *
   * @param {string[]} handles - product handles, in display order
   * @param {string} sectionId - id of the section that renders a single card
   * @returns {Promise<HTMLElement[]>} card elements, skipping handles that 404
   */
  async renderCards(handles, sectionId) {
    const rootUrl = window.Shopify?.routes?.root || '/';
    const requests = handles.map(async (handle) => {
      try {
        const response = await fetch(`${rootUrl}products/${handle}?section_id=${sectionId}`);
        if (!response.ok) return null;
        const html = new DOMParser().parseFromString(await response.text(), 'text/html');
        const card = html.querySelector('[data-product-card]');
        return card || null;
      } catch (error) {
        return null;
      }
    });

    const cards = await Promise.all(requests);
    return cards.filter(Boolean);
  },
};
