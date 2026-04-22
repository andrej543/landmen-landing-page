const { createClient } = require('@supabase/supabase-js');

const CALENDAR_URL = 'https://calendar.app.google/YgQM5JgadAKXQqw39';

const WORK_TYPE_OPTIONS = [
  'Oil & gas title',
  'Renewables (solar/wind)',
  'Pipeline / midstream',
  'ROW & leasing',
  'Mineral management',
  'Municipal / DOT',
  'Other',
];

/** Consumer domains we reject for work email (tire-kickers). Extend as needed. */
const FREE_EMAIL_DOMAINS = new Set([
  'gmail.com',
  'googlemail.com',
  'yahoo.com',
  'yahoo.co.uk',
  'yahoo.fr',
  'yahoo.de',
  'ymail.com',
  'rocketmail.com',
  'hotmail.com',
  'outlook.com',
  'live.com',
  'msn.com',
  'icloud.com',
  'me.com',
  'mac.com',
  'aol.com',
  'protonmail.com',
  'proton.me',
  'mail.com',
]);

function escapeHtml(s) {
  if (s == null || s === '') return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function isBlockedConsumerDomain(email) {
  const at = email.lastIndexOf('@');
  if (at < 1) return true;
  const domain = email.slice(at + 1);
  return FREE_EMAIL_DOMAINS.has(domain);
}

function validatePayload(body) {
  const fullName = String(body.fullName || '').trim();
  const workEmail = normalizeEmail(body.workEmail);
  const phone = String(body.phone || '').trim();
  const companyName = String(body.companyName || '').trim();
  const workTypes = Array.isArray(body.workTypes) ? body.workTypes : [];
  const interestReason = String(body.interestReason || '').trim();
  const referralSource = String(body.referralSource || '').trim();

  if (!fullName || fullName.length > 200) {
    return { error: 'Please enter your full name.' };
  }
  if (!workEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(workEmail)) {
    return { error: 'Please enter a valid work email.' };
  }
  if (isBlockedConsumerDomain(workEmail)) {
    return {
      error:
        'Please use your company email address. Personal addresses (e.g. Gmail, Yahoo) are not accepted for booking.',
    };
  }
  if (!phone || phone.length > 40) {
    return { error: 'Please enter a phone number.' };
  }
  if (!companyName || companyName.length > 200) {
    return { error: 'Please enter your company name.' };
  }
  const normalizedTypes = [];
  for (const t of workTypes) {
    const label = String(t || '').trim();
    if (WORK_TYPE_OPTIONS.includes(label)) {
      normalizedTypes.push(label);
    }
  }
  if (normalizedTypes.length === 0) {
    return { error: 'Select at least one primary work type.' };
  }
  if (interestReason.length > 2000) {
    return { error: 'Interest description is too long.' };
  }
  if (referralSource.length > 500) {
    return { error: 'Referral source is too long.' };
  }

  return {
    data: {
      full_name: fullName,
      work_email: workEmail,
      phone,
      company_name: companyName,
      role_title: '—',
      firm_size: '—',
      primary_work_types: normalizedTypes,
      interest_reason: interestReason || null,
      referral_source: referralSource || null,
    },
  };
}

async function sendResendEmail({ apiKey, from, to, subject, html }) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject,
      html,
    }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = json.message || json.error || res.statusText || 'Resend error';
    throw new Error(msg);
  }
  return json;
}

module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST, OPTIONS');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  let rawBody = req.body;
  if (typeof rawBody === 'string') {
    try {
      rawBody = JSON.parse(rawBody || '{}');
    } catch (_) {
      return res.status(400).json({ error: 'Invalid JSON body.' });
    }
  }

  const parsed = validatePayload(rawBody || {});
  if (parsed.error) {
    return res.status(400).json({ error: parsed.error });
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const resendKey = process.env.RESEND_API_KEY;
  const notifyTo = process.env.NOTIFY_EMAIL || 'andrej@spenatlabs.com';
  const fromEmail =
    process.env.RESEND_FROM_EMAIL || 'Basinfoundry <onboarding@resend.dev>';

  if (!supabaseUrl || !serviceKey) {
    console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    return res.status(500).json({ error: 'Server configuration error.' });
  }
  if (!resendKey) {
    console.error('Missing RESEND_API_KEY');
    return res.status(500).json({ error: 'Server configuration error.' });
  }

  const row = parsed.data;
  const supabase = createClient(supabaseUrl, serviceKey);

  const { data: inserted, error: dbError } = await supabase
    .from('booking_requests')
    .insert(row)
    .select('id')
    .single();

  if (dbError) {
    console.error('Supabase insert error:', dbError);
    return res.status(500).json({ error: 'Could not save your request. Please try again.' });
  }

  const typesList = row.primary_work_types.map(escapeHtml).join(', ');
  const html = `
    <h1 style="font-family:Georgia,serif;">New booking form submission</h1>
    <p style="font-family:sans-serif;font-size:14px;color:#444;">
      <strong>Submission id:</strong> ${escapeHtml(inserted?.id)}<br/>
      <strong>Time:</strong> ${escapeHtml(new Date().toISOString())}
    </p>
    <table style="font-family:sans-serif;font-size:14px;border-collapse:collapse;max-width:560px;">
      <tr><td style="padding:8px 12px;border:1px solid #ddd;"><strong>Full name</strong></td><td style="padding:8px 12px;border:1px solid #ddd;">${escapeHtml(row.full_name)}</td></tr>
      <tr><td style="padding:8px 12px;border:1px solid #ddd;"><strong>Work email</strong></td><td style="padding:8px 12px;border:1px solid #ddd;">${escapeHtml(row.work_email)}</td></tr>
      <tr><td style="padding:8px 12px;border:1px solid #ddd;"><strong>Phone</strong></td><td style="padding:8px 12px;border:1px solid #ddd;">${escapeHtml(row.phone)}</td></tr>
      <tr><td style="padding:8px 12px;border:1px solid #ddd;"><strong>Company</strong></td><td style="padding:8px 12px;border:1px solid #ddd;">${escapeHtml(row.company_name)}</td></tr>
      <tr><td style="padding:8px 12px;border:1px solid #ddd;"><strong>Primary work types</strong></td><td style="padding:8px 12px;border:1px solid #ddd;">${typesList}</td></tr>
      <tr><td style="padding:8px 12px;border:1px solid #ddd;"><strong>What is driving interest?</strong></td><td style="padding:8px 12px;border:1px solid #ddd;">${escapeHtml(row.interest_reason) || '—'}</td></tr>
      <tr><td style="padding:8px 12px;border:1px solid #ddd;"><strong>How did they hear about us?</strong></td><td style="padding:8px 12px;border:1px solid #ddd;">${escapeHtml(row.referral_source) || '—'}</td></tr>
    </table>
    <p style="font-family:sans-serif;font-size:13px;color:#666;margin-top:24px;">
      Next step: <a href="${CALENDAR_URL}">Open scheduling link</a>
    </p>
  `;

  try {
    await sendResendEmail({
      apiKey: resendKey,
      from: fromEmail,
      to: notifyTo,
      subject: `New walkthrough request — ${row.company_name}`,
      html,
    });
  } catch (e) {
    console.error('Resend error:', e);
    // Row is saved; still return success so user can book, but log failure
  }

  return res.status(200).json({
    ok: true,
    id: inserted?.id,
    calendarUrl: CALENDAR_URL,
  });
};
