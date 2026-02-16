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
