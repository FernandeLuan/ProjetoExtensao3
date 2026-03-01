let currentIndex = 0;
const track = document.getElementById('carouselTrack');
let slides, slideWidth, totalSlides;

function updateCarousel() {
  slides = track.children;
  totalSlides = slides.length;
  if (totalSlides === 0) return;
  
  const gap = parseFloat(getComputedStyle(track).gap) || 24;
  slideWidth = slides[0].offsetWidth + gap;
  
  track.style.transform = `translateX(-${currentIndex * slideWidth}px)`;
}

function moveCarousel(direction) {
  currentIndex += direction;
  
  if (currentIndex < 0) currentIndex = totalSlides - 1;
  if (currentIndex >= totalSlides) currentIndex = 0;
  
  track.style.transform = `translateX(-${currentIndex * slideWidth}px)`;
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

// Resize
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

// Fechar menu ao clicar link
function closeMenu() {
  document.getElementById('menu-toggle').checked = false;
}