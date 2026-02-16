// =============================================
// LEGAL PAGE — Mobile menu behavior
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

  // Focus trap
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
