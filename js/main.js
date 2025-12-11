/**
 * Tune Health - Premium Editorial Experience
 * Advanced JavaScript with GSAP animations, Lenis smooth scroll, and modern interactions
 */

import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Lenis from 'lenis';
import SplitType from 'split-type';

// Register GSAP plugins
gsap.registerPlugin(ScrollTrigger);

// =========================================
// Initialize Lenis Smooth Scroll
// =========================================
const lenis = new Lenis({
  duration: 0.6,
  easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
  orientation: 'vertical',
  gestureOrientation: 'vertical',
  smoothWheel: true,
  wheelMultiplier: 1.5,
  touchMultiplier: 2,
  infinite: false,
  lerp: 0.15,
});

// Connect Lenis to GSAP ScrollTrigger
lenis.on('scroll', ScrollTrigger.update);

gsap.ticker.add((time) => {
  lenis.raf(time * 1000);
});

gsap.ticker.lagSmoothing(0);

// =========================================
// Loader Animation
// =========================================
const loader = document.getElementById('loader');

function hideLoader() {
  gsap.to(loader, {
    opacity: 0,
    duration: 0.6,
    ease: 'power2.out',
    onComplete: () => {
      loader.classList.add('hidden');
      document.body.style.overflow = '';
      initAnimations();
    }
  });
}

// Hide loader after content loads
window.addEventListener('load', () => {
  setTimeout(hideLoader, 1800);
});

// =========================================
// Theme Toggle
// =========================================
const themeToggle = document.getElementById('themeToggle');
const html = document.documentElement;

// Check for saved theme preference or default to system preference
const getThemePreference = () => {
  if (localStorage.getItem('theme')) {
    return localStorage.getItem('theme');
  }
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
};

// Apply theme
const applyTheme = (theme) => {
  if (theme === 'dark') {
    html.classList.add('dark');
  } else {
    html.classList.remove('dark');
  }
  localStorage.setItem('theme', theme);
};

// Initialize theme
applyTheme(getThemePreference());

// Toggle theme on button click
themeToggle?.addEventListener('click', () => {
  const currentTheme = html.classList.contains('dark') ? 'dark' : 'light';
  const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
  applyTheme(newTheme);
});

// =========================================
// Navigation
// =========================================
const header = document.getElementById('header');
const menuToggle = document.getElementById('menuToggle');
const mobileMenu = document.getElementById('mobileMenu');
const searchToggle = document.getElementById('searchToggle');
const searchOverlay = document.getElementById('searchOverlay');
const searchClose = document.getElementById('searchClose');
const searchInput = document.getElementById('searchInput');

// Header scroll effect
let lastScrollY = 0;

const updateHeader = () => {
  const scrollY = window.scrollY;

  if (scrollY > 50) {
    header.classList.add('scrolled');
  } else {
    header.classList.remove('scrolled');
  }

  lastScrollY = scrollY;
};

lenis.on('scroll', updateHeader);

// Mobile menu toggle
menuToggle?.addEventListener('click', () => {
  menuToggle.classList.toggle('active');
  mobileMenu.classList.toggle('active');
  document.body.classList.toggle('menu-open');

  if (mobileMenu.classList.contains('active')) {
    lenis.stop();
  } else {
    lenis.start();
  }
});

// Search overlay
searchToggle?.addEventListener('click', () => {
  searchOverlay.classList.add('active');
  document.body.classList.add('search-open');
  searchInput?.focus();
  lenis.stop();
});

searchClose?.addEventListener('click', () => {
  searchOverlay.classList.remove('active');
  document.body.classList.remove('search-open');
  lenis.start();
});

// Close search on escape
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (searchOverlay?.classList.contains('active')) {
      searchOverlay.classList.remove('active');
      document.body.classList.remove('search-open');
      lenis.start();
    }
    if (mobileMenu?.classList.contains('active')) {
      menuToggle.classList.remove('active');
      mobileMenu.classList.remove('active');
      document.body.classList.remove('menu-open');
      lenis.start();
    }
  }
});

// =========================================
// Scroll Progress Bar
// =========================================
const scrollProgress = document.getElementById('scrollProgress');

if (scrollProgress) {
  gsap.to(scrollProgress, {
    scaleX: 1,
    ease: 'none',
    scrollTrigger: {
      trigger: document.body,
      start: 'top top',
      end: 'bottom bottom',
      scrub: 0.3,
    }
  });
}

// =========================================
// Back to Top Button
// =========================================
const backToTop = document.getElementById('backToTop');

if (backToTop) {
  ScrollTrigger.create({
    start: 'top -400',
    onUpdate: (self) => {
      if (self.direction === 1 && window.scrollY > 400) {
        backToTop.classList.add('visible');
      } else if (window.scrollY < 400) {
        backToTop.classList.remove('visible');
      }
    }
  });

  backToTop.addEventListener('click', () => {
    lenis.scrollTo(0, { duration: 1.5 });
  });
}

// =========================================
// Reveal Animations
// =========================================
function initAnimations() {
  // Reveal elements on scroll
  const reveals = document.querySelectorAll('.reveal');

  reveals.forEach((el) => {
    gsap.fromTo(el,
      {
        opacity: 0,
        y: 50,
      },
      {
        opacity: 1,
        y: 0,
        duration: 0.8,
        ease: 'power3.out',
        scrollTrigger: {
          trigger: el,
          start: 'top 85%',
          toggleActions: 'play none none none',
        }
      }
    );
  });

  // Stagger children animations
  const staggerGroups = document.querySelectorAll('.stagger-children');

  staggerGroups.forEach((group) => {
    const children = group.children;

    gsap.fromTo(children,
      {
        opacity: 0,
        y: 30,
      },
      {
        opacity: 1,
        y: 0,
        duration: 0.6,
        stagger: 0.1,
        ease: 'power3.out',
        scrollTrigger: {
          trigger: group,
          start: 'top 85%',
          toggleActions: 'play none none none',
        }
      }
    );
  });

  // Hero animations
  const heroTitle = document.querySelector('.hero h1');
  const heroBadge = document.querySelector('.hero .reveal');
  const heroSubtitle = document.querySelector('.hero p');
  const heroCtas = document.querySelector('.hero .flex');

  if (heroTitle) {
    const tl = gsap.timeline({ delay: 0.3 });

    tl.fromTo(heroBadge,
      { opacity: 0, y: 20 },
      { opacity: 1, y: 0, duration: 0.6, ease: 'power3.out' }
    )
    .fromTo(heroTitle,
      { opacity: 0, y: 40 },
      { opacity: 1, y: 0, duration: 0.8, ease: 'power3.out' },
      '-=0.3'
    )
    .fromTo(heroSubtitle,
      { opacity: 0, y: 30 },
      { opacity: 1, y: 0, duration: 0.6, ease: 'power3.out' },
      '-=0.4'
    );
  }

  // Counter animation - animate immediately on page load
  const counters = document.querySelectorAll('.counter');

  counters.forEach((counter) => {
    const target = parseInt(counter.dataset.count);

    gsap.to(counter, {
      innerText: target,
      duration: 2,
      delay: 0.5,
      ease: 'power2.out',
      snap: { innerText: 1 },
      onUpdate: function() {
        counter.innerText = Math.round(this.targets()[0].innerText);
      }
    });
  });

  // Image reveal effects
  const imageReveals = document.querySelectorAll('.image-reveal');

  imageReveals.forEach((el) => {
    ScrollTrigger.create({
      trigger: el,
      start: 'top 80%',
      onEnter: () => {
        el.classList.add('revealed');
      },
      once: true
    });
  });
}

// =========================================
// Magnetic Button Effect
// =========================================
const magneticButtons = document.querySelectorAll('.magnetic');

magneticButtons.forEach((btn) => {
  btn.addEventListener('mousemove', (e) => {
    const rect = btn.getBoundingClientRect();
    const x = e.clientX - rect.left - rect.width / 2;
    const y = e.clientY - rect.top - rect.height / 2;

    gsap.to(btn, {
      x: x * 0.2,
      y: y * 0.2,
      duration: 0.3,
      ease: 'power2.out'
    });
  });

  btn.addEventListener('mouseleave', () => {
    gsap.to(btn, {
      x: 0,
      y: 0,
      duration: 0.5,
      ease: 'elastic.out(1, 0.5)'
    });
  });
});

// =========================================
// Parallax Effects
// =========================================
const parallaxElements = document.querySelectorAll('[data-parallax]');

parallaxElements.forEach((el) => {
  const speed = el.dataset.parallax || 0.2;

  gsap.to(el, {
    yPercent: -100 * speed,
    ease: 'none',
    scrollTrigger: {
      trigger: el.parentElement,
      start: 'top bottom',
      end: 'bottom top',
      scrub: true,
    }
  });
});

// Article Card Hover Effects - handled by CSS for better performance

// =========================================
// Newsletter Form
// =========================================
const newsletterForm = document.getElementById('newsletterForm');

newsletterForm?.addEventListener('submit', (e) => {
  e.preventDefault();

  const btn = newsletterForm.querySelector('button[type="submit"]');
  const originalText = btn.innerHTML;

  btn.innerHTML = `
    <svg class="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
      <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
      <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
    </svg>
    <span>Subscribing...</span>
  `;
  btn.disabled = true;

  // Simulate API call
  setTimeout(() => {
    btn.innerHTML = `
      <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path d="M5 13l4 4L19 7" stroke-width="2"/>
      </svg>
      <span>Subscribed!</span>
    `;
    btn.classList.remove('bg-stone-900', 'dark:bg-white');
    btn.classList.add('bg-green-600', 'dark:bg-green-600');

    setTimeout(() => {
      btn.innerHTML = originalText;
      btn.disabled = false;
      btn.classList.remove('bg-green-600', 'dark:bg-green-600');
      btn.classList.add('bg-stone-900', 'dark:bg-white');
      newsletterForm.reset();
    }, 3000);
  }, 1500);
});

// =========================================
// Category Chip Active State
// =========================================
const categoryChips = document.querySelectorAll('.category-chip');

categoryChips.forEach((chip) => {
  chip.addEventListener('click', (e) => {
    e.preventDefault();
    categoryChips.forEach((c) => c.classList.remove('active'));
    chip.classList.add('active');
  });
});

// =========================================
// Smooth Scroll for Anchor Links
// =========================================
document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
  anchor.addEventListener('click', (e) => {
    const href = anchor.getAttribute('href');
    if (href !== '#') {
      e.preventDefault();
      const target = document.querySelector(href);
      if (target) {
        lenis.scrollTo(target, {
          offset: -100,
          duration: 1.2,
        });

        // Close mobile menu if open
        if (mobileMenu?.classList.contains('active')) {
          menuToggle.classList.remove('active');
          mobileMenu.classList.remove('active');
          document.body.classList.remove('menu-open');
          lenis.start();
        }
      }
    }
  });
});

// =========================================
// Text Split Animation for Headlines
// =========================================
const splitHeadlines = document.querySelectorAll('[data-split]');

splitHeadlines.forEach((headline) => {
  const split = new SplitType(headline, { types: 'chars, words' });

  gsap.fromTo(split.chars,
    {
      opacity: 0,
      y: 50,
      rotateX: -90,
    },
    {
      opacity: 1,
      y: 0,
      rotateX: 0,
      duration: 0.8,
      stagger: 0.02,
      ease: 'power3.out',
      scrollTrigger: {
        trigger: headline,
        start: 'top 85%',
        toggleActions: 'play none none none',
      }
    }
  );
});

// Newsletter Cards Float Animation - removed for performance
// The cards have CSS hover effects which are sufficient

// =========================================
// Initialize on DOM Ready
// =========================================
document.addEventListener('DOMContentLoaded', () => {
  // Add loaded class for CSS transitions
  document.body.classList.add('loaded');
});

// =========================================
// Export for potential module use
// =========================================
export { lenis, gsap, ScrollTrigger };
