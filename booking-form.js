(function () {
  const CALENDAR_URL = 'https://calendar.app.google/YgQM5JgadAKXQqw39';

  const dialog = document.getElementById('booking-dialog');
  const form = document.getElementById('booking-form');
  const overlay = document.getElementById('booking-success-overlay');
  const errEl = document.getElementById('booking-form-error');
  const submitBtn = document.getElementById('booking-submit');

  if (!form || !overlay) return;

  function openBookingDialog() {
    if (!dialog || typeof dialog.showModal !== 'function') return;
    dialog.showModal();
  }

  function closeBookingDialog() {
    if (!dialog || typeof dialog.close !== 'function') return;
    dialog.close();
  }

  document.querySelectorAll('.js-booking-open').forEach(function (el) {
    el.addEventListener('click', function () {
      openBookingDialog();
    });
  });

  var closeBtn = document.querySelector('.booking-dialog-close');
  if (closeBtn) {
    closeBtn.addEventListener('click', function () {
      closeBookingDialog();
    });
  }

  function showError(msg) {
    if (!errEl) return;
    errEl.textContent = msg || '';
    errEl.hidden = !msg;
  }

  if (dialog) {
    dialog.addEventListener('close', function () {
      showError('');
    });
  }

  function openFromHash() {
    if (location.hash !== '#contact') return;
    openBookingDialog();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', openFromHash);
  } else {
    openFromHash();
  }
  window.addEventListener('hashchange', openFromHash);

  form.querySelectorAll('.booking-chip input[type="checkbox"]').forEach(function (inp) {
    var chip = inp.closest('.booking-chip');
    if (!chip) return;
    function sync() {
      chip.classList.toggle('booking-chip--on', inp.checked);
    }
    inp.addEventListener('change', sync);
    sync();
  });

  form.addEventListener('submit', async function (e) {
    e.preventDefault();
    showError('');

    const workTypes = Array.from(
      form.querySelectorAll('input[name="workTypes"]:checked'),
    ).map(function (el) {
      return el.value;
    });

    const payload = {
      fullName: form.elements.fullName.value.trim(),
      workEmail: form.elements.workEmail.value.trim(),
      phone: form.elements.phone.value.trim(),
      companyName: form.elements.companyName.value.trim(),
      workTypes,
      interestReason: form.elements.interestReason.value.trim(),
      referralSource: form.elements.referralSource.value.trim(),
    };

    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.dataset.prevLabel = submitBtn.textContent;
      submitBtn.textContent = 'Sending…';
    }

    try {
      const res = await fetch('/api/booking', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(function () {
        return {};
      });

      if (!res.ok) {
        throw new Error(data.error || 'Something went wrong. Please try again.');
      }

      closeBookingDialog();

      overlay.hidden = false;
      overlay.setAttribute('aria-hidden', 'false');
      document.body.style.overflow = 'hidden';

      window.setTimeout(function () {
        window.location.href = data.calendarUrl || CALENDAR_URL;
      }, 2200);
    } catch (err) {
      showError(err.message || 'Could not submit. Please try again.');
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = submitBtn.dataset.prevLabel || 'Continue to scheduling →';
      }
    }
  });
})();
