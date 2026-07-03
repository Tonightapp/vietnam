/**
 * Tonight Vietnam — Firebase Cloud Functions v2
 *
 * Two core functions:
 *  1. onEventApproved    — fires when admin approves an event → emails all users in that city
 *  2. sendReminders      — runs daily at 10:00 AM Vietnam time → emails users about tomorrow's events
 *  3. cleanOldGuestlist  — runs daily at 4:00 AM Vietnam time → deletes past guestlist entries
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
const { onRequest }                  = require('firebase-functions/v2/https');
const { initializeApp }              = require('firebase-admin/app');
const { getFirestore, Timestamp }    = require('firebase-admin/firestore');
const nodemailer                     = require('nodemailer');
const crypto                         = require('crypto');
// QR codes are generated via api.qrserver.com — hosted URLs work in all email clients
// (base64 data URIs are stripped by Gmail and most email providers)

initializeApp();
const db = getFirestore();

// ── Admin email — set ADMIN_EMAIL in Firebase Secret Manager:
//    firebase functions:secrets:set ADMIN_EMAIL
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'app.tonight1@gmail.com';

// ── Allowed origins for CORS on HTTP endpoints ─────────────────────────────────
const ALLOWED_ORIGINS = [
  'https://tonightvietnam.com',
  'https://www.tonightvietnam.com',
  'https://tonight-vietnam.web.app',
  'https://tonight-vietnam.firebaseapp.com',
];

// ── Email config from environment variables ────────────────────────────────────
const EMAIL_USER = { value: () => process.env.EMAIL_USER };
const EMAIL_PASS = { value: () => process.env.EMAIL_PASS };
const EMAIL_FROM = { value: () => process.env.EMAIL_FROM };

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
  // Deduplicate to avoid Firestore error when city is already '' or undefined
  const cities = city ? [...new Set([city, ''])] : [''];
  const snap = await db.collection('community_signups')
    .where('city', 'in', cities)
    .limit(500)
    .get();
  return snap.docs.map(d => {
    const u = d.data();
    return { email: u.email, fullName: u.fullName || u.name || '', city: u.city || '', unsubscribed: u.unsubscribed || false };
  }).filter(u => u.email && !u.unsubscribed);
}

// ── Helper: get ALL community subscribers (fallback) ──────────────────────────
async function getAllUsers() {
  const snap = await db.collection('community_signups').limit(500).get();
  return snap.docs.map(d => {
    const u = d.data();
    return { email: u.email, fullName: u.fullName || u.name || '', city: u.city || '', unsubscribed: u.unsubscribed || false };
  }).filter(u => u.email && !u.unsubscribed);
}

// ══════════════════════════════════════════════════════════════════════════════
// FUNCTION 1: onEventApproved
// Triggers whenever an event document is updated.
// When status changes to 'approved' → blast email to all users in that city.
// ══════════════════════════════════════════════════════════════════════════════
exports.onEventApproved = onDocumentUpdated(
  {
    document: 'events/{eventId}',
    region:   'asia-southeast1',
  },
  async (event) => {
    const before = event.data.before.data();
    const after  = event.data.after.data();

    // Only run when status flips to 'approved'
    if (before.status === 'approved' || after.status !== 'approved') return;

    // Atomic guard — prevents duplicate sends if two updates fire simultaneously
    let shouldSend = false;
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(event.data.after.ref);
      if (snap.data().emailSent) return;
      tx.update(event.data.after.ref, { emailSent: true, emailSentAt: Timestamp.now() });
      shouldSend = true;
    });
    if (!shouldSend) { console.log('[onEventApproved] Already sent, skipping.'); return; }

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

    // Update count only (emailSent already set atomically above)
    await event.data.after.ref.update({ emailCount: sent });
  }
);

// ══════════════════════════════════════════════════════════════════════════════
// FUNCTION 2: sendReminders
// Runs daily at 10:00 AM Vietnam time (UTC+7 = 03:00 UTC).
// Finds all approved events happening TOMORROW and sends reminder emails.
// ══════════════════════════════════════════════════════════════════════════════
exports.sendReminders = onSchedule(
  {
    schedule:  '0 3 * * *',         // 03:00 UTC = 10:00 AM Ho Chi Minh City
    timeZone:  'UTC',
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
      .where('reminderSent', 'in', [false, null])
      .get();

    if (eventsSnap.empty) {
      console.log('[sendReminders] No events tomorrow — nothing to do.');
      return;
    }

    console.log(`[sendReminders] Found ${eventsSnap.size} event(s) for ${dateStr}`);

    const transporter = makeTransporter(EMAIL_USER.value(), EMAIL_PASS.value());
    const fromLabel   = EMAIL_FROM.value() || `Tonight Vietnam <${EMAIL_USER.value()}>`;

    // Pre-fetch user lists per unique city to avoid one Firestore read per event
    const uniqueCities = [...new Set(eventsSnap.docs.map(d => d.data().city || ''))];
    const cityUserMap  = new Map();
    for (const city of uniqueCities) {
      cityUserMap.set(city, await getUsersForCity(city));
    }
    let allUsersCache = null;

    for (const eventDoc of eventsSnap.docs) {
      const ev = eventDoc.data();
      try {
        let users = cityUserMap.get(ev.city || '') || [];
        if (users.length === 0) {
          if (!allUsersCache) allUsersCache = await getAllUsers();
          users = allUsersCache;
        }

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
      } catch (err) {
        // Don't let one bad event abort reminders for every other event tonight.
        console.error(`[sendReminders] failed for event "${ev.title}" (${eventDoc.id}): ${err.message}`);
      }
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

// ══════════════════════════════════════════════════════════════════════════════
// FUNCTION 9: notifyAdminNewUser
// Fallback trigger on users/{uid} with role='user' — catches member signups
// that go through Firebase Auth but don't write to community_signups.
// ══════════════════════════════════════════════════════════════════════════════
exports.notifyAdminNewUser = onDocumentCreated(
  { document: 'users/{uid}', region: 'asia-southeast1' },
  async (event) => {
    const u = event.data.data();
    if (!u.email || u.role !== 'user') return;
    const transporter = makeTransporter(EMAIL_USER.value(), EMAIL_PASS.value());
    const fromLabel   = EMAIL_FROM.value() || `Tonight Vietnam <${EMAIL_USER.value()}>`;
    const joinedAt    = new Date().toLocaleString('en-GB', { timeZone: 'Asia/Ho_Chi_Minh' });
    try {
      await transporter.sendMail({
        from: fromLabel, to: ADMIN_EMAIL,
        subject: `🎉 New member joined — ${u.fullName || u.email}`,
        html: adminAlertHtml('🎉', 'rgba(34,197,94,.3)', 'New Member Joined', [
          ['Name',      u.fullName || '—'],
          ['Email',     u.email],
          ['Joined at', joinedAt + ' (VN time)'],
        ]),
      });
      console.log(`[notifyAdminNewUser] Admin notified: ${u.email}`);
    } catch (err) { console.error(`[notifyAdminNewUser] ${err.message}`); }
  }
);

// ══════════════════════════════════════════════════════════════════════════════
// FUNCTION 10: notifyAdminGuestlist
// Fires when someone joins a guestlist → emails admin.
// ══════════════════════════════════════════════════════════════════════════════
exports.notifyAdminGuestlist = onDocumentCreated(
  { document: 'guestlist/{id}', region: 'asia-southeast1' },
  async (event) => {
    const g = event.data.data();
    if (!g.buyerEmail) return;
    const transporter = makeTransporter(EMAIL_USER.value(), EMAIL_PASS.value());
    const fromLabel   = EMAIL_FROM.value() || `Tonight Vietnam <${EMAIL_USER.value()}>`;
    const at = new Date().toLocaleString('en-GB', { timeZone: 'Asia/Ho_Chi_Minh' });
    try {
      await transporter.sendMail({
        from: fromLabel, to: ADMIN_EMAIL,
        subject: `🎫 Guestlist join — ${g.eventTitle || 'Event'}`,
        html: adminAlertHtml('🎫', 'rgba(139,92,246,.3)', 'New Guestlist Entry', [
          ['Guest',     g.buyerName  || '—'],
          ['Email',     g.buyerEmail],
          ['Event',     g.eventTitle || '—'],
          ['Ticket',    `${g.ticketType || 'Guestlist'} × ${g.qty || 1}`],
          ['Ref',       g.ref        || '—'],
          ['At',        at + ' (VN time)'],
        ]),
      });
      console.log(`[notifyAdminGuestlist] Admin notified: ${g.buyerEmail}`);
    } catch (err) { console.error(`[notifyAdminGuestlist] ${err.message}`); }
  }
);

// ══════════════════════════════════════════════════════════════════════════════
// FUNCTION 11: notifyAdminDealClaimed
// Fires when someone claims a deal → emails admin.
// ══════════════════════════════════════════════════════════════════════════════
exports.notifyAdminDealClaimed = onDocumentCreated(
  { document: 'deals/{id}', region: 'asia-southeast1' },
  async (event) => {
    const d = event.data.data();
    if (!d.guestEmail && !d.dealTitle) return;
    const transporter = makeTransporter(EMAIL_USER.value(), EMAIL_PASS.value());
    const fromLabel   = EMAIL_FROM.value() || `Tonight Vietnam <${EMAIL_USER.value()}>`;
    const at = new Date().toLocaleString('en-GB', { timeZone: 'Asia/Ho_Chi_Minh' });
    try {
      await transporter.sendMail({
        from: fromLabel, to: ADMIN_EMAIL,
        subject: `🏷️ Deal claimed — ${d.dealTitle || 'Deal'}`,
        html: adminAlertHtml('🏷️', 'rgba(245,200,66,.3)', 'Deal Claimed', [
          ['Guest',   d.guestName  || '—'],
          ['Email',   d.guestEmail || '—'],
          ['Deal',    d.dealTitle  || '—'],
          ['Venue',   d.venueName  || '—'],
          ['Code',    d.code       || '—'],
          ['At',      at + ' (VN time)'],
        ]),
      });
      console.log(`[notifyAdminDealClaimed] Admin notified: deal=${d.dealTitle}`);
    } catch (err) { console.error(`[notifyAdminDealClaimed] ${err.message}`); }
  }
);

// ══════════════════════════════════════════════════════════════════════════════
// FUNCTION 12: notifyAdminEventSubmitted
// Fires when a new event is created with status='pending' → emails admin.
// ══════════════════════════════════════════════════════════════════════════════
exports.notifyAdminEventSubmitted = onDocumentCreated(
  { document: 'events/{id}', region: 'asia-southeast1' },
  async (event) => {
    const ev = event.data.data();
    if (ev.status !== 'pending') return;
    const transporter = makeTransporter(EMAIL_USER.value(), EMAIL_PASS.value());
    const fromLabel   = EMAIL_FROM.value() || `Tonight Vietnam <${EMAIL_USER.value()}>`;
    const at = new Date().toLocaleString('en-GB', { timeZone: 'Asia/Ho_Chi_Minh' });
    try {
      await transporter.sendMail({
        from: fromLabel, to: ADMIN_EMAIL,
        subject: `📋 New event submitted — ${ev.title || 'Event'} (awaiting approval)`,
        html: adminAlertHtml('📋', 'rgba(59,130,246,.3)', 'New Event Awaiting Approval', [
          ['Title',   ev.title     || '—'],
          ['Venue',   ev.venueName || '—'],
          ['City',    ev.city      || '—'],
          ['Date',    ev.date      || '—'],
          ['Genre',   ev.genre     || '—'],
          ['Submitted', at + ' (VN time)'],
        ]),
      });
      console.log(`[notifyAdminEventSubmitted] Admin notified: ${ev.title}`);
    } catch (err) { console.error(`[notifyAdminEventSubmitted] ${err.message}`); }
  }
);

// ══════════════════════════════════════════════════════════════════════════════
// FUNCTION 13: notifyAdminInquiry
// Fires when a new inquiry is submitted → emails admin.
// ══════════════════════════════════════════════════════════════════════════════
exports.notifyAdminInquiry = onDocumentCreated(
  { document: 'inquiries/{id}', region: 'asia-southeast1' },
  async (event) => {
    const inq = event.data.data();
    if (!inq.email) return;
    const transporter = makeTransporter(EMAIL_USER.value(), EMAIL_PASS.value());
    const fromLabel   = EMAIL_FROM.value() || `Tonight Vietnam <${EMAIL_USER.value()}>`;
    const at = new Date().toLocaleString('en-GB', { timeZone: 'Asia/Ho_Chi_Minh' });
    try {
      await transporter.sendMail({
        from: fromLabel, to: ADMIN_EMAIL,
        subject: `📩 New inquiry from ${inq.name || inq.email}`,
        html: adminAlertHtml('📩', 'rgba(236,72,153,.3)', 'New Inquiry', [
          ['Name',    inq.name    || '—'],
          ['Email',   inq.email],
          ['Type',    inq.type    || '—'],
          ['Message', inq.message || '—'],
          ['At',      at + ' (VN time)'],
        ]),
      });
      console.log(`[notifyAdminInquiry] Admin notified: ${inq.email}`);
    } catch (err) { console.error(`[notifyAdminInquiry] ${err.message}`); }
  }
);

// ══════════════════════════════════════════════════════════════════════════════
// FUNCTION 14: notifyAdminProSignup
// Fires when a promoter / DJ signs up → emails admin.
// ══════════════════════════════════════════════════════════════════════════════
exports.notifyAdminProSignup = onDocumentCreated(
  { document: 'pro_signups/{id}', region: 'asia-southeast1' },
  async (event) => {
    const p = event.data.data();
    if (!p.email) return;
    const transporter = makeTransporter(EMAIL_USER.value(), EMAIL_PASS.value());
    const fromLabel   = EMAIL_FROM.value() || `Tonight Vietnam <${EMAIL_USER.value()}>`;
    const at = new Date().toLocaleString('en-GB', { timeZone: 'Asia/Ho_Chi_Minh' });
    try {
      await transporter.sendMail({
        from: fromLabel, to: ADMIN_EMAIL,
        subject: `🎧 New promoter/DJ signup — ${p.name || p.email}`,
        html: adminAlertHtml('🎧', 'rgba(245,158,11,.3)', 'New Promoter / DJ Signup', [
          ['Name',  p.name  || '—'],
          ['Email', p.email],
          ['Type',  p.type  || '—'],
          ['At',    at + ' (VN time)'],
        ]),
      });
      console.log(`[notifyAdminProSignup] Admin notified: ${p.email}`);
    } catch (err) { console.error(`[notifyAdminProSignup] ${err.message}`); }
  }
);

// ── Shared admin alert email template ────────────────────────────────────────
function adminAlertHtml(icon, borderColor, title, rows) {
  const rowsHtml = rows.map(([label, val]) => `
    <tr><td style="padding:10px 0;border-bottom:1px solid rgba(255,255,255,.07)">
      <span style="color:#475569;font-size:11px;text-transform:uppercase;letter-spacing:1px">${escHtml(label)}</span><br/>
      <span style="color:#f1f5f9;font-size:14px;font-weight:600;word-break:break-all">${escHtml(String(val))}</span>
    </td></tr>`).join('');
  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"/></head>
<body style="margin:0;padding:0;background:#080810;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#080810;padding:32px 16px">
<tr><td align="center">
<table width="480" cellpadding="0" cellspacing="0" style="max-width:480px;background:#13131f;border:1px solid ${borderColor};border-radius:20px;overflow:hidden">
  <tr><td style="background:linear-gradient(135deg,${borderColor},transparent);padding:24px 32px;text-align:center;border-bottom:1px solid rgba(255,255,255,.07)">
    <div style="font-size:32px;margin-bottom:6px">${icon}</div>
    <div style="color:#fff;font-size:16px;font-weight:800">${escHtml(title)}</div>
    <div style="color:rgba(255,255,255,.4);font-size:11px;margin-top:3px">Tonight Vietnam Admin Alert</div>
  </td></tr>
  <tr><td style="padding:20px 32px">
    <table width="100%" cellpadding="0" cellspacing="0">${rowsHtml}</table>
    <div style="text-align:center;margin-top:24px">
      <a href="https://tonightvietnam.com/portal/" style="display:inline-block;background:#f5c842;color:#000;font-size:13px;font-weight:700;padding:12px 28px;border-radius:10px;text-decoration:none">Open Admin Portal →</a>
    </div>
  </td></tr>
</table>
</td></tr></table>
</body></html>`;
}

// ── Boarding pass email template ──────────────────────────────────────────────
function buildBoardingPassEmail({ firstName, name, eventTitle, venue, city, dateShort, time, ticketType, qty, ref, qrUrl }) {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;padding:0;background:#07080f;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#07080f;padding:28px 12px">
<tr><td align="center">
<table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%">

  <!-- ── HEADER ── -->
  <tr><td style="text-align:center;padding-bottom:20px">
    <div style="display:inline-block;padding:6px 20px;border:1px solid rgba(245,200,66,.35);border-radius:30px;background:rgba(245,200,66,.08)">
      <span style="font-size:15px;font-weight:900;letter-spacing:4px;color:#f5c842">🌙 TONIGHT VIETNAM</span>
    </div>
    <div style="font-size:11px;letter-spacing:3px;color:rgba(255,255,255,.3);margin-top:8px;text-transform:uppercase">Electronic Boarding Pass</div>
  </td></tr>

  <!-- ── BOARDING PASS CARD ── -->
  <tr><td style="border-radius:20px;overflow:hidden;box-shadow:0 8px 40px rgba(0,0,0,.6)">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0e0f1a;border:1px solid rgba(245,200,66,.2);border-radius:20px;overflow:hidden">

    <!-- TOP STRIP -->
    <tr><td style="background:linear-gradient(135deg,#1a1200 0%,#0e0f1a 100%);padding:22px 28px 18px;border-bottom:1px solid rgba(245,200,66,.12)">
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td>
            <div style="font-size:10px;letter-spacing:2px;color:rgba(245,200,66,.6);text-transform:uppercase;margin-bottom:4px">Passenger</div>
            <div style="font-size:22px;font-weight:800;color:#fff;letter-spacing:.5px;text-transform:uppercase">${escHtml(name)}</div>
          </td>
          <td style="text-align:right;vertical-align:top">
            <div style="font-size:10px;letter-spacing:2px;color:rgba(245,200,66,.6);text-transform:uppercase;margin-bottom:4px">Ref</div>
            <div style="font-size:14px;font-weight:700;color:#f5c842;font-family:monospace;letter-spacing:2px">${escHtml(ref)}</div>
          </td>
        </tr>
      </table>
    </td></tr>

    <!-- MAIN BODY: LEFT INFO + RIGHT QR -->
    <tr>
      <!-- LEFT: event details -->
      <td style="padding:24px 0 24px 28px;vertical-align:top;width:55%">
        <div style="margin-bottom:20px">
          <div style="font-size:9px;letter-spacing:2.5px;color:rgba(245,200,66,.5);text-transform:uppercase;margin-bottom:6px">Event</div>
          <div style="font-size:18px;font-weight:800;color:#fff;line-height:1.2;text-transform:uppercase">${escHtml(eventTitle)}</div>
        </div>

        <table cellpadding="0" cellspacing="0" style="margin-bottom:20px">
          <tr>
            <td style="padding-right:24px;vertical-align:top">
              <div style="font-size:9px;letter-spacing:2px;color:rgba(245,200,66,.5);text-transform:uppercase;margin-bottom:5px">Date</div>
              <div style="font-size:14px;font-weight:700;color:#fff">${escHtml(dateShort)}</div>
            </td>
            <td style="vertical-align:top">
              <div style="font-size:9px;letter-spacing:2px;color:rgba(245,200,66,.5);text-transform:uppercase;margin-bottom:5px">Doors</div>
              <div style="font-size:14px;font-weight:700;color:#fff">${escHtml(time)}</div>
            </td>
          </tr>
        </table>

        <div style="margin-bottom:16px">
          <div style="font-size:9px;letter-spacing:2px;color:rgba(245,200,66,.5);text-transform:uppercase;margin-bottom:5px">Venue</div>
          <div style="font-size:13px;font-weight:600;color:rgba(255,255,255,.8)">${escHtml(venue)}</div>
          <div style="font-size:12px;color:rgba(255,255,255,.4);margin-top:2px">${escHtml(city)}, Vietnam</div>
        </div>

        <table cellpadding="0" cellspacing="0">
          <tr>
            <td style="padding-right:20px">
              <div style="font-size:9px;letter-spacing:2px;color:rgba(245,200,66,.5);text-transform:uppercase;margin-bottom:5px">Class</div>
              <div style="font-size:13px;font-weight:700;color:#f5c842">${escHtml(ticketType)}</div>
            </td>
            <td>
              <div style="font-size:9px;letter-spacing:2px;color:rgba(245,200,66,.5);text-transform:uppercase;margin-bottom:5px">Guests</div>
              <div style="font-size:13px;font-weight:700;color:#fff">${qty}</div>
            </td>
          </tr>
        </table>
      </td>

      <!-- DIVIDER (dashed) -->
      <td style="width:1px;padding:0 4px;vertical-align:middle">
        <div style="width:1px;background:repeating-linear-gradient(to bottom,rgba(245,200,66,.3) 0px,rgba(245,200,66,.3) 8px,transparent 8px,transparent 14px);height:200px;margin:0 auto"></div>
      </td>

      <!-- RIGHT: QR CODE -->
      <td style="padding:24px 28px 24px 20px;vertical-align:middle;text-align:center;width:44%">
        <div style="background:#fff;border-radius:12px;padding:10px;display:inline-block">
          <img src="${qrUrl}" width="130" height="130" alt="QR Code" style="display:block"/>
        </div>
        <div style="font-size:10px;font-weight:700;letter-spacing:1.5px;color:rgba(255,255,255,.4);margin-top:10px;font-family:monospace">${escHtml(ref)}</div>
        <div style="font-size:10px;color:rgba(255,255,255,.25);margin-top:6px">Scan at entry</div>
      </td>
    </tr>

    <!-- TEAR LINE -->
    <tr><td colspan="3" style="padding:0 16px">
      <div style="border-top:2px dashed rgba(245,200,66,.15);position:relative">
        <div style="position:absolute;top:-8px;left:-16px;width:16px;height:16px;border-radius:50%;background:#07080f"></div>
        <div style="position:absolute;top:-8px;right:-16px;width:16px;height:16px;border-radius:50%;background:#07080f"></div>
      </div>
    </td></tr>

    <!-- FOOTER STRIP -->
    <tr><td colspan="3" style="padding:16px 28px;background:rgba(0,0,0,.3)">
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td style="font-size:11px;color:rgba(255,255,255,.3)">
            Tonight Vietnam · tonightvietnam.com<br/>
            <span style="font-size:10px">Entry subject to organiser confirmation</span>
          </td>
          <td style="text-align:right">
            <div style="display:inline-block;background:rgba(245,200,66,.12);border:1px solid rgba(245,200,66,.3);border-radius:20px;padding:4px 12px">
              <span style="font-size:10px;font-weight:700;color:#f5c842;letter-spacing:1px">GUESTLIST ✓</span>
            </div>
          </td>
        </tr>
      </table>
    </td></tr>

  </table>
  </td></tr>

  <!-- BOTTOM MSG -->
  <tr><td style="text-align:center;padding:20px 0 0">
    <p style="color:rgba(255,255,255,.3);font-size:12px;margin:0">Hey ${escHtml(firstName)}, you're on the list — see you tonight 🎶</p>
    <p style="color:rgba(255,255,255,.15);font-size:11px;margin:8px 0 0">Screenshot or save this email — show the QR at the door</p>
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
    region:   'asia-southeast1',
  },
  async (event) => {
    const tk = event.data.data();
    const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!tk.buyerEmail || !emailRe.test(tk.buyerEmail)) return;
    if (tk.emailSent) return;

    const transporter = makeTransporter(EMAIL_USER.value(), EMAIL_PASS.value());
    const fromLabel   = EMAIL_FROM.value() || `Tonight Vietnam <${EMAIL_USER.value()}>`;
    const ref         = tk.ref || 'TN-XXXX-XXXX';
    const firstName   = (tk.buyerName || 'Guest').split(' ')[0];

    const dateFormatted = tk.date
      ? new Date(tk.date).toLocaleDateString('en-US', { weekday:'long', year:'numeric', month:'long', day:'numeric' })
      : '';

    const qrUrl      = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent('TONIGHT:' + ref)}&bgcolor=ffffff&color=000000&margin=8&format=png`;
    const dateShort  = tk.date ? new Date(tk.date).toLocaleDateString('en-GB',{weekday:'short',day:'numeric',month:'short',year:'numeric'}) : '—';
    const venue      = tk.venue || tk.venueName || '';
    const city       = tk.city  || 'Hanoi';

    const html = buildBoardingPassEmail({
      firstName,
      name:       tk.buyerName  || 'Guest',
      eventTitle: tk.eventTitle || 'Tonight Event',
      venue, city, dateShort,
      time:       tk.time       || '9:00 PM',
      ticketType: tk.ticketType || 'Guestlist',
      qty:        tk.qty        || 1,
      ref, qrUrl,
    });

    try {
      await transporter.sendMail({
        from:    fromLabel,
        to:      tk.buyerEmail,
        subject: `🎫 Your Ticket — ${tk.eventTitle || 'Tonight Vietnam'} · ${dateShort}`,
        html,
      });
      await event.data.ref.update({ emailSent: true, emailSentAt: Timestamp.now() });
      console.log(`[onGuestlistCreate] Boarding pass sent to ${tk.buyerEmail} ref=${ref}`);
    } catch (err) {
      console.error(`[onGuestlistCreate] Email failed for ${tk.buyerEmail}:`, err.message);
    }
  }
);

// ══════════════════════════════════════════════════════════════════════════════
// FUNCTION 4: onDealCreate
// Fires when a deal is claimed → sends QR deal voucher email
// ══════════════════════════════════════════════════════════════════════════════
exports.onDealCreate = onDocumentCreated(
  {
    document: 'deals/{id}',
    region:   'asia-southeast1',
  },
  async (event) => {
    const dl = event.data.data();
    const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!dl.guestEmail || !emailRe.test(dl.guestEmail)) return;
    if (dl.emailSent) return;

    const transporter = makeTransporter(EMAIL_USER.value(), EMAIL_PASS.value());
    const fromLabel   = EMAIL_FROM.value() || `Tonight Vietnam <${EMAIL_USER.value()}>`;
    const code        = dl.code || '';
    const qrData      = dl.qrData || ('TONIGHT-DEAL:' + code);
    const firstName   = (dl.guestName || 'Guest').split(' ')[0];
    const window_     = (dl.startTime && dl.endTime) ? `${dl.startTime}–${dl.endTime}` : 'tonight';

    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(qrData)}&bgcolor=FFFFFF&color=000000&margin=10&format=png`;

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
  <tr><td style="padding:0 32px 28px;text-align:center">
    <div style="background:#fff;border-radius:16px;padding:24px;display:inline-block;box-shadow:0 4px 24px rgba(0,0,0,.4)">
      <img src="${qrUrl}" width="220" height="220" alt="Your QR Code" style="display:block"/>
      <div style="margin-top:12px;font-size:11px;font-weight:700;letter-spacing:2px;color:#111;font-family:monospace">${escHtml(code)}</div>
    </div>
    <div style="font-size:12px;color:rgba(255,255,255,0.4);margin-top:14px;letter-spacing:.3px">Screenshot this voucher · Show QR at the venue</div>
  </td></tr>
  <tr><td style="background:rgba(255,255,255,0.03);border-top:1px solid rgba(255,255,255,0.06);padding:18px 32px;text-align:center">
    <div style="font-size:11px;color:rgba(255,255,255,0.25)">Deal subject to venue availability<br/>
    <a href="https://tonightvietnam.com" style="color:rgba(255,255,255,0.35)">tonightvietnam.com</a></div>
  </td></tr>
</table>
</td></tr></table>
</body></html>`;

    try {
      await transporter.sendMail({
        from:    fromLabel,
        to:      dl.guestEmail,
        subject: `🎫 Your Tonight Deal — ${dl.dealTitle || 'Deal Confirmed'} at ${dl.venueName || ''}`,
        html,
      });
      await event.data.ref.update({ emailSent: true, emailSentAt: Timestamp.now() });
      console.log(`[onDealCreate] Deal voucher sent to ${dl.guestEmail} code=${code}`);
    } catch (err) {
      console.error(`[onDealCreate] Email failed for ${dl.guestEmail}:`, err.message);
    }
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
    region:   'asia-southeast1',
  },
  async (event) => {
    const before = event.data.before.data();
    const after  = event.data.after.data();

    // Only run when status flips to 'approved'
    if (before.status === 'approved' || after.status !== 'approved') return;
    if (after.authCreated) return;

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
      <a href="https://tonightvietnam.com/portal/" style="color:#f5c842">tonightvietnam.com/portal/</a>
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

      // Write/merge users/{uid} so the venue portal role-check works
      await db.collection('users').doc(uid).set({
        uid,
        email,
        fullName: after.fullName || after.contactName || after.venueName || '',
        role: 'venue_owner',
        venueId: reqId,
        createdAt: Timestamp.now(),
      }, { merge: true });

      console.log(`[onVenueApproved] Auth account created and email sent to ${email} uid=${uid}`);

    } catch (err) {
      console.error('[onVenueApproved] Error:', err.message);
    }
  }
);

// ══════════════════════════════════════════════════════════════════════════════
// FUNCTION 6: notifyAdminNewMember
// Fires when a new community_signups doc is created → emails admin instantly.
// ══════════════════════════════════════════════════════════════════════════════
exports.notifyAdminNewMember = onDocumentCreated(
  {
    document: 'community_signups/{id}',
    region:   'asia-southeast1',
  },
  async (event) => {
    const signup = event.data.data();
    if (!signup.email) return;

    const transporter = makeTransporter(EMAIL_USER.value(), EMAIL_PASS.value());
    const fromLabel   = EMAIL_FROM.value() || `Tonight Vietnam <${EMAIL_USER.value()}>`;
    const name        = signup.fullName || signup.name || 'Unknown';
    const city        = signup.city || '—';
    const joinedAt    = new Date().toLocaleString('en-GB', { timeZone: 'Asia/Ho_Chi_Minh' });

    try {
      await transporter.sendMail({
        from:    fromLabel,
        to:      ADMIN_EMAIL,
        subject: `🎉 New member joined — ${name}`,
        html: `<!DOCTYPE html>
<html><head><meta charset="UTF-8"/></head>
<body style="margin:0;padding:0;background:#080810;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#080810;padding:32px 16px">
<tr><td align="center">
<table width="520" cellpadding="0" cellspacing="0" style="max-width:520px;background:#13131f;border:1px solid rgba(34,197,94,0.3);border-radius:20px;overflow:hidden">
  <tr><td style="background:linear-gradient(135deg,rgba(34,197,94,0.15),rgba(34,197,94,0.05));padding:28px 32px;text-align:center;border-bottom:1px solid rgba(255,255,255,0.07)">
    <div style="font-size:36px;margin-bottom:8px">🎉</div>
    <div style="color:#22c55e;font-size:18px;font-weight:800;letter-spacing:1px">New Member Joined</div>
    <div style="color:rgba(255,255,255,0.4);font-size:12px;margin-top:4px">Tonight Vietnam</div>
  </td></tr>
  <tr><td style="padding:28px 32px">
    <table width="100%" cellpadding="0" cellspacing="0">
      <tr><td style="padding:10px 0;border-bottom:1px solid rgba(255,255,255,0.07)">
        <span style="color:#475569;font-size:12px;text-transform:uppercase;letter-spacing:1px">Name</span><br/>
        <span style="color:#f1f5f9;font-size:15px;font-weight:600">${escHtml(name)}</span>
      </td></tr>
      <tr><td style="padding:10px 0;border-bottom:1px solid rgba(255,255,255,0.07)">
        <span style="color:#475569;font-size:12px;text-transform:uppercase;letter-spacing:1px">Email</span><br/>
        <span style="color:#f1f5f9;font-size:15px;font-weight:600">${escHtml(signup.email)}</span>
      </td></tr>
      <tr><td style="padding:10px 0;border-bottom:1px solid rgba(255,255,255,0.07)">
        <span style="color:#475569;font-size:12px;text-transform:uppercase;letter-spacing:1px">City</span><br/>
        <span style="color:#f1f5f9;font-size:15px;font-weight:600">${escHtml(city)}</span>
      </td></tr>
      <tr><td style="padding:10px 0">
        <span style="color:#475569;font-size:12px;text-transform:uppercase;letter-spacing:1px">Joined at</span><br/>
        <span style="color:#f1f5f9;font-size:15px;font-weight:600">${escHtml(joinedAt)} (VN time)</span>
      </td></tr>
    </table>
    <div style="text-align:center;margin-top:28px">
      <a href="https://tonightvietnam.com/portal/" style="display:inline-block;background:#f5c842;color:#000;font-size:14px;font-weight:700;padding:14px 32px;border-radius:12px;text-decoration:none">
        View in Admin Portal →
      </a>
    </div>
  </td></tr>
</table>
</td></tr></table>
</body></html>`,
      });
      console.log(`[notifyAdminNewMember] Admin notified of new member: ${signup.email}`);
    } catch (err) {
      console.error(`[notifyAdminNewMember] Error: ${err.message}`);
    }
  }
);

// ══════════════════════════════════════════════════════════════════════════════
// FUNCTION 7: notifyAdminVenueApplied
// Fires when a new venue_requests doc is created → emails admin instantly.
// ══════════════════════════════════════════════════════════════════════════════
exports.notifyAdminVenueApplied = onDocumentCreated(
  {
    document: 'venue_requests/{reqId}',
    region:   'asia-southeast1',
  },
  async (event) => {
    const req = event.data.data();
    if (!req.venueName) return;

    const transporter = makeTransporter(EMAIL_USER.value(), EMAIL_PASS.value());
    const fromLabel   = EMAIL_FROM.value() || `Tonight Vietnam <${EMAIL_USER.value()}>`;
    const appliedAt   = new Date().toLocaleString('en-GB', { timeZone: 'Asia/Ho_Chi_Minh' });
    const portalUrl   = 'https://tonightvietnam.com/portal/';

    try {
      await transporter.sendMail({
        from:    fromLabel,
        to:      ADMIN_EMAIL,
        subject: `🏢 New venue application — ${req.venueName}`,
        html: `<!DOCTYPE html>
<html><head><meta charset="UTF-8"/></head>
<body style="margin:0;padding:0;background:#080810;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#080810;padding:32px 16px">
<tr><td align="center">
<table width="520" cellpadding="0" cellspacing="0" style="max-width:520px;background:#13131f;border:1px solid rgba(245,200,66,0.3);border-radius:20px;overflow:hidden">
  <tr><td style="background:linear-gradient(135deg,rgba(245,200,66,0.15),rgba(245,200,66,0.05));padding:28px 32px;text-align:center;border-bottom:1px solid rgba(255,255,255,0.07)">
    <div style="font-size:36px;margin-bottom:8px">🏢</div>
    <div style="color:#f5c842;font-size:18px;font-weight:800;letter-spacing:1px">New Venue Application</div>
    <div style="color:rgba(255,255,255,0.4);font-size:12px;margin-top:4px">Awaiting your review</div>
  </td></tr>
  <tr><td style="padding:28px 32px">
    <table width="100%" cellpadding="0" cellspacing="0">
      <tr><td style="padding:10px 0;border-bottom:1px solid rgba(255,255,255,0.07)">
        <span style="color:#475569;font-size:12px;text-transform:uppercase;letter-spacing:1px">Venue Name</span><br/>
        <span style="color:#f1f5f9;font-size:15px;font-weight:600">${escHtml(req.venueName)}</span>
      </td></tr>
      <tr><td style="padding:10px 0;border-bottom:1px solid rgba(255,255,255,0.07)">
        <span style="color:#475569;font-size:12px;text-transform:uppercase;letter-spacing:1px">Contact Email</span><br/>
        <span style="color:#f1f5f9;font-size:15px;font-weight:600">${escHtml(req.email || '—')}</span>
      </td></tr>
      ${req.phone ? `<tr><td style="padding:10px 0;border-bottom:1px solid rgba(255,255,255,0.07)">
        <span style="color:#475569;font-size:12px;text-transform:uppercase;letter-spacing:1px">Phone</span><br/>
        <span style="color:#f1f5f9;font-size:15px;font-weight:600">${escHtml(req.phone)}</span>
      </td></tr>` : ''}
      ${req.city ? `<tr><td style="padding:10px 0;border-bottom:1px solid rgba(255,255,255,0.07)">
        <span style="color:#475569;font-size:12px;text-transform:uppercase;letter-spacing:1px">City</span><br/>
        <span style="color:#f1f5f9;font-size:15px;font-weight:600">${escHtml(req.city)}</span>
      </td></tr>` : ''}
      ${req.description ? `<tr><td style="padding:10px 0;border-bottom:1px solid rgba(255,255,255,0.07)">
        <span style="color:#475569;font-size:12px;text-transform:uppercase;letter-spacing:1px">Description</span><br/>
        <span style="color:#f1f5f9;font-size:14px;line-height:1.6">${escHtml(req.description)}</span>
      </td></tr>` : ''}
      <tr><td style="padding:10px 0">
        <span style="color:#475569;font-size:12px;text-transform:uppercase;letter-spacing:1px">Applied at</span><br/>
        <span style="color:#f1f5f9;font-size:15px;font-weight:600">${escHtml(appliedAt)} (VN time)</span>
      </td></tr>
    </table>
    <div style="text-align:center;margin-top:28px">
      <a href="${portalUrl}" style="display:inline-block;background:#f5c842;color:#000;font-size:14px;font-weight:700;padding:14px 32px;border-radius:12px;text-decoration:none">
        Review in Admin Portal →
      </a>
    </div>
  </td></tr>
</table>
</td></tr></table>
</body></html>`,
      });
      console.log(`[notifyAdminVenueApplied] Admin notified of venue application: ${req.venueName}`);
    } catch (err) {
      console.error(`[notifyAdminVenueApplied] Error: ${err.message}`);
    }
  }
);

// ══════════════════════════════════════════════════════════════════════════════
// FUNCTION 8: onCommunitySignup
// Fires when someone joins the community — sends a branded welcome email.
// ══════════════════════════════════════════════════════════════════════════════
exports.onCommunitySignup = onDocumentCreated(
  {
    document: 'community_signups/{id}',
    region:   'asia-southeast1',
  },
  async (event) => {
    const signup = event.data.data();
    if (!signup.email) return;
    if (signup.welcomeSent) return;

    const transporter = makeTransporter(EMAIL_USER.value(), EMAIL_PASS.value());
    const fromLabel   = EMAIL_FROM.value() || `Tonight Vietnam <${EMAIL_USER.value()}>`;
    const firstName   = (signup.fullName || signup.name || signup.email.split('@')[0]).split(' ')[0];

    try {
      await transporter.sendMail({
        from:    fromLabel,
        to:      signup.email,
        subject: `🌙 Welcome to Tonight Vietnam, ${firstName}!`,
        html:    buildWelcomeEmail(signup, firstName),
      });
      await event.data.ref.update({ welcomeSent: true, welcomeSentAt: Timestamp.now() });
      console.log(`[onCommunitySignup] Welcome email sent to ${signup.email}`);
    } catch (err) {
      console.error(`[onCommunitySignup] Error: ${err.message}`);
    }
  }
);

function buildWelcomeEmail(signup, firstName) {
  const city = signup.city || 'Vietnam';
  return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;padding:0;background:#080810;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#080810;padding:32px 16px">
<tr><td align="center">
<table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%">

  <tr><td style="text-align:center;padding-bottom:24px">
    <div style="display:inline-block;background:rgba(245,200,66,0.1);border:1px solid rgba(245,200,66,0.3);border-radius:12px;padding:8px 18px">
      <span style="color:#f5c842;font-size:16px;font-weight:800;letter-spacing:2px">🌙 TONIGHT VIETNAM</span>
    </div>
  </td></tr>

  <tr><td style="background:linear-gradient(135deg,#13131f 0%,#0e0e1a 100%);border:1px solid rgba(245,200,66,0.2);border-radius:20px;overflow:hidden">

    <div style="background:linear-gradient(135deg,rgba(245,200,66,0.15) 0%,rgba(245,200,66,0.05) 100%);padding:40px 32px;text-align:center;border-bottom:1px solid rgba(255,255,255,0.07)">
      <div style="font-size:56px;margin-bottom:12px">🎉</div>
      <h1 style="color:#ffffff;font-size:26px;font-weight:800;margin:0 0 8px">You're in, ${escHtml(firstName)}!</h1>
      <p style="color:#f5c842;font-size:15px;font-weight:600;margin:0">Welcome to Tonight Vietnam</p>
    </div>

    <div style="padding:32px">
      <p style="color:#f1f5f9;font-size:15px;line-height:1.8;margin:0 0 24px">
        You now get first access to the best events, deals and guestlist offers in ${escHtml(city)} — straight to your inbox before anyone else.
      </p>

      <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px">
        <tr><td style="padding:14px 16px;background:rgba(245,200,66,0.06);border:1px solid rgba(245,200,66,0.15);border-radius:10px;margin-bottom:10px">
          <div style="color:#f5c842;font-size:13px;font-weight:700;margin-bottom:4px">🎟️ Exclusive Guestlists</div>
          <div style="color:#94a3b8;font-size:13px">Skip the queue with free guestlist spots at top Hanoi venues</div>
        </td></tr>
        <tr><td style="height:10px"></td></tr>
        <tr><td style="padding:14px 16px;background:rgba(34,197,94,0.06);border:1px solid rgba(34,197,94,0.15);border-radius:10px;margin-bottom:10px">
          <div style="color:#22c55e;font-size:13px;font-weight:700;margin-bottom:4px">💸 Member Deals</div>
          <div style="color:#94a3b8;font-size:13px">2-for-1 drinks, discounted entry and flash offers sent only to members</div>
        </td></tr>
        <tr><td style="height:10px"></td></tr>
        <tr><td style="padding:14px 16px;background:rgba(139,92,246,0.06);border:1px solid rgba(139,92,246,0.15);border-radius:10px">
          <div style="color:#a78bfa;font-size:13px;font-weight:700;margin-bottom:4px">🔔 First to Know</div>
          <div style="color:#94a3b8;font-size:13px">New events drop every week — you'll hear about them before the crowd</div>
        </td></tr>
      </table>

      <div style="text-align:center">
        <a href="https://tonightvietnam.com" style="display:inline-block;background:#f5c842;color:#000;font-size:15px;font-weight:700;padding:16px 40px;border-radius:12px;text-decoration:none;letter-spacing:0.3px">
          Explore Tonight Now →
        </a>
      </div>
    </div>

  </td></tr>

  <tr><td style="text-align:center;padding:24px 0">
    <p style="color:#475569;font-size:12px;margin:0 0 8px">Tonight Vietnam · The best nightlife in Vietnam, curated for you.</p>
    <p style="color:#475569;font-size:11px;margin:0">
      <a href="https://tonightvietnam.com/unsubscribe?email=${encodeURIComponent(signup.email)}" style="color:#475569">Unsubscribe</a>
    </p>
  </td></tr>

</table>
</td></tr>
</table>
</body>
</html>`;
}

// ── Rate limiter: max N requests per key per window, backed by Firestore so it
// survives cold starts and is shared across concurrent instances (an in-memory
// Map is per-instance and resets on every cold start — not a real limit). ─────
async function isRateLimited(key, max = 10, windowMs = 15 * 60 * 1000) {
  const ref = db.collection('_rateLimits').doc(key);
  const now = Date.now();
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const data = snap.exists ? snap.data() : null;
    if (!data || now - data.windowStart > windowMs) {
      tx.set(ref, { count: 1, windowStart: now });
      return false;
    }
    const count = data.count + 1;
    tx.set(ref, { count, windowStart: data.windowStart });
    return count > max;
  });
}

// Constant-time string comparison so PIN checking doesn't leak timing info.
function timingSafeEqualStr(a, b) {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

// ══════════════════════════════════════════════════════════════════════════════
// HTTP: promoterVerify
// POST { eventId, pin } → validates PIN, returns event + full guestlist
// ══════════════════════════════════════════════════════════════════════════════
exports.promoterVerify = onRequest(
  { cors: ALLOWED_ORIGINS, region: 'asia-southeast1' },
  async (req, res) => {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    const ip = req.ip || req.headers['x-forwarded-for'] || 'unknown';
    if (await isRateLimited(`verify:${ip}`)) return res.status(429).json({ error: 'Too many attempts — try again later' });
    const { eventId, pin } = req.body || {};
    if (!eventId || !pin) return res.status(400).json({ error: 'Missing eventId or pin' });

    const eventDoc = await db.collection('events').doc(eventId).get();
    if (!eventDoc.exists) return res.status(404).json({ error: 'Event not found' });
    const ev = eventDoc.data();

    // No guessable fallback: if a real PIN hasn't been assigned yet
    // (generatePromoterPin runs async right after event creation), refuse
    // rather than falling back to something derivable from the public event ID.
    if (!ev.promoterPin) {
      return res.status(403).json({ error: 'PIN not ready yet for this event — try again in a moment' });
    }
    if (!timingSafeEqualStr(String(pin).toUpperCase(), String(ev.promoterPin).toUpperCase())) {
      return res.status(403).json({ error: 'Wrong PIN' });
    }

    const snap = await db.collection('guestlist')
      .where('eventTitle', '==', ev.title)
      .orderBy('createdAt', 'desc')
      .limit(500)
      .get();

    const guests = snap.docs.map(d => {
      const g = d.data();
      return {
        id: d.id, ref: g.ref || '', name: g.buyerName || '—',
        email: g.buyerEmail || '', ticketType: g.ticketType || 'Guestlist',
        qty: g.qty || 1, checkedIn: g.checkedIn || false,
        checkedInAt: g.checkedInAt ? g.checkedInAt.toDate().toISOString() : null,
      };
    });

    res.json({
      event: { id: eventId, title: ev.title||'', venue: ev.venueName||'', date: ev.date||'', time: ev.time||'', city: ev.city||'' },
      guests,
    });
  }
);

// ══════════════════════════════════════════════════════════════════════════════
// HTTP: promoterScan
// POST { ref, eventId, pin } → validates PIN + ref, marks checkedIn
// ══════════════════════════════════════════════════════════════════════════════
exports.promoterScan = onRequest(
  { cors: ALLOWED_ORIGINS, region: 'asia-southeast1' },
  async (req, res) => {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    const ip = req.ip || req.headers['x-forwarded-for'] || 'unknown';
    if (await isRateLimited(`scan:${ip}`)) return res.status(429).json({ error: 'Too many attempts — try again later' });
    const { ref, eventId, pin } = req.body || {};
    if (!ref || !eventId || !pin) return res.status(400).json({ error: 'Missing fields' });

    const eventDoc = await db.collection('events').doc(eventId).get();
    if (!eventDoc.exists) return res.status(404).json({ error: 'Event not found' });
    const ev = eventDoc.data();
    if (!ev.promoterPin) {
      return res.status(403).json({ error: 'PIN not ready yet for this event — try again in a moment' });
    }
    if (!timingSafeEqualStr(String(pin).toUpperCase(), String(ev.promoterPin).toUpperCase())) {
      return res.status(403).json({ error: 'Wrong PIN' });
    }

    // Read-check-write inside a transaction so two near-simultaneous scans of
    // the same ticket can't both observe checkedIn:false and both succeed.
    try {
      const result = await db.runTransaction(async (tx) => {
        const snap = await tx.get(db.collection('guestlist').where('ref', '==', ref).limit(1));
        if (snap.empty) {
          const err = new Error('Ticket not found');
          err.code = 'not_found';
          throw err;
        }
        const doc = snap.docs[0];
        const guest = doc.data();
        if (guest.checkedIn) {
          return { alreadyIn: true, guest };
        }
        tx.update(doc.ref, { checkedIn: true, checkedInAt: Timestamp.now(), checkedInBy: `promoter:${eventId}` });
        return { alreadyIn: false, guest };
      });

      const { alreadyIn, guest } = result;
      if (alreadyIn) {
        return res.json({
          status: 'already_in', name: guest.buyerName||'—',
          ticketType: guest.ticketType||'Guestlist', qty: guest.qty||1,
          checkedInAt: guest.checkedInAt ? guest.checkedInAt.toDate().toISOString() : null,
        });
      }

      res.json({
        status: 'success', name: guest.buyerName||'—',
        email: guest.buyerEmail||'', ticketType: guest.ticketType||'Guestlist',
        qty: guest.qty||1, eventTitle: guest.eventTitle||'',
      });
    } catch (err) {
      if (err.code === 'not_found') return res.status(404).json({ error: 'Ticket not found', ref });
      console.error('[promoterScan] transaction failed:', err);
      return res.status(500).json({ error: 'Check-in failed — try again' });
    }
  }
);

// ══════════════════════════════════════════════════════════════════════════════
// FUNCTION 15: generatePromoterPin
// Fires when a new event is created. If no promoterPin is set, generates a
// cryptographic 6-character hex PIN so the fallback (eventId.slice(-4)) is
// never used in production.
// ══════════════════════════════════════════════════════════════════════════════
exports.generatePromoterPin = onDocumentCreated(
  { document: 'events/{eventId}', region: 'asia-southeast1' },
  async (event) => {
    if (event.data.data().promoterPin) return;
    const pin = crypto.randomBytes(3).toString('hex').toUpperCase();
    await event.data.ref.update({ promoterPin: pin });
    console.log(`[generatePromoterPin] Assigned PIN ${pin} to event ${event.params.eventId}`);
  }
);

// ══════════════════════════════════════════════════════════════════════════════
// HTTP: unsubscribeUser
// GET/POST /api/unsubscribe?email=...
// Marks the community_signups doc as unsubscribed (GDPR/CAN-SPAM compliant).
// Supports both GET (one-click from email link) and POST (form submit).
// ══════════════════════════════════════════════════════════════════════════════
exports.unsubscribeUser = onRequest(
  { cors: ALLOWED_ORIGINS, region: 'asia-southeast1' },
  async (req, res) => {
    if (req.method !== 'GET' && req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    const email = (req.query.email || req.body?.email || '').trim().toLowerCase();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'Valid email required' });
    }

    try {
      const snap = await db.collection('community_signups')
        .where('email', '==', email)
        .limit(10)
        .get();

      if (snap.empty) {
        // Not found — still return 200 to avoid email enumeration
        console.log(`[unsubscribeUser] No signup found for ${email}`);
        return res.status(200).json({ ok: true });
      }

      const batch = db.batch();
      snap.docs.forEach(d => {
        batch.update(d.ref, { unsubscribed: true, unsubscribedAt: Timestamp.now() });
      });
      await batch.commit();

      console.log(`[unsubscribeUser] Unsubscribed ${email} (${snap.size} doc(s))`);
      return res.status(200).json({ ok: true });
    } catch (err) {
      console.error(`[unsubscribeUser] Error: ${err.message}`);
      return res.status(500).json({ error: 'Internal error' });
    }
  }
);

// ══════════════════════════════════════════════════════════════════════════════
// cleanOldGuestlist
// Runs daily at 4:00 AM Vietnam time (21:00 UTC previous day).
// Deletes guestlist entries whose event date has passed (yesterday or earlier).
// Processes in batches of 500 to stay within Firestore limits.
// ══════════════════════════════════════════════════════════════════════════════
exports.cleanOldGuestlist = onSchedule(
  {
    schedule: '0 21 * * *',   // 21:00 UTC = 04:00 AM Vietnam (UTC+7)
    timeZone: 'UTC',
    region:   'asia-southeast1',
  },
  async () => {
    // Yesterday in Vietnam time as YYYY-MM-DD
    const now = new Date();
    now.setHours(now.getHours() + 7); // shift to UTC+7
    now.setDate(now.getDate() - 1);
    const yesterday = now.toISOString().split('T')[0];

    console.log(`[cleanOldGuestlist] Deleting guestlist entries with date <= ${yesterday}`);

    try {
      const snap = await db.collection('guestlist')
        .where('date', '<=', yesterday)
        .limit(500)
        .get();

      if (snap.empty) {
        console.log('[cleanOldGuestlist] Nothing to delete.');
        return;
      }

      let deleted = 0;
      // Firestore batch max 500 writes
      const chunks = [];
      for (let i = 0; i < snap.docs.length; i += 500) {
        chunks.push(snap.docs.slice(i, i + 500));
      }
      for (const chunk of chunks) {
        const batch = db.batch();
        chunk.forEach(d => batch.delete(d.ref));
        await batch.commit();
        deleted += chunk.length;
      }

      console.log(`[cleanOldGuestlist] Deleted ${deleted} old guestlist entries.`);
    } catch (err) {
      console.error('[cleanOldGuestlist] Error:', err.message);
    }
  }
);
