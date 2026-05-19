const { createClient } = require('@supabase/supabase-js');

const SOURCE_LABELS = {
  'try-now': 'Try Now access request',
  podcast: 'Podcast updates',
  research: 'Research updates',
};

function escapeHtml(s) {
  if (s == null || s === '') return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function cleanText(value, maxLength) {
  const text = String(value || '').trim();
  if (!text) return '';
  return text.slice(0, maxLength);
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function validatePayload(body) {
  const source = cleanText(body.source, 40).toLowerCase();
  const email = normalizeEmail(body.email || body.workEmail);
  const fullName = cleanText(body.fullName || body.name, 200);
  const phone = cleanText(body.phone, 60);
  const companyName = cleanText(body.companyName || body.company, 200);
  const interestArea = cleanText(body.interest || body.interestArea, 500);
  const pagePath = cleanText(body.pagePath, 500);

  if (!SOURCE_LABELS[source]) {
    return { error: 'Please choose a signup source.' };
  }
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { error: 'Please enter a valid email address.' };
  }
  if (source === 'try-now' && !fullName) {
    return { error: 'Please enter your name.' };
  }
  if (source === 'try-now' && !companyName) {
    return { error: 'Please enter your company name.' };
  }

  return {
    data: {
      source,
      source_label: SOURCE_LABELS[source],
      full_name: fullName || null,
      email,
      phone: phone || null,
      company_name: companyName || null,
      interest_area: interestArea || SOURCE_LABELS[source],
      page_path: pagePath || null,
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

  const row = parsed.data;
  const supabase = createClient(supabaseUrl, serviceKey);

  const { data: inserted, error: dbError } = await supabase
    .from('waitlist_requests')
    .insert(row)
    .select('id')
    .single();

  if (dbError) {
    console.error('Supabase waitlist insert error:', dbError);
    return res.status(500).json({ error: 'Could not save your request. Please try again.' });
  }

  if (resendKey) {
    const html = `
      <h1 style="font-family:Georgia,serif;">New ${escapeHtml(row.source_label)}</h1>
      <table style="font-family:sans-serif;font-size:14px;border-collapse:collapse;max-width:560px;">
        <tr><td style="padding:8px 12px;border:1px solid #ddd;"><strong>Email</strong></td><td style="padding:8px 12px;border:1px solid #ddd;">${escapeHtml(row.email)}</td></tr>
        <tr><td style="padding:8px 12px;border:1px solid #ddd;"><strong>Name</strong></td><td style="padding:8px 12px;border:1px solid #ddd;">${escapeHtml(row.full_name) || '-'}</td></tr>
        <tr><td style="padding:8px 12px;border:1px solid #ddd;"><strong>Company</strong></td><td style="padding:8px 12px;border:1px solid #ddd;">${escapeHtml(row.company_name) || '-'}</td></tr>
        <tr><td style="padding:8px 12px;border:1px solid #ddd;"><strong>Phone</strong></td><td style="padding:8px 12px;border:1px solid #ddd;">${escapeHtml(row.phone) || '-'}</td></tr>
        <tr><td style="padding:8px 12px;border:1px solid #ddd;"><strong>Interest</strong></td><td style="padding:8px 12px;border:1px solid #ddd;">${escapeHtml(row.interest_area)}</td></tr>
        <tr><td style="padding:8px 12px;border:1px solid #ddd;"><strong>Source page</strong></td><td style="padding:8px 12px;border:1px solid #ddd;">${escapeHtml(row.page_path) || '-'}</td></tr>
      </table>
    `;

    try {
      await sendResendEmail({
        apiKey: resendKey,
        from: fromEmail,
        to: notifyTo,
        subject: `New ${row.source_label} - ${row.email}`,
        html,
      });
    } catch (e) {
      console.error('Resend waitlist error:', e);
    }
  }

  return res.status(200).json({
    ok: true,
    id: inserted?.id,
    redirectUrl: `/success.html?source=${encodeURIComponent(row.source)}`,
  });
};
