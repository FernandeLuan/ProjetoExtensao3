document.documentElement.classList.add('js-enabled');

const header = document.querySelector('.site-header');
const menuButton = document.getElementById('menuButton');
const nav = document.getElementById('siteNav');

function setMenu(open) {
  if (!menuButton || !nav) return;
  nav.classList.toggle('open', open);
  document.body.classList.toggle('menu-open', open);
  menuButton.setAttribute('aria-expanded', String(open));
  menuButton.setAttribute('aria-label', open ? 'Fechar menu' : 'Abrir menu');
}

menuButton?.addEventListener('click', () => setMenu(!nav.classList.contains('open')));
nav?.querySelectorAll('a').forEach((link) => link.addEventListener('click', () => setMenu(false)));
document.addEventListener('click', (event) => {
  if (!nav?.classList.contains('open')) return;
  if (nav.contains(event.target) || menuButton?.contains(event.target)) return;
  setMenu(false);
});

function updateHeader() {
  header?.classList.toggle('scrolled', window.scrollY > 16);
}
window.addEventListener('scroll', updateHeader, { passive: true });
updateHeader();

/* Skeletons e remoção automática de imagens que realmente falharem. */
document.querySelectorAll('img').forEach((img) => {
  img.classList.add('is-loading');

  const markLoaded = () => {
    if (!img.naturalWidth) return markFailed();
    img.classList.remove('is-loading', 'image-unavailable');
    img.classList.add('is-loaded');
  };

  const markFailed = () => {
    img.classList.remove('is-loading');
    img.classList.add('image-unavailable');
    const galleryItem = img.closest('.work-item');
    if (galleryItem) {
      galleryItem.classList.add('is-empty');
      galleryItem.remove();
    }
  };

  img.addEventListener('load', markLoaded, { once: true });
  img.addEventListener('error', markFailed, { once: true });

  if (img.complete) {
    if (img.naturalWidth > 0) markLoaded();
    else markFailed();
  }
});

/* Animações ao entrar na área visível, sem bloquear conteúdo se não houver suporte. */
const revealItems = document.querySelectorAll('.reveal');
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

if ('IntersectionObserver' in window && !reduceMotion) {
  const observer = new IntersectionObserver((entries, obs) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('is-visible');
      obs.unobserve(entry.target);
    });
  }, { threshold: 0.08, rootMargin: '0px 0px -28px 0px' });

  revealItems.forEach((item) => observer.observe(item));
} else {
  revealItems.forEach((item) => item.classList.add('is-visible'));
}

document.getElementById('currentYear')?.replaceChildren(String(new Date().getFullYear()));
