/**
 * Tune Health - Premium Editorial Experience
 * Optimized JavaScript - Native scroll with CSS animations
 * Removed Lenis scroll hijacking for native browser performance
 */

import { gsap } from 'gsap';

// =========================================
// Loader Animation
// =========================================
const loader = document.getElementById('loader');

function hideLoader() {
  if (loader) {
    loader.style.opacity = '0';
    setTimeout(() => {
      loader.classList.add('hidden');
      document.body.style.overflow = '';
      initAnimations();
    }, 600);
  }
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

const getThemePreference = () => {
  if (localStorage.getItem('theme')) {
    return localStorage.getItem('theme');
  }
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
};

const applyTheme = (theme) => {
  if (theme === 'dark') {
    html.classList.add('dark');
  } else {
    html.classList.remove('dark');
  }
  localStorage.setItem('theme', theme);
};

applyTheme(getThemePreference());

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

// Header scroll effect - using passive scroll listener
let ticking = false;

const updateHeader = () => {
  const scrollY = window.scrollY;

  if (scrollY > 50) {
    header?.classList.add('scrolled');
  } else {
    header?.classList.remove('scrolled');
  }

  ticking = false;
};

window.addEventListener('scroll', () => {
  if (!ticking) {
    requestAnimationFrame(updateHeader);
    ticking = true;
  }
}, { passive: true });

// Mobile menu toggle
menuToggle?.addEventListener('click', () => {
  menuToggle.classList.toggle('active');
  mobileMenu?.classList.toggle('active');
  document.body.classList.toggle('menu-open');
});

// Search overlay
searchToggle?.addEventListener('click', () => {
  searchOverlay?.classList.add('active');
  document.body.classList.add('search-open');
  searchInput?.focus();
});

searchClose?.addEventListener('click', () => {
  searchOverlay?.classList.remove('active');
  document.body.classList.remove('search-open');
});

// Close search/menu on escape
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (searchOverlay?.classList.contains('active')) {
      searchOverlay.classList.remove('active');
      document.body.classList.remove('search-open');
    }
    if (mobileMenu?.classList.contains('active')) {
      menuToggle?.classList.remove('active');
      mobileMenu.classList.remove('active');
      document.body.classList.remove('menu-open');
    }
  }
});

// =========================================
// Scroll Progress Bar (CSS-only with JS update)
// =========================================
const scrollProgress = document.getElementById('scrollProgress');

if (scrollProgress) {
  window.addEventListener('scroll', () => {
    if (!ticking) {
      requestAnimationFrame(() => {
        const scrollTop = window.scrollY;
        const docHeight = document.documentElement.scrollHeight - window.innerHeight;
        const progress = scrollTop / docHeight;
        scrollProgress.style.transform = `scaleX(${progress})`;
      });
    }
  }, { passive: true });
}

// =========================================
// Back to Top Button
// =========================================
const backToTop = document.getElementById('backToTop');

if (backToTop) {
  window.addEventListener('scroll', () => {
    requestAnimationFrame(() => {
      if (window.scrollY > 400) {
        backToTop.classList.add('visible');
      } else {
        backToTop.classList.remove('visible');
      }
    });
  }, { passive: true });

  backToTop.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
}

// =========================================
// IntersectionObserver for Reveal Animations
// =========================================
function initAnimations() {
  // Reveal elements using IntersectionObserver (GPU-accelerated CSS transitions)
  const reveals = document.querySelectorAll('.reveal');
  const staggerGroups = document.querySelectorAll('.stagger-children');
  const imageReveals = document.querySelectorAll('.image-reveal');

  const revealObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('active');
        revealObserver.unobserve(entry.target);
      }
    });
  }, {
    threshold: 0.15,
    rootMargin: '0px 0px -50px 0px'
  });

  reveals.forEach((el) => revealObserver.observe(el));
  staggerGroups.forEach((el) => revealObserver.observe(el));
  imageReveals.forEach((el) => {
    const imgObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('revealed');
          imgObserver.unobserve(entry.target);
        }
      });
    }, { threshold: 0.2 });
    imgObserver.observe(el);
  });

  // Hero entrance animation (one-time, immediate)
  const heroTitle = document.querySelector('.hero h1');
  const heroBadge = document.querySelector('.hero .reveal');
  const heroSubtitle = document.querySelector('.hero p');

  if (heroTitle) {
    // Use GSAP only for the hero entrance (complex, one-time animation)
    const tl = gsap.timeline({ delay: 0.3 });

    if (heroBadge) {
      tl.fromTo(heroBadge,
        { opacity: 0, y: 20 },
        { opacity: 1, y: 0, duration: 0.6, ease: 'power3.out' }
      );
    }

    tl.fromTo(heroTitle,
      { opacity: 0, y: 40 },
      { opacity: 1, y: 0, duration: 0.8, ease: 'power3.out' },
      '-=0.3'
    );

    if (heroSubtitle) {
      tl.fromTo(heroSubtitle,
        { opacity: 0, y: 30 },
        { opacity: 1, y: 0, duration: 0.6, ease: 'power3.out' },
        '-=0.4'
      );
    }
  }

  // Counter animation - immediate on page load
  const counters = document.querySelectorAll('.counter');

  counters.forEach((counter) => {
    const target = parseInt(counter.dataset.count);
    if (isNaN(target)) return;

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
}

// =========================================
// Magnetic Button Effect (optional, CSS fallback available)
// =========================================
const magneticButtons = document.querySelectorAll('.magnetic');

magneticButtons.forEach((btn) => {
  btn.addEventListener('mousemove', (e) => {
    const rect = btn.getBoundingClientRect();
    const x = e.clientX - rect.left - rect.width / 2;
    const y = e.clientY - rect.top - rect.height / 2;

    btn.style.transform = `translate(${x * 0.2}px, ${y * 0.2}px)`;
  });

  btn.addEventListener('mouseleave', () => {
    btn.style.transform = '';
  });
});

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
// Smooth Scroll for Anchor Links (native)
// =========================================
document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
  anchor.addEventListener('click', (e) => {
    const href = anchor.getAttribute('href');
    if (href !== '#') {
      e.preventDefault();
      const target = document.querySelector(href);
      if (target) {
        const headerOffset = 100;
        const elementPosition = target.getBoundingClientRect().top;
        const offsetPosition = elementPosition + window.scrollY - headerOffset;

        window.scrollTo({
          top: offsetPosition,
          behavior: 'smooth'
        });

        // Close mobile menu if open
        if (mobileMenu?.classList.contains('active')) {
          menuToggle?.classList.remove('active');
          mobileMenu.classList.remove('active');
          document.body.classList.remove('menu-open');
        }
      }
    }
  });
});

// =========================================
// Initialize on DOM Ready
// =========================================
document.addEventListener('DOMContentLoaded', () => {
  document.body.classList.add('loaded');
});

// =========================================
// Export for potential module use
// =========================================
export { gsap };
