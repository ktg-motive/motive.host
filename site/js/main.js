// =============================================
// NAVIGATION -- Scroll behavior
// =============================================
(function () {
  var nav = document.querySelector('.nav');
  var ticking = false;

  function updateNav() {
    if (window.scrollY > 40) {
      nav.classList.add('nav--scrolled');
    } else {
      nav.classList.remove('nav--scrolled');
    }
    ticking = false;
  }

  window.addEventListener('scroll', function () {
    if (!ticking) {
      requestAnimationFrame(updateNav);
      ticking = true;
    }
  }, { passive: true });
})();

// =============================================
// MOBILE MENU
// =============================================
(function () {
  var hamburger = document.querySelector('.nav__hamburger');
  var mobileMenu = document.getElementById('mobile-menu');
  var closeBtn = document.querySelector('.mobile-menu__close');
  var menuLinks = mobileMenu.querySelectorAll('.mobile-menu__link');

  function openMenu() {
    mobileMenu.style.display = 'flex';
    mobileMenu.offsetHeight; // force reflow for transition
    mobileMenu.classList.add('mobile-menu--open');
    hamburger.setAttribute('aria-expanded', 'true');
    document.body.style.overflow = 'hidden';
    closeBtn.focus();
  }

  function closeMenu() {
    mobileMenu.classList.remove('mobile-menu--open');
    hamburger.setAttribute('aria-expanded', 'false');
    document.body.style.overflow = '';
    setTimeout(function () {
      if (!mobileMenu.classList.contains('mobile-menu--open')) {
        mobileMenu.style.display = 'none';
      }
    }, 250);
    hamburger.focus();
  }

  hamburger.addEventListener('click', openMenu);
  closeBtn.addEventListener('click', closeMenu);

  menuLinks.forEach(function (link) {
    link.addEventListener('click', closeMenu);
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && mobileMenu.classList.contains('mobile-menu--open')) {
      closeMenu();
    }
  });

  mobileMenu.addEventListener('keydown', function (e) {
    if (e.key !== 'Tab') return;

    var focusable = mobileMenu.querySelectorAll('button, a[href]');
    var first = focusable[0];
    var last = focusable[focusable.length - 1];

    if (e.shiftKey) {
      if (document.activeElement === first) {
        e.preventDefault();
        last.focus();
      }
    } else {
      if (document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  });
})();

// =============================================
// FAQ ACCORDION
// =============================================
(function () {
  var items = document.querySelectorAll('.faq-item');

  items.forEach(function (item) {
    var trigger = item.querySelector('.faq-item__trigger');

    trigger.addEventListener('click', function () {
      var isOpen = item.classList.contains('faq-item--open');

      items.forEach(function (otherItem) {
        otherItem.classList.remove('faq-item--open');
        otherItem.querySelector('.faq-item__trigger').setAttribute('aria-expanded', 'false');
      });

      if (!isOpen) {
        item.classList.add('faq-item--open');
        trigger.setAttribute('aria-expanded', 'true');
      }
    });
  });
})();

// =============================================
// SCROLL REVEAL ANIMATIONS
// =============================================
(function () {
  var prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var elements = document.querySelectorAll('.reveal');

  if (prefersReduced) {
    elements.forEach(function (el) {
      el.classList.add('reveal--visible');
    });
    return;
  }

  if ('IntersectionObserver' in window) {
    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('reveal--visible');
          observer.unobserve(entry.target);
        }
      });
    }, {
      threshold: 0.1,
      rootMargin: '0px 0px -40px 0px'
    });

    elements.forEach(function (el) {
      observer.observe(el);
    });
  } else {
    elements.forEach(function (el) {
      el.classList.add('reveal--visible');
    });
  }
})();
