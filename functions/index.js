/**
 * Tonight Vietnam — Firebase Cloud Functions
 *
 * Two core functions:
 *  1. onEventApproved  — fires when admin approves an event → emails all users in that city
 *  2. sendReminders    — runs daily at 10:00 AM Vietnam time → emails users about tomorrow's events
 *
 * SETUP (run once before deploying):
 *   firebase functions:secrets:set EMAIL_USER    ← your Gmail address
 *   firebase functions:secrets:set EMAIL_PASS    ← your Gmail App Password (not your normal password)
 *   firebase functions:secrets:set EMAIL_FROM    ← "Tonight Vietnam <noreply@yourdomain.com>"
 *
 *   How to get a Gmail App Password:
 *   Google Account → Security → 2-Step Verification → App passwords → Generate
 *
 * DEPLOY:
 *   cd functions && npm install
 *   firebase deploy --only functions
 */

const { onDocumentUpdated,
        onDocumentCreated }          = require('firebase-functions/v2/firestore');
const { onSchedule }                 = require('firebase-functions/v2/scheduler');
const { defineSecret }               = require('firebase-functions/params');
const { initializeApp }              = require('firebase-admin/app');
const { getFirestore, Timestamp }    = require('firebase-admin/firestore');
const nodemailer                     = require('nodemailer');

initializeApp();
const db = getFirestore();

// ── Secrets (set via: firebase functions:secrets:set EMAIL_USER etc.) ──────────
const EMAIL_USER = defineSecret('EMAIL_USER');
const EMAIL_PASS = defineSecret('EMAIL_PASS');
const EMAIL_FROM = defineSecret('EMAIL_FROM');

// ── Helper: build transporter ──────────────────────────────────────────────────
function makeTransporter(user, pass) {
  return nodemailer.createTransport({
    service: 'gmail',
    auth: { user, pass },
  });
}

// ── Helper: get community subscribers for a city ──────────────────────────────
// Reads community_signups (app sign-ups) — city match or no city set
async function getUsersForCity(city) {
  const snap = await db.collection('community_signups')
    .where('city', 'in', [city, '', null])
    .limit(500)
    .get();
  return snap.docs.map(d => {
    const u = d.data();
    return { email: u.email, fullName: u.fullName || u.name || '', city: u.city || '' };
  }).filter(u => u.email);
}

// ── Helper: get ALL community subscribers (fallback) ──────────────────────────
async function getAllUsers() {
  const snap = await db.collection('community_signups').limit(500).get();
  return snap.docs.map(d => {
    const u = d.data();
    return { email: u.email, fullName: u.fullName || u.name || '', city: u.city || '' };
  }).filter(u => u.email);
}

// ══════════════════════════════════════════════════════════════════════════════
// FUNCTION 1: onEventApproved
// Triggers whenever an event document is updated.
// When status changes to 'approved' → blast email to all users in that city.
// ══════════════════════════════════════════════════════════════════════════════
exports.onEventApproved = onDocumentUpdated(
  {
    document: 'events/{eventId}',
    secrets:  [EMAIL_USER, EMAIL_PASS, EMAIL_FROM],
    region:   'asia-southeast1',
  },
  async (event) => {
    const before = event.data.before.data();
    const after  = event.data.after.data();

    // Only run when status flips to 'approved' and email not already sent
    if (before.status === 'approved' || after.status !== 'approved') return;
    if (after.emailSent) return;

    const ev      = after;
    const eventId = event.params.eventId;

    console.log(`[onEventApproved] Event approved: "${ev.title}" in ${ev.city}`);

    let users = await getUsersForCity(ev.city);
    // If no city-specific users, notify everyone
    if (users.length === 0) users = await getAllUsers();

    if (users.length === 0) {
      console.log('[onEventApproved] No users to notify.');
      await event.data.after.ref.update({ emailSent: true, emailSentAt: Timestamp.now(), emailCount: 0 });
      return;
    }

    const transporter = makeTransporter(EMAIL_USER.value(), EMAIL_PASS.value());
    const fromLabel   = EMAIL_FROM.value() || `Tonight Vietnam <${EMAIL_USER.value()}>`;

    // Send emails (batch to avoid rate limits)
    let sent = 0;
    const batchSize = 50;
    for (let i = 0; i < users.length; i += batchSize) {
      const batch = users.slice(i, i + batchSize);
      await Promise.allSettled(batch.map(user =>
        transporter.sendMail({
          from:    fromLabel,
          to:      user.email,
          subject: `${ev.emoji || '🎉'} ${ev.title} — ${ev.venueName} · Tonight Vietnam`,
          html:    buildApprovalEmail(ev, user),
        }).then(() => sent++)
          .catch(err => console.error(`[email error] ${user.email}: ${err.message}`))
      ));
    }

    console.log(`[onEventApproved] Sent ${sent}/${users.length} emails`);

    // Mark email sent on the event doc
    await event.data.after.ref.update({
      emailSent:    true,
      emailSentAt:  Timestamp.now(),
      emailCount:   sent,
    });
  }
);

// ══════════════════════════════════════════════════════════════════════════════
// FUNCTION 2: sendReminders
// Runs daily at 10:00 AM Vietnam time (UTC+7 = 03:00 UTC).
// Finds all approved events happening TOMORROW and sends reminder emails.
// ══════════════════════════════════════════════════════════════════════════════
exports.sendReminders = onSchedule(
  {
    schedule:  'every day 03:00',   // 03:00 UTC = 10:00 AM Ho Chi Minh City
    timeZone:  'UTC',
    secrets:   [EMAIL_USER, EMAIL_PASS, EMAIL_FROM],
    region:    'asia-southeast1',
  },
  async () => {
    // Get tomorrow's date string YYYY-MM-DD (Vietnam time)
    const now       = new Date();
    const tomorrow  = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const dateStr   = tomorrow.toISOString().split('T')[0];

    console.log(`[sendReminders] Looking for events on ${dateStr}`);

    const eventsSnap = await db.collection('events')
      .where('date', '==', dateStr)
      .where('status', '==', 'approved')
      .where('reminderSent', '==', false)
      .get();

    if (eventsSnap.empty) {
      console.log('[sendReminders] No events tomorrow — nothing to do.');
      return;
    }

    console.log(`[sendReminders] Found ${eventsSnap.size} event(s) for ${dateStr}`);

    const transporter = makeTransporter(EMAIL_USER.value(), EMAIL_PASS.value());
    const fromLabel   = EMAIL_FROM.value() || `Tonight Vietnam <${EMAIL_USER.value()}>`;

    for (const eventDoc of eventsSnap.docs) {
      const ev = eventDoc.data();

      let users = await getUsersForCity(ev.city);
      if (users.length === 0) users = await getAllUsers();

      let sent = 0;
      const batchSize = 50;
      for (let i = 0; i < users.length; i += batchSize) {
        const batch = users.slice(i, i + batchSize);
        await Promise.allSettled(batch.map(user =>
          transporter.sendMail({
            from:    fromLabel,
            to:      user.email,
            subject: `⏰ Tomorrow: ${ev.emoji || '🎉'} ${ev.title} at ${ev.venueName} — Don't miss it`,
            html:    buildReminderEmail(ev, user),
          }).then(() => sent++)
            .catch(err => console.error(`[reminder error] ${user.email}: ${err.message}`))
        ));
      }

      console.log(`[sendReminders] "${ev.title}": sent ${sent} reminders`);
      await eventDoc.ref.update({ reminderSent: true, reminderSentAt: Timestamp.now() });
    }
  }
);

// ══════════════════════════════════════════════════════════════════════════════
// EMAIL TEMPLATES
// ══════════════════════════════════════════════════════════════════════════════

function buildApprovalEmail(ev, user) {
  const firstName  = (user.fullName || user.email.split('@')[0]).split(' ')[0];
  const priceText  = (!ev.price || ev.price === 0) ? 'Free Entry' : `${Number(ev.price).toLocaleString()} VND`;
  const dateFormatted = ev.date
    ? new Date(ev.date).toLocaleDateString('en-US', { weekday:'long', year:'numeric', month:'long', day:'numeric' })
    : '';

  return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;padding:0;background:#080810;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#080810;padding:32px 16px">
<tr><td align="center">
<table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%">

  <!-- HEADER -->
  <tr><td style="text-align:center;padding-bottom:24px">
    <div style="display:inline-block;background:rgba(245,200,66,0.1);border:1px solid rgba(245,200,66,0.3);border-radius:12px;padding:8px 18px">
      <span style="color:#f5c842;font-size:16px;font-weight:800;letter-spacing:2px">🌙 TONIGHT VIETNAM</span>
    </div>
  </td></tr>

  <!-- FLYER CARD -->
  <tr><td style="background:linear-gradient(135deg,#13131f 0%,#0e0e1a 100%);border:1px solid rgba(245,200,66,0.2);border-radius:20px;overflow:hidden">

    <!-- EVENT EMOJI BANNER -->
    <div style="background:linear-gradient(135deg,rgba(245,200,66,0.15) 0%,rgba(245,200,66,0.05) 100%);padding:40px 32px;text-align:center;border-bottom:1px solid rgba(255,255,255,0.07)">
      <div style="font-size:64px;margin-bottom:16px">${ev.emoji || '🎉'}</div>
      <h1 style="color:#ffffff;font-size:28px;font-weight:800;margin:0 0 8px;letter-spacing:-0.5px;line-height:1.2">${escHtml(ev.title)}</h1>
      <p style="color:#f5c842;font-size:16px;font-weight:600;margin:0">${escHtml(ev.venueName)}</p>
      <p style="color:#94a3b8;font-size:14px;margin:4px 0 0">${escHtml(ev.city || '')}</p>
    </div>

    <!-- EVENT DETAILS -->
    <div style="padding:32px">
      <!-- Greeting -->
      <p style="color:#f1f5f9;font-size:16px;margin:0 0 24px">
        Hey ${escHtml(firstName)},<br/><br/>
        A new event just dropped that you don't want to miss 👇
      </p>

      <!-- Details Table -->
      <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px">
        <tr>
          <td style="padding:12px 0;border-bottom:1px solid rgba(255,255,255,0.07)">
            <span style="color:#475569;font-size:12px;text-transform:uppercase;letter-spacing:1px;font-weight:600">📅 Date</span><br/>
            <span style="color:#f1f5f9;font-size:15px;font-weight:600;margin-top:4px;display:block">${escHtml(dateFormatted)}</span>
          </td>
        </tr>
        <tr>
          <td style="padding:12px 0;border-bottom:1px solid rgba(255,255,255,0.07)">
            <span style="color:#475569;font-size:12px;text-transform:uppercase;letter-spacing:1px;font-weight:600">⏰ Time</span><br/>
            <span style="color:#f1f5f9;font-size:15px;font-weight:600;margin-top:4px;display:block">${escHtml(ev.time || 'Doors open from 9PM')}</span>
          </td>
        </tr>
        <tr>
          <td style="padding:12px 0;border-bottom:1px solid rgba(255,255,255,0.07)">
            <span style="color:#475569;font-size:12px;text-transform:uppercase;letter-spacing:1px;font-weight:600">🎵 Type</span><br/>
            <span style="color:#f1f5f9;font-size:15px;font-weight:600;margin-top:4px;display:block">${escHtml(ev.genre || 'Special Event')}</span>
          </td>
        </tr>
        <tr>
          <td style="padding:12px 0">
            <span style="color:#475569;font-size:12px;text-transform:uppercase;letter-spacing:1px;font-weight:600">🎟️ Entry</span><br/>
            <span style="color:${!ev.price || ev.price === 0 ? '#22c55e' : '#f5c842'};font-size:15px;font-weight:700;margin-top:4px;display:block">${escHtml(priceText)}</span>
          </td>
        </tr>
      </table>

      <!-- Description -->
      ${ev.description ? `<p style="color:#94a3b8;font-size:14px;line-height:1.7;margin:0 0 28px;padding:16px;background:rgba(255,255,255,0.04);border-radius:10px;border-left:3px solid rgba(245,200,66,0.4)">${escHtml(ev.description)}</p>` : ''}

      <!-- CTA -->
      <div style="text-align:center">
        <a href="https://tonightvietnam.com" style="display:inline-block;background:#f5c842;color:#000;font-size:15px;font-weight:700;padding:16px 40px;border-radius:12px;text-decoration:none;letter-spacing:0.3px">
          View Event on Tonight Vietnam →
        </a>
      </div>
    </div>

  </td></tr>

  <!-- FOOTER -->
  <tr><td style="text-align:center;padding:24px 0">
    <p style="color:#475569;font-size:12px;margin:0 0 8px">Tonight Vietnam · Discover the best nightlife in Vietnam</p>
    <p style="color:#475569;font-size:11px;margin:0">
      You're receiving this because you joined Tonight Vietnam in ${escHtml(user.city || 'Vietnam')}.<br/>
      <a href="https://tonightvietnam.com/unsubscribe?email=${encodeURIComponent(user.email)}" style="color:#475569">Unsubscribe</a>
    </p>
  </td></tr>

</table>
</td></tr>
</table>
</body>
</html>`;
}

function buildReminderEmail(ev, user) {
  const firstName  = (user.fullName || user.email.split('@')[0]).split(' ')[0];
  const priceText  = (!ev.price || ev.price === 0) ? 'Free Entry' : `${Number(ev.price).toLocaleString()} VND`;

  return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;padding:0;background:#080810;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#080810;padding:32px 16px">
<tr><td align="center">
<table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%">

  <!-- REMINDER BANNER -->
  <tr><td style="background:linear-gradient(135deg,rgba(239,68,68,0.15),rgba(239,68,68,0.05));border:1px solid rgba(239,68,68,0.3);border-radius:16px;padding:16px 24px;text-align:center;margin-bottom:20px">
    <p style="color:#ef4444;font-size:13px;font-weight:700;letter-spacing:2px;text-transform:uppercase;margin:0">⏰ HAPPENING TOMORROW</p>
  </td></tr>

  <tr><td style="height:16px"></td></tr>

  <!-- MAIN CARD -->
  <tr><td style="background:#13131f;border:1px solid rgba(245,200,66,0.2);border-radius:20px;overflow:hidden">
    <div style="background:linear-gradient(135deg,rgba(245,200,66,0.12) 0%,rgba(245,200,66,0.04) 100%);padding:36px 32px;text-align:center;border-bottom:1px solid rgba(255,255,255,0.07)">
      <div style="font-size:56px;margin-bottom:12px">${ev.emoji || '🎉'}</div>
      <h1 style="color:#ffffff;font-size:26px;font-weight:800;margin:0 0 8px">${escHtml(ev.title)}</h1>
      <p style="color:#f5c842;font-size:15px;font-weight:600;margin:0">${escHtml(ev.venueName)} · ${escHtml(ev.city || '')}</p>
    </div>
    <div style="padding:28px 32px;text-align:center">
      <p style="color:#f1f5f9;font-size:16px;margin:0 0 20px">
        Hey ${escHtml(firstName)}, don't forget — <strong style="color:#f5c842">${escHtml(ev.title)}</strong> is tomorrow!
      </p>
      <div style="display:inline-flex;gap:24px;margin-bottom:28px">
        <span style="color:#94a3b8;font-size:14px">🕐 ${escHtml(ev.time || '9:00 PM')}</span>
        &nbsp;&nbsp;
        <span style="color:${!ev.price || ev.price === 0 ? '#22c55e' : '#f5c842'};font-size:14px;font-weight:600">${escHtml(priceText)}</span>
      </div>
      <br/>
      <a href="https://tonightvietnam.com" style="display:inline-block;background:#f5c842;color:#000;font-size:14px;font-weight:700;padding:14px 36px;border-radius:12px;text-decoration:none">
        View Event Details →
      </a>
    </div>
  </td></tr>

  <!-- FOOTER -->
  <tr><td style="text-align:center;padding:20px 0">
    <p style="color:#475569;font-size:11px;margin:0">
      Tonight Vietnam · <a href="https://tonightvietnam.com/unsubscribe?email=${encodeURIComponent(user.email)}" style="color:#475569">Unsubscribe</a>
    </p>
  </td></tr>

</table>
</td></tr>
</table>
</body>
</html>`;
}

function escHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ══════════════════════════════════════════════════════════════════════════════
// FUNCTION 3: onGuestlistCreate
// Fires when a guestlist doc is created → sends QR ticket email to guest
// ══════════════════════════════════════════════════════════════════════════════
exports.onGuestlistCreate = onDocumentCreated(
  {
    document: 'guestlist/{id}',
    secrets:  [EMAIL_USER, EMAIL_PASS, EMAIL_FROM],
    region:   'asia-southeast1',
  },
  async (event) => {
    const tk = event.data.data();
    if (!tk.buyerEmail) return;

    const transporter = makeTransporter(EMAIL_USER.value(), EMAIL_PASS.value());
    const fromLabel   = EMAIL_FROM.value() || `Tonight Vietnam <${EMAIL_USER.value()}>`;
    const ref         = tk.ref || 'TN-XXXX-XXXX';
    const qrUrl       = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&color=000000&bgcolor=ffffff&data=${encodeURIComponent('TONIGHT:' + ref)}`;
    const firstName   = (tk.buyerName || 'Guest').split(' ')[0];

    const dateFormatted = tk.date
      ? new Date(tk.date).toLocaleDateString('en-US', { weekday:'long', year:'numeric', month:'long', day:'numeric' })
      : '';

    const html = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"/></head>
<body style="margin:0;padding:0;background:#080810;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#080810;padding:32px 16px">
<tr><td align="center">
<table width="520" cellpadding="0" cellspacing="0" style="max-width:520px;background:#13131f;border:1px solid rgba(0,208,132,0.25);border-radius:20px;overflow:hidden">
  <tr><td style="background:linear-gradient(135deg,rgba(0,208,132,0.15),rgba(0,208,132,0.05));padding:32px;text-align:center;border-bottom:1px solid rgba(255,255,255,0.07)">
    <div style="font-size:28px;font-weight:900;letter-spacing:4px;color:#f5c842">TONIGHT</div>
    <div style="font-size:11px;letter-spacing:3px;color:rgba(255,255,255,0.4);margin-top:4px">VIETNAM · GUESTLIST TICKET</div>
  </td></tr>
  <tr><td style="padding:28px 32px 0">
    <div style="font-size:20px;font-weight:700;color:#fff;margin-bottom:8px">You're on the list, ${escHtml(firstName)}! 🎉</div>
    <div style="font-size:14px;color:rgba(255,255,255,0.55);line-height:1.6">Show the QR code at the door — staff will scan it to check you in instantly.</div>
  </td></tr>
  <tr><td style="padding:20px 32px">
    <div style="background:rgba(0,208,132,0.07);border:1px solid rgba(0,208,132,0.2);border-radius:10px;padding:16px">
      <div style="font-size:16px;font-weight:700;color:#fff;margin-bottom:10px">${escHtml(tk.eventTitle || 'Your Event')}</div>
      ${dateFormatted ? `<div style="font-size:13px;color:rgba(255,255,255,0.7);margin-bottom:4px">📅 ${escHtml(dateFormatted)}</div>` : ''}
      ${tk.venue ? `<div style="font-size:13px;color:rgba(255,255,255,0.7);margin-bottom:4px">📍 ${escHtml(tk.venue)}${tk.city ? ', ' + escHtml(tk.city) : ''}</div>` : ''}
      <div style="font-size:13px;color:rgba(255,255,255,0.7)">🎟 ${escHtml(tk.ticketType || 'Guestlist')} × ${tk.qty || 1}</div>
    </div>
  </td></tr>
  <tr><td style="padding:0 32px 24px;text-align:center">
    <div style="background:#fff;border-radius:12px;padding:20px;display:inline-block">
      <img src="${qrUrl}" width="200" height="200" alt="QR Code" style="display:block;border-radius:4px"/>
      <div style="margin-top:8px;font-size:10px;font-weight:700;letter-spacing:1.5px;color:#333;font-family:monospace">${escHtml(ref)}</div>
    </div>
    <div style="font-size:12px;color:rgba(255,255,255,0.35);margin-top:10px">Show this QR at venue entry · Staff scans to check you in</div>
  </td></tr>
  <tr><td style="background:rgba(255,255,255,0.03);border-top:1px solid rgba(255,255,255,0.06);padding:18px 32px;text-align:center">
    <div style="font-size:11px;color:rgba(255,255,255,0.25)">Free guestlist · Entry subject to venue confirmation<br/>
    <a href="https://tonightvietnam.com" style="color:rgba(255,255,255,0.35)">tonightvietnam.com</a></div>
  </td></tr>
</table>
</td></tr></table>
</body></html>`;

    await transporter.sendMail({
      from:    fromLabel,
      to:      tk.buyerEmail,
      subject: `🎫 Your Tonight Ticket — ${tk.eventTitle || 'Guestlist Confirmed'}`,
      html,
    });

    // Mark email sent
    await event.data.ref.update({ emailSent: true, emailSentAt: Timestamp.now() });
    console.log(`[onGuestlistCreate] QR ticket sent to ${tk.buyerEmail} ref=${ref}`);
  }
);

// ══════════════════════════════════════════════════════════════════════════════
// FUNCTION 4: onDealCreate
// Fires when a deal is claimed → sends QR deal voucher email
// ══════════════════════════════════════════════════════════════════════════════
exports.onDealCreate = onDocumentCreated(
  {
    document: 'deals/{id}',
    secrets:  [EMAIL_USER, EMAIL_PASS, EMAIL_FROM],
    region:   'asia-southeast1',
  },
  async (event) => {
    const dl = event.data.data();
    if (!dl.guestEmail) return;

    const transporter = makeTransporter(EMAIL_USER.value(), EMAIL_PASS.value());
    const fromLabel   = EMAIL_FROM.value() || `Tonight Vietnam <${EMAIL_USER.value()}>`;
    const code        = dl.code || '';
    const qrData      = dl.qrData || ('TONIGHT-DEAL:' + code);
    const qrUrl       = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&color=000000&bgcolor=ffffff&data=${encodeURIComponent(qrData)}`;
    const firstName   = (dl.guestName || 'Guest').split(' ')[0];
    const window_     = (dl.startTime && dl.endTime) ? `${dl.startTime}–${dl.endTime}` : 'tonight';

    const html = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"/></head>
<body style="margin:0;padding:0;background:#080810;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#080810;padding:32px 16px">
<tr><td align="center">
<table width="520" cellpadding="0" cellspacing="0" style="max-width:520px;background:#13131f;border:1px solid rgba(245,200,66,0.25);border-radius:20px;overflow:hidden">
  <tr><td style="background:linear-gradient(135deg,rgba(245,200,66,0.15),rgba(245,200,66,0.05));padding:32px;text-align:center;border-bottom:1px solid rgba(255,255,255,0.07)">
    <div style="font-size:28px;font-weight:900;letter-spacing:4px;color:#f5c842">TONIGHT</div>
    <div style="font-size:11px;letter-spacing:3px;color:rgba(255,255,255,0.4);margin-top:4px">VIETNAM · DEAL VOUCHER</div>
  </td></tr>
  <tr><td style="padding:28px 32px 0">
    <div style="font-size:20px;font-weight:700;color:#fff;margin-bottom:8px">Your deal is confirmed, ${escHtml(firstName)}! 🎉</div>
    <div style="font-size:14px;color:rgba(255,255,255,0.55);line-height:1.6">Show the QR code at the venue to unlock your offer instantly.</div>
  </td></tr>
  <tr><td style="padding:20px 32px">
    <div style="background:rgba(245,200,66,0.07);border:1px solid rgba(245,200,66,0.2);border-radius:10px;padding:16px">
      <span style="background:#f5c842;color:#000;font-size:12px;font-weight:900;letter-spacing:1px;padding:3px 10px;border-radius:20px">${escHtml(dl.discount || 'DEAL')}</span>
      <div style="font-size:16px;font-weight:700;color:#fff;margin:10px 0 8px">${escHtml(dl.dealTitle || 'Special Offer')}</div>
      ${dl.venueName ? `<div style="font-size:13px;color:rgba(255,255,255,0.7);margin-bottom:4px">📍 ${escHtml(dl.venueName)}${dl.city ? ', ' + escHtml(dl.city) : ''}</div>` : ''}
      <div style="font-size:13px;color:rgba(255,255,255,0.7)">🕐 Valid ${escHtml(window_)}</div>
    </div>
  </td></tr>
  <tr><td style="padding:0 32px 24px;text-align:center">
    <div style="background:#fff;border-radius:12px;padding:20px;display:inline-block">
      <img src="${qrUrl}" width="200" height="200" alt="QR Code" style="display:block;border-radius:4px"/>
      <div style="margin-top:8px;font-size:10px;font-weight:700;letter-spacing:1.5px;color:#333;font-family:monospace">${escHtml(code)}</div>
    </div>
    <div style="font-size:12px;color:rgba(255,255,255,0.35);margin-top:10px">Show this QR at the venue · Staff scans to unlock your deal</div>
  </td></tr>
  <tr><td style="background:rgba(255,255,255,0.03);border-top:1px solid rgba(255,255,255,0.06);padding:18px 32px;text-align:center">
    <div style="font-size:11px;color:rgba(255,255,255,0.25)">Deal subject to venue availability<br/>
    <a href="https://tonightvietnam.com" style="color:rgba(255,255,255,0.35)">tonightvietnam.com</a></div>
  </td></tr>
</table>
</td></tr></table>
</body></html>`;

    await transporter.sendMail({
      from:    fromLabel,
      to:      dl.guestEmail,
      subject: `🎫 Your Tonight Deal — ${dl.dealTitle || 'Deal Confirmed'} at ${dl.venueName || ''}`,
      html,
    });

    await event.data.ref.update({ emailSent: true, emailSentAt: Timestamp.now() });
    console.log(`[onDealCreate] Deal voucher sent to ${dl.guestEmail} code=${code}`);
  }
);

// ══════════════════════════════════════════════════════════════════════════════
// FUNCTION 5: onVenueApproved
// Fires when a venue_request is updated to status='approved'.
// Creates a Firebase Auth account for the venue owner and sends a
// password-setup email so they can log in to the Venue Portal.
// ══════════════════════════════════════════════════════════════════════════════
const { getAuth: getAdminAuth } = require('firebase-admin/auth');

exports.onVenueApproved = onDocumentUpdated(
  {
    document: 'venue_requests/{reqId}',
    secrets:  [EMAIL_USER, EMAIL_PASS, EMAIL_FROM],
    region:   'asia-southeast1',
  },
  async (event) => {
    const before = event.data.before.data();
    const after  = event.data.after.data();

    // Only run when status flips to 'approved'
    if (before.status === 'approved' || after.status !== 'approved') return;

    const email     = after.email;
    const venueName = after.venueName || after.venue_name || 'Your Venue';
    const reqId     = event.params.reqId;

    if (!email) {
      console.warn('[onVenueApproved] No email on venue_request', reqId);
      return;
    }

    console.log(`[onVenueApproved] Creating auth account for ${email}`);

    const adminAuth  = getAdminAuth();
    let   uid;

    try {
      // Create Firebase Auth account (or get existing)
      try {
        const user = await adminAuth.createUser({ email, emailVerified: false });
        uid = user.uid;
      } catch (e) {
        if (e.code === 'auth/email-already-exists') {
          const user = await adminAuth.getUserByEmail(email);
          uid = user.uid;
        } else {
          throw e;
        }
      }

      // Generate a password-reset link so the venue owner can set their password
      const resetLink = await adminAuth.generatePasswordResetLink(email);

      // Send the welcome + login setup email
      const transporter = makeTransporter(EMAIL_USER.value(), EMAIL_PASS.value());
      const fromLabel   = EMAIL_FROM.value() || `Tonight Vietnam <${EMAIL_USER.value()}>`;

      await transporter.sendMail({
        from:    fromLabel,
        to:      email,
        subject: `✅ ${venueName} is approved — set up your login`,
        html: `<!DOCTYPE html>
<html><head><meta charset="UTF-8"/></head>
<body style="margin:0;padding:0;background:#080810;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#080810;padding:32px 16px">
<tr><td align="center">
<table width="520" cellpadding="0" cellspacing="0" style="max-width:520px;background:#13131f;border:1px solid rgba(245,200,66,0.25);border-radius:20px;overflow:hidden">
  <tr><td style="background:linear-gradient(135deg,rgba(245,200,66,0.15),rgba(245,200,66,0.05));padding:32px;text-align:center;border-bottom:1px solid rgba(255,255,255,0.07)">
    <div style="font-size:28px;font-weight:900;letter-spacing:4px;color:#f5c842">🌙 TONIGHT</div>
    <div style="font-size:11px;letter-spacing:3px;color:rgba(255,255,255,0.4);margin-top:4px">VIETNAM · VENUE APPROVED</div>
  </td></tr>
  <tr><td style="padding:28px 32px">
    <h2 style="color:#22c55e;font-size:22px;margin:0 0 12px">✅ You're approved!</h2>
    <p style="color:#f1f5f9;font-size:15px;line-height:1.7;margin:0 0 20px">
      <strong>${escHtml(venueName)}</strong> is now live on Tonight Vietnam.<br/>
      Click the button below to set your password and access your Venue Portal.
    </p>
    <div style="text-align:center;margin:28px 0">
      <a href="${resetLink}" style="display:inline-block;background:#f5c842;color:#000;font-size:15px;font-weight:700;padding:16px 40px;border-radius:12px;text-decoration:none">
        Set Up Your Login →
      </a>
    </div>
    <p style="color:#475569;font-size:13px;line-height:1.6;margin:0">
      After setting your password, log in at:<br/>
      <a href="https://tonightvietnam.com/venue.html" style="color:#f5c842">tonightvietnam.com/venue.html</a>
    </p>
  </td></tr>
  <tr><td style="background:rgba(255,255,255,0.03);border-top:1px solid rgba(255,255,255,0.06);padding:16px 32px;text-align:center">
    <div style="font-size:11px;color:rgba(255,255,255,0.25)">Tonight Vietnam · <a href="https://tonightvietnam.com" style="color:rgba(255,255,255,0.35)">tonightvietnam.com</a></div>
  </td></tr>
</table>
</td></tr></table>
</body></html>`,
      });

      // Store uid back on the venue_request for cross-referencing
      await event.data.after.ref.update({ uid, authCreated: true });
      console.log(`[onVenueApproved] Auth account created and email sent to ${email} uid=${uid}`);

    } catch (err) {
      console.error('[onVenueApproved] Error:', err.message);
    }
  }
);
