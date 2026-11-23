import { byId } from './dom.js';

export function bindNavigation() {
  const navLinks = Array.from(document.querySelectorAll('.nav-link'));
  function highlightNav() {
    let active = 'overview';
    for (const id of ['overview', 'plan', 'ask', 'impact', 'community']) {
      const el = byId(id);
      if (
        el.getBoundingClientRect().top <= window.innerHeight * 0.3 &&
        !(id === 'community' && window.innerWidth > 740 && location.hash !== '#community')
      )
        active = id;
    }
    navLinks.forEach((link) => {
      const on = link.hash === '#' + active;
      link.classList.toggle('active', on);
      if (on) link.setAttribute('aria-current', 'location');
      else link.removeAttribute('aria-current');
    });
  }
  window.addEventListener('scroll', highlightNav, { passive: true });
  window.addEventListener('hashchange', highlightNav);
  highlightNav();
}
