let currentIndex = 0;
const track = document.getElementById('carouselTrack');
let slides, slideWidth, totalSlides;

function updateCarousel() {
  slides = track.children;
  totalSlides = slides.length;
  if (totalSlides === 0) return;

  const gap = parseFloat(getComputedStyle(track).gap) || 24;
  slideWidth = slides[0].getBoundingClientRect().width + gap;

  const maxTranslate = (totalSlides - 1) * slideWidth;
  const translateX = Math.min(currentIndex * slideWidth, maxTranslate);

  track.style.transform = `translateX(-${translateX}px)`;
}

function moveCarousel(direction) {
  currentIndex += direction;

  if (currentIndex < 0) currentIndex = totalSlides - 1;
  if (currentIndex >= totalSlides) currentIndex = 0;

  updateCarousel();
}

// Auto slide 3s
let auto = setInterval(() => moveCarousel(1), 3000);

// Pause hover
const carousel = document.querySelector('.carousel');
if (carousel) {
  carousel.addEventListener('mouseenter', () => clearInterval(auto));
  carousel.addEventListener('mouseleave', () => auto = setInterval(() => moveCarousel(1), 3000));
}

// Touch swipe
let startX = 0;
track.addEventListener('touchstart', e => startX = e.touches[0].clientX);
track.addEventListener('touchmove', e => {
  const diff = startX - e.touches[0].clientX;
  if (Math.abs(diff) > 50) {
    moveCarousel(diff > 0 ? 1 : -1);
    startX = e.touches[0].clientX;
  }
});

// Recalcula ao redimensionar
window.addEventListener('resize', updateCarousel);

// Inicializa
updateCarousel();

// Header mais transparente ao scroll
window.addEventListener('scroll', () => {
  const header = document.querySelector('.header');
  if (window.scrollY > 50) {
    header.classList.add('scrolled');
  } else {
    header.classList.remove('scrolled');
  }
});

// Fechar menu e scroll suave com offset do header
function closeMenu() {
  const toggle = document.getElementById('menu-toggle');
  if (toggle) toggle.checked = false;
}

document.addEventListener('DOMContentLoaded', () => {
  closeMenu();

  document.querySelectorAll('.nav-list a').forEach(link => {
    link.addEventListener('click', function(e) {
      e.preventDefault();
      const targetId = this.getAttribute('href').substring(1);
      const targetElement = document.getElementById(targetId);

      if (targetElement) {
        const headerHeight = document.querySelector('.header').offsetHeight || 80;
        const elementPosition = targetElement.getBoundingClientRect().top + window.pageYOffset;
        const offsetPosition = elementPosition - headerHeight - 20;

        window.scrollTo({
          top: offsetPosition,
          behavior: 'smooth'
        });
      }
    });
  });

  // Voltar ao topo ao clicar no header/logo
  document.querySelectorAll('.logo-link').forEach(link => {
    link.addEventListener('click', function(e) {
      e.preventDefault();
      window.scrollTo({
        top: 0,
        behavior: 'smooth'
      });
    });
  });
});
document.addEventListener('DOMContentLoaded', () => {
  // ... seu código atual continua aqui ...

  // Voltar ao topo ao clicar no logo ou nome
  document.querySelectorAll('.logo-link').forEach(link => {
    link.addEventListener('click', function(e) {
      e.preventDefault(); // impede o # pular
      window.scrollTo({
        top: 0,
        behavior: 'smooth' // scroll suave
      });
    });
  });
});