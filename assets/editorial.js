/**
 * Editorial motion — scroll reveal, hero load-in and campaign parallax.
 *
 * Three small behaviours, no library. Every one of them is a no-op under
 * prefers-reduced-motion, and none of them gates content: markup is readable
 * with this file absent or blocked.
 */
(() => {
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  /* Scroll reveal --------------------------------------------------------- */
  const reveal = () => {
    const targets = document.querySelectorAll('.ed-reveal:not(.is-revealed)');
    if (!targets.length) return;

    if (reduceMotion.matches || !('IntersectionObserver' in window)) {
      targets.forEach((el) => el.classList.add('is-revealed'));
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add('is-revealed');
          observer.unobserve(entry.target);
        });
      },
      { rootMargin: '0px 0px -12% 0px', threshold: 0.05 }
    );

    targets.forEach((el) => observer.observe(el));
  };

  /* Hero settle ----------------------------------------------------------- */
  const heroes = () => {
    document.querySelectorAll('.ed-hero').forEach((hero) => {
      // One frame's delay so the transition has a start value to move from.
      requestAnimationFrame(() => hero.classList.add('is-loaded'));
    });
  };

  /* Campaign parallax ------------------------------------------------------ */
  const parallax = () => {
    const layers = document.querySelectorAll('[data-ed-parallax]');
    if (!layers.length || reduceMotion.matches) return;

    let ticking = false;

    const update = () => {
      ticking = false;
      layers.forEach((layer) => {
        const frame = layer.closest('.ed-campaign, .ed-hero');
        if (!frame) return;

        const rect = frame.getBoundingClientRect();
        if (rect.bottom < 0 || rect.top > window.innerHeight) return;

        // -1..1 as the frame crosses the viewport; the image is 118% tall, so
        // 9% of travel each way stays inside the frame with no gap.
        const progress = (rect.top + rect.height / 2 - window.innerHeight / 2) / window.innerHeight;
        const shift = Math.max(-1, Math.min(1, progress)) * 9;
        layer.style.transform = `translate3d(0, ${shift}%, 0)`;
      });
    };

    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(update);
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });
    update();
  };

  const init = () => {
    reveal();
    heroes();
    parallax();
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Theme editor re-renders sections without a page load.
  document.addEventListener('shopify:section:load', init);
})();
