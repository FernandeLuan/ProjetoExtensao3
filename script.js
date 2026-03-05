let currentIndex = 0;
const track = document.getElementById('carouselTrack');
let slides, slideWidth, totalSlides;

function updateCarousel() {
  slides = track.children;
  totalSlides = slides.length;
  if (totalSlides === 0) return;

  const gap = parseFloat(getComputedStyle(track).gap) || 24;
  slideWidth = slides[0].offsetWidth + gap;

  let visibleSlides = 1;

  if (window.innerWidth >= 1024) {
    visibleSlides = Math.floor(track.parentElement.offsetWidth / slideWidth);
  }

  const maxIndex = totalSlides - visibleSlides;

  if (currentIndex > maxIndex) currentIndex = 0;
  if (currentIndex < 0) currentIndex = maxIndex;

  track.style.transform = `translateX(-${currentIndex * slideWidth}px)`;
}

function moveCarousel(direction) {
  slides = track.children;
  totalSlides = slides.length;

  if (totalSlides === 0) return;

  const gap = parseFloat(getComputedStyle(track).gap) || 24;
  slideWidth = slides[0].offsetWidth + gap;

  let visibleSlides = 1;

  if (window.innerWidth >= 1024) {
    visibleSlides = Math.floor(track.parentElement.offsetWidth / slideWidth);
  }

  const maxIndex = totalSlides - visibleSlides;

  currentIndex += direction;

  if (currentIndex > maxIndex) currentIndex = 0;
  if (currentIndex < 0) currentIndex = maxIndex;

  updateCarousel();
}

let auto;

function startAuto(){
  auto = setInterval(() => moveCarousel(1), 3000);
}

function stopAuto(){
  clearInterval(auto);
}

startAuto();

const carousel = document.querySelector('.carousel');

if (carousel) {
  carousel.addEventListener('mouseenter', stopAuto);
  carousel.addEventListener('mouseleave', startAuto);
}

let startX = 0;

track.addEventListener('touchstart', e => startX = e.touches[0].clientX);

track.addEventListener('touchmove', e => {
  const diff = startX - e.touches[0].clientX;
  if (Math.abs(diff) > 50) {
    moveCarousel(diff > 0 ? 1 : -1);
    startX = e.touches[0].clientX;
  }
});

window.addEventListener('resize', updateCarousel);

updateCarousel();

window.addEventListener('scroll', () => {
  const header = document.querySelector('.header');
  if (window.scrollY > 50) {
    header.classList.add('scrolled');
  } else {
    header.classList.remove('scrolled');
  }
});

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
const canvas = document.getElementById("particles")
const ctx = canvas.getContext("2d")

function resizeCanvas() {
  canvas.width = window.innerWidth
  canvas.height = window.innerHeight
}

window.addEventListener('resize', resizeCanvas)
resizeCanvas()

let particles = []

for(let i=0;i<60;i++){
  particles.push({
    x:Math.random()*canvas.width,
    y:Math.random()*canvas.height,
    r:Math.random()*2+1,
    dx:(Math.random()-0.5)*0.5,
    dy:(Math.random()-0.5)*0.5
  })
}

function animate(){
  ctx.clearRect(0,0,canvas.width,canvas.height)

  particles.forEach(p=>{
    ctx.beginPath()
    ctx.arc(p.x,p.y,p.r,0,Math.PI*2)
    ctx.fillStyle="rgba(0,240,255,0.5)"
    ctx.fill()

    p.x+=p.dx
    p.y+=p.dy

    if(p.x<0||p.x>canvas.width)p.dx*=-1
    if(p.y<0||p.y>canvas.height)p.dy*=-1
  })

  requestAnimationFrame(animate)
}

animate()