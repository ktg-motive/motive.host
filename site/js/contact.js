// =============================================
// CONTACT FORM — Validation & AJAX Submission
// =============================================
(function () {
  var form = document.getElementById('contact-form');
  if (!form) return;

  var submitBtn = form.querySelector('.contact-form__submit button');
  var successMsg = form.querySelector('.form-success');
  var errorMsg = form.querySelector('.form-error');

  function validateEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  function showError(field, message) {
    var wrapper = field.closest('.form-field');
    var existing = wrapper.querySelector('.contact-form__field-error');
    if (existing) existing.remove();

    field.classList.add('contact-form__input--error');
    var el = document.createElement('p');
    el.className = 'contact-form__field-error';
    el.textContent = message;
    el.setAttribute('role', 'alert');
    wrapper.appendChild(el);
  }

  function clearError(field) {
    var wrapper = field.closest('.form-field');
    var existing = wrapper.querySelector('.contact-form__field-error');
    if (existing) existing.remove();
    field.classList.remove('contact-form__input--error');
  }

  function clearAllErrors() {
    var errors = form.querySelectorAll('.contact-form__field-error');
    errors.forEach(function (el) { el.remove(); });
    var inputs = form.querySelectorAll('.contact-form__input--error');
    inputs.forEach(function (el) { el.classList.remove('contact-form__input--error'); });
  }

  function validate() {
    clearAllErrors();
    var valid = true;

    var name = form.querySelector('[name="name"]');
    if (!name.value.trim()) {
      showError(name, 'Name is required.');
      valid = false;
    }

    var email = form.querySelector('[name="email"]');
    if (!email.value.trim()) {
      showError(email, 'Email is required.');
      valid = false;
    } else if (!validateEmail(email.value.trim())) {
      showError(email, 'Please enter a valid email address.');
      valid = false;
    }

    var message = form.querySelector('[name="message"]');
    if (!message.value.trim()) {
      showError(message, 'Message is required.');
      valid = false;
    }

    return valid;
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();

    if (successMsg) successMsg.style.display = 'none';
    if (errorMsg) errorMsg.style.display = 'none';

    if (!validate()) return;

    // Honeypot check
    var hp = form.querySelector('[name="website"]');
    if (hp && hp.value) return;

    submitBtn.disabled = true;
    submitBtn.textContent = 'Sending...';

    var data = {
      name: form.querySelector('[name="name"]').value.trim(),
      email: form.querySelector('[name="email"]').value.trim(),
      phone: form.querySelector('[name="phone"]').value.trim(),
      plan: form.querySelector('[name="plan"]').value,
      message: form.querySelector('[name="message"]').value.trim()
    };

    // POST to Supabase Edge Function
    fetch('https://lyvgbrgqxlelafrzvqoj.supabase.co/functions/v1/contact-form', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    })
    .then(function (res) {
      if (!res.ok) throw new Error('Server error');
      return res.json();
    })
    .then(function () {
      form.reset();
      clearAllErrors();
      if (successMsg) {
        successMsg.style.display = 'block';
        successMsg.focus();
      }
    })
    .catch(function () {
      if (errorMsg) {
        errorMsg.style.display = 'block';
        errorMsg.focus();
      }
    })
    .finally(function () {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Send Message';
    });
  });

  // Clear field errors on input
  var fields = form.querySelectorAll('input, textarea, select');
  fields.forEach(function (field) {
    field.addEventListener('input', function () {
      clearError(field);
    });
  });
})();
