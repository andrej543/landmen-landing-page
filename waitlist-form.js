(function () {
  const SUCCESS_PAGE = 'success.html';
  const SOURCE_COPY = {
    podcast: {
      title: 'Get podcast updates',
      intro: 'Leave your email and we will send new Modern Land Desk episodes when they go live.',
      interest: 'Podcast updates',
      button: 'Notify me',
    },
    research: {
      title: 'Get research updates',
      intro: 'Leave your email and we will send new tract signal and title risk briefs when they publish.',
      interest: 'Research updates',
      button: 'Notify me',
    },
  };

  const dialog = document.getElementById('waitlist-dialog');
  const dialogTitle = document.getElementById('waitlist-dialog-title');
  const dialogIntro = document.getElementById('waitlist-dialog-intro');
  const dialogSource = document.getElementById('waitlist-source');
  const dialogInterest = document.getElementById('waitlist-interest');
  const dialogSubmit = document.getElementById('waitlist-submit');
  const closeBtn = document.querySelector('.notify-dialog-close');

  function successUrl(source) {
    const url = new URL(SUCCESS_PAGE, window.location.href);
    url.searchParams.set('source', source || 'waitlist');
    return url.href;
  }

  function setFormMessage(form, message, tone) {
    const el = form.querySelector('[data-form-message]');
    if (!el) return;
    el.textContent = message || '';
    el.dataset.tone = tone || 'error';
    el.hidden = !message;
  }

  function getPayload(form) {
    const data = new FormData(form);
    const payload = {};
    data.forEach(function (value, key) {
      payload[key] = String(value || '').trim();
    });
    payload.pagePath = window.location.pathname + window.location.search + window.location.hash;
    return payload;
  }

  async function submitPayload(payload) {
    const res = await fetch('/api/waitlist', {
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
    return data;
  }

  function syncButton(button, isLoading, loadingLabel) {
    if (!button) return;
    if (isLoading) {
      button.dataset.prevLabel = button.textContent;
      button.textContent = loadingLabel;
      button.disabled = true;
    } else {
      button.disabled = false;
      button.textContent = button.dataset.prevLabel || button.textContent;
    }
  }

  function bindForm(form) {
    form.addEventListener('submit', async function (event) {
      event.preventDefault();
      setFormMessage(form, '');

      if (!form.checkValidity()) {
        form.reportValidity();
        return;
      }

      const button = form.querySelector('[type="submit"]');
      const payload = getPayload(form);
      syncButton(button, true, 'Sending...');

      try {
        const data = await submitPayload(payload);
        window.location.href = data.redirectUrl || successUrl(payload.source);
      } catch (err) {
        setFormMessage(form, err.message || 'Could not submit. Please try again.', 'error');
        syncButton(button, false);
      }
    });
  }

  document.querySelectorAll('[data-waitlist-form]').forEach(bindForm);

  document.addEventListener('click', async function (event) {
    const trigger = event.target.closest('.js-waitlist-open');
    if (!trigger) return;
    event.preventDefault();

    const source = trigger.dataset.waitlistSource || 'podcast';
    const copy = SOURCE_COPY[source] || SOURCE_COPY.podcast;

    if (!dialog || typeof dialog.showModal !== 'function') {
      const email = window.prompt(copy.title + ': enter your email address');
      if (!email) return;

      try {
        await submitPayload({
          source,
          email,
          interest: copy.interest,
          pagePath: window.location.pathname + window.location.search + window.location.hash,
        });
        window.location.href = successUrl(source);
      } catch (err) {
        window.alert(err.message || 'Could not submit. Please try again.');
      }
      return;
    }

    const form = dialog.querySelector('[data-waitlist-form]');
    if (form) {
      form.reset();
      setFormMessage(form, '');
    }
    if (dialogTitle) dialogTitle.textContent = copy.title;
    if (dialogIntro) dialogIntro.textContent = copy.intro;
    if (dialogSource) dialogSource.value = source;
    if (dialogInterest) dialogInterest.value = copy.interest;
    if (dialogSubmit) dialogSubmit.textContent = copy.button;
    dialog.showModal();
  });

  if (closeBtn && dialog) {
    closeBtn.addEventListener('click', function () {
      dialog.close();
    });
  }
})();
