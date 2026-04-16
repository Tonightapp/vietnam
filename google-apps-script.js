// ============================================================
// Tonight App — Master Webhook (Rhino + V8 compatible)
// No template literals — works on legacy Apps Script runtime
// ============================================================

var SHEET_ID    = '1EV66PfDw6W0GKXFA3vuR0F-PkvIzM5tDBIY5cJp4b7U';
var ADMIN_EMAIL = 'lamyasser.anass@gmail.com';
var APP_NAME    = 'Tonight Vietnam';
var APP_URL     = 'https://www.tonightvietnam.com';

// ── Router ───────────────────────────────────────────────────
function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    switch (data.source) {
      case 'guestlist-join':
        try { saveGuestlistJoin(data); } catch(e) {}
        try { sendGuestlistConfirmation(data); } catch(e) {}
        try { sendGuestlistAlert(data); } catch(e) {}
        break;
      case 'pro-event-submission':
        saveProEvent(data);
        sendProAlert(data);
        break;
      case 'approve-event':
        approveEventRow(data);
        sendEventBlast(data);
        break;
      case 'pro-signup':
        saveProSignup(data);
        sendProSignupAlert(data);
        break;
      case 'deal-claim':
        try { saveDealClaim(data); } catch(e) {}
        try { if (data.guestEmail) sendDealConfirmation(data); } catch(e) {}
        break;
      default:
        saveToSheet(data);
        sendAlert(data);
    }
    return jsonOk({ status: 'ok' });
  } catch (err) {
    return jsonOk({ status: 'error', message: err.message });
  }
}

function doGet(e) {
  var params = (e && e.parameter) ? e.parameter : {};
  if (params.action === 'events') {
    return getApprovedEventsJSON();
  }
  return jsonOk({ status: 'ok', service: 'Tonight Webhook', time: new Date().toISOString() });
}

// ── Email layout helpers ─────────────────────────────────────
function emailHeader() {
  return '<!DOCTYPE html><html><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>' +
    '<body style="margin:0;padding:0;background:#0a0b14;font-family:Helvetica Neue,Helvetica,Arial,sans-serif;">' +
    '<table width="100%" cellpadding="0" cellspacing="0" style="background:#0a0b14;padding:32px 0"><tr><td align="center">' +
    '<table width="520" cellpadding="0" cellspacing="0" style="background:#0f1020;border-radius:16px;overflow:hidden;border:1px solid rgba(255,255,255,0.08);max-width:520px;width:100%">' +
    '<tr><td style="background:linear-gradient(135deg,#0a1828,#0d2040);padding:28px 32px;text-align:center;border-bottom:1px solid rgba(255,255,255,0.07)">' +
    '<div style="font-size:28px;font-weight:900;letter-spacing:4px;color:#f5c842;font-family:Georgia,serif">TONIGHT</div>' +
    '<div style="font-size:11px;letter-spacing:3px;color:rgba(255,255,255,0.4);margin-top:4px;text-transform:uppercase">Vietnam &middot; Southeast Asia</div>' +
    '</td></tr>';
}

function emailFooter(note) {
  return '<tr><td style="background:rgba(255,255,255,0.03);border-top:1px solid rgba(255,255,255,0.06);padding:18px 32px;text-align:center">' +
    '<div style="font-size:11px;color:rgba(255,255,255,0.25);line-height:1.7">' + (note || '') +
    '<br/><a href="' + APP_URL + '" style="color:rgba(255,255,255,0.35)">' + APP_URL + '</a>' +
    '</div></td></tr></table></td></tr></table></body></html>';
}

function stepCircle(n, color) {
  var c = color || '#f5c842';
  var bg = color === '#00d084' ? 'rgba(0,208,132,0.15)' : 'rgba(245,200,66,0.15)';
  var border = color === '#00d084' ? 'rgba(0,208,132,0.3)' : 'rgba(245,200,66,0.3)';
  return '<div style="width:22px;height:22px;border-radius:50%;background:' + bg + ';border:1px solid ' + border + ';text-align:center;line-height:22px;font-size:11px;font-weight:700;color:' + c + '">' + n + '</div>';
}

function qrBox(qrUrl, codeText, caption) {
  return '<tr><td style="padding:0 32px 24px;text-align:center">' +
    '<div style="background:#ffffff;border-radius:12px;padding:20px;display:inline-block;margin:0 auto">' +
    '<img src="' + qrUrl + '" width="220" height="220" alt="QR Code" style="display:block;border-radius:4px"/>' +
    '<div style="margin-top:10px;font-size:10px;font-weight:700;letter-spacing:1.5px;color:#666;font-family:monospace">' + codeText + '</div>' +
    '</div>' +
    '<div style="font-size:12px;color:rgba(255,255,255,0.35);margin-top:12px">' + caption + '</div>' +
    '</td></tr>';
}

// ═══════════════════════════════════════════════════════════════
// GUESTLIST JOINS
// ═══════════════════════════════════════════════════════════════
var GL_TAB = 'Guestlist Joins';
var GL_HEADERS = ['Timestamp','Ref','Status','Guest Name','Email','Phone','Event','Date','Venue','City','Ticket Type','Guests (qty)','Device','Source'];

function saveGuestlistJoin(data) {
  var ss  = SpreadsheetApp.openById(SHEET_ID);
  var tab = ss.getSheetByName(GL_TAB);
  if (!tab) {
    tab = ss.insertSheet(GL_TAB);
    tab.appendRow(GL_HEADERS);
    tab.getRange(1,1,1,GL_HEADERS.length).setFontWeight('bold').setBackground('#0a1828').setFontColor('#00d084');
    tab.setFrozenRows(1);
    tab.setColumnWidth(1,160); tab.setColumnWidth(4,160); tab.setColumnWidth(5,200); tab.setColumnWidth(7,200);
  }
  tab.appendRow([
    new Date(), data.ref||'', 'Valid',
    data.buyerName||'', data.buyerEmail||'', data.buyerPhone||'',
    data.eventTitle||'', data.date||'', data.venue||'', data.city||'',
    data.ticketType||'Guestlist', data.qty||1, data.deviceType||'', data.source||'guestlist-join'
  ]);
}

function sendGuestlistConfirmation(data) {
  if (!data.buyerEmail) return;
  var ref       = data.ref        || 'TN-XXXX-XXXX-XXXX';
  var name      = data.buyerName  || 'Guest';
  var firstName = name.split(' ')[0];
  var event     = data.eventTitle || 'Your Event';
  var date      = data.date       || '';
  var venue     = data.venue      || '';
  var city      = data.city       || '';
  var qty       = data.qty        || 1;
  var type      = data.ticketType || 'Guestlist';
  var qrUrl     = 'https://api.qrserver.com/v1/create-qr-code/?size=220x220&color=000000&bgcolor=ffffff&data=' + encodeURIComponent('TONIGHT:' + ref);
  var subject   = '\uD83C\uDFAB Your Tonight Ticket \u2014 ' + event;

  var dateRow  = date  ? '<tr><td style="font-size:12px;color:rgba(255,255,255,0.45);padding-right:8px;padding-bottom:5px">\uD83D\uDCC5</td><td style="font-size:13px;color:rgba(255,255,255,0.8);padding-bottom:5px">' + date + '</td></tr>' : '';
  var venueRow = venue ? '<tr><td style="font-size:12px;color:rgba(255,255,255,0.45);padding-right:8px;padding-bottom:5px">\uD83D\uDCCD</td><td style="font-size:13px;color:rgba(255,255,255,0.8);padding-bottom:5px">' + venue + (city ? ', ' + city : '') + '</td></tr>' : '';
  var qtyLabel = qty == 1 ? 'person' : 'people';

  var html = emailHeader() +
    '<tr><td style="padding:28px 32px 0">' +
      '<div style="font-size:20px;font-weight:700;color:#fff;margin-bottom:6px">You\'re on the list, ' + firstName + '! \uD83C\uDF89</div>' +
      '<div style="font-size:14px;color:rgba(255,255,255,0.55);line-height:1.6">Your guestlist spot is confirmed. Show the QR code at the door \u2014 staff will scan it to check you in instantly.</div>' +
    '</td></tr>' +
    '<tr><td style="padding:20px 32px">' +
      '<table width="100%" cellpadding="0" cellspacing="0" style="background:rgba(0,208,132,0.07);border:1px solid rgba(0,208,132,0.2);border-radius:10px;padding:16px">' +
        '<tr><td style="font-size:16px;font-weight:700;color:#fff;padding-bottom:10px">' + event + '</td></tr>' +
        '<tr><td><table cellpadding="0" cellspacing="0">' +
          dateRow + venueRow +
          '<tr><td style="font-size:12px;color:rgba(255,255,255,0.45);padding-right:8px;padding-bottom:5px">\uD83C\uDFAB</td><td style="font-size:13px;color:rgba(255,255,255,0.8);padding-bottom:5px">' + type + ' &times; ' + qty + ' ' + qtyLabel + '</td></tr>' +
        '</table></td></tr>' +
      '</table>' +
    '</td></tr>' +
    qrBox(qrUrl, ref, 'Show this QR at venue entry &middot; Staff will scan to check you in') +
    '<tr><td style="padding:0 32px 28px">' +
      '<div style="font-size:10px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:rgba(255,255,255,0.3);margin-bottom:12px">How it works</div>' +
      '<table width="100%" cellpadding="0" cellspacing="0">' +
        '<tr><td width="28" valign="top" style="padding-bottom:10px">' + stepCircle(1) + '</td><td style="font-size:13px;color:rgba(255,255,255,0.65);padding-left:10px;padding-bottom:10px">Save this email or screenshot your QR code</td></tr>' +
        '<tr><td width="28" valign="top" style="padding-bottom:10px">' + stepCircle(2) + '</td><td style="font-size:13px;color:rgba(255,255,255,0.65);padding-left:10px;padding-bottom:10px">Arrive at the venue and head to the entrance</td></tr>' +
        '<tr><td width="28" valign="top">' + stepCircle(3,'#00d084') + '</td><td style="font-size:13px;color:rgba(255,255,255,0.65);padding-left:10px">Show your QR \u2014 staff scans and you\'re in \u2713</td></tr>' +
      '</table>' +
    '</td></tr>' +
    emailFooter('This is a free guestlist request \u2014 entry is subject to venue confirmation.<br/>Tonight does not charge for guestlist spots.');

  MailApp.sendEmail({ to: data.buyerEmail, subject: subject, htmlBody: html, name: APP_NAME });
}

function sendGuestlistAlert(data) {
  var subject = 'New Guestlist Join: ' + (data.buyerName||'?') + ' - ' + (data.eventTitle||'?');
  var body = 'New guestlist registration on Tonight Vietnam.\n\n' +
    'GUEST\n  Name  : ' + (data.buyerName||'-') + '\n  Email : ' + (data.buyerEmail||'-') + '\n  Phone : ' + (data.buyerPhone||'-') + '\n\n' +
    'EVENT\n  Title : ' + (data.eventTitle||'-') + '\n  Date  : ' + (data.date||'-') + '\n  Venue : ' + (data.venue||'-') + '\n  City  : ' + (data.city||'-') + '\n\n' +
    'TICKET\n  Type  : ' + (data.ticketType||'Guestlist') + '\n  Guests: ' + (data.qty||1) + '\n  Ref   : ' + (data.ref||'-') + '\n\n' +
    'Device: ' + (data.deviceType||'-') + '\nTime  : ' + new Date().toLocaleString();
  MailApp.sendEmail(ADMIN_EMAIL, subject, body);
}

// ═══════════════════════════════════════════════════════════════
// DEAL CLAIMS
// ═══════════════════════════════════════════════════════════════
var DEAL_TAB     = 'Deal Claims';
var DEAL_HEADERS = ['Timestamp','Code','Deal Title','Venue','City','Discount','Guest Name','Guest Email','Guest Phone','Device'];

function saveDealClaim(data) {
  var ss  = SpreadsheetApp.openById(SHEET_ID);
  var tab = ss.getSheetByName(DEAL_TAB);
  if (!tab) {
    tab = ss.insertSheet(DEAL_TAB);
    tab.appendRow(DEAL_HEADERS);
    tab.getRange(1,1,1,DEAL_HEADERS.length).setFontWeight('bold').setBackground('#1a0828').setFontColor('#c084fc');
    tab.setFrozenRows(1);
  }
  tab.appendRow([new Date(), data.code||'', data.dealTitle||'', data.venueName||'', data.city||'', data.discount||'', data.guestName||'', data.guestEmail||'', data.guestPhone||'', data.deviceType||'']);
}

function sendDealConfirmation(data) {
  var name      = data.guestName || 'Guest';
  var firstName = name.split(' ')[0];
  var email     = data.guestEmail;
  var venue     = data.venueName || '';
  var city      = data.city      || '';
  var deal      = data.dealTitle || 'Special Offer';
  var discount  = data.discount  || 'DEAL';
  var window_   = (data.startTime && data.endTime) ? data.startTime + '-' + data.endTime : 'tonight';
  var code      = data.code   || '';
  var qrData    = data.qrData || ('TONIGHT-DEAL:' + code);
  var desc      = data.desc   || '';
  var qrUrl     = 'https://api.qrserver.com/v1/create-qr-code/?size=220x220&color=000000&bgcolor=ffffff&data=' + encodeURIComponent(qrData);
  var subject   = '\uD83C\uDFAB Your Tonight Deal \u2014 ' + deal + ' at ' + venue;

  var venueRow = venue ? '<tr><td style="font-size:12px;color:rgba(255,255,255,0.45);padding-right:8px;padding-bottom:5px">\uD83D\uDCCD</td><td style="font-size:13px;color:rgba(255,255,255,0.8);padding-bottom:5px">' + venue + (city?', '+city:'') + '</td></tr>' : '';
  var descRow  = desc  ? '<tr><td colspan="2" style="font-size:12px;color:rgba(255,255,255,0.5);padding-top:4px;line-height:1.5">' + desc + '</td></tr>' : '';
  var arrivalVenue = venue || 'the venue';

  var html = emailHeader() +
    '<tr><td style="padding:28px 32px 0">' +
      '<div style="font-size:20px;font-weight:700;color:#fff;margin-bottom:6px">Your deal is confirmed, ' + firstName + '! \uD83C\uDF89</div>' +
      '<div style="font-size:14px;color:rgba(255,255,255,0.55);line-height:1.6">Show the QR code at the venue \u2014 staff will scan it to unlock your offer instantly.</div>' +
    '</td></tr>' +
    '<tr><td style="padding:20px 32px">' +
      '<table width="100%" cellpadding="0" cellspacing="0" style="background:rgba(245,200,66,0.07);border:1px solid rgba(245,200,66,0.2);border-radius:10px;padding:16px">' +
        '<tr><td style="padding-bottom:10px"><span style="display:inline-block;background:#f5c842;color:#000;font-size:12px;font-weight:900;letter-spacing:1.5px;padding:4px 12px;border-radius:20px">' + discount + '</span></td></tr>' +
        '<tr><td style="font-size:16px;font-weight:700;color:#fff;padding-bottom:10px">' + deal + '</td></tr>' +
        '<tr><td><table cellpadding="0" cellspacing="0">' +
          venueRow +
          '<tr><td style="font-size:12px;color:rgba(255,255,255,0.45);padding-right:8px;padding-bottom:5px">\uD83D\uDD50</td><td style="font-size:13px;color:rgba(255,255,255,0.8);padding-bottom:5px">Valid ' + window_ + '</td></tr>' +
          descRow +
        '</table></td></tr>' +
      '</table>' +
    '</td></tr>' +
    qrBox(qrUrl, code, 'Show this QR at the venue &middot; Staff scans to confirm your deal') +
    '<tr><td style="padding:0 32px 28px">' +
      '<div style="font-size:10px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:rgba(255,255,255,0.3);margin-bottom:12px">How to use</div>' +
      '<table width="100%" cellpadding="0" cellspacing="0">' +
        '<tr><td width="28" valign="top" style="padding-bottom:10px">' + stepCircle(1) + '</td><td style="font-size:13px;color:rgba(255,255,255,0.65);padding-left:10px;padding-bottom:10px">Save this email or screenshot the QR code</td></tr>' +
        '<tr><td width="28" valign="top" style="padding-bottom:10px">' + stepCircle(2) + '</td><td style="font-size:13px;color:rgba(255,255,255,0.65);padding-left:10px;padding-bottom:10px">Arrive at ' + arrivalVenue + ' during the valid window</td></tr>' +
        '<tr><td width="28" valign="top">' + stepCircle(3,'#00d084') + '</td><td style="font-size:13px;color:rgba(255,255,255,0.65);padding-left:10px">Show QR to staff \u2014 they scan and your deal is unlocked \u2713</td></tr>' +
      '</table>' +
    '</td></tr>' +
    emailFooter('This deal is subject to venue availability and confirmation.<br/>Tonight does not charge for deals or offers.');

  MailApp.sendEmail({ to: email, subject: subject, htmlBody: html, name: APP_NAME });
}

// ═══════════════════════════════════════════════════════════════
// COMMUNITY SIGN-UPS
// ═══════════════════════════════════════════════════════════════
var TAB_NAME = 'Tonight Community';
var HEADERS  = ['Timestamp','Full Name','Phone','Email','City','Genre 1','Genre 2','Genre 3','Message','Source','User Agent'];

function saveToSheet(data) {
  var ss  = SpreadsheetApp.openById(SHEET_ID);
  var tab = ss.getSheetByName(TAB_NAME);
  if (!tab) {
    tab = ss.insertSheet(TAB_NAME);
    tab.appendRow(HEADERS);
    tab.getRange(1,1,1,HEADERS.length).setFontWeight('bold').setBackground('#0a0b14').setFontColor('#f5c842');
    tab.setFrozenRows(1);
  }
  var genres = data.genres || [];
  tab.appendRow([new Date(),data.name||'',data.phone||'',data.email||'',data.city||'',genres[0]||'',genres[1]||'',genres[2]||'',data.message||'',data.source||'tonight-app',data.userAgent||'']);
  tab.autoResizeColumns(1, HEADERS.length);
}

function sendAlert(data) {
  var subject = 'New Tonight sign-up: ' + (data.name||'Unknown') + ' - ' + (data.city||'?');
  var genres  = (data.genres||[]).join(', ') || '-';
  MailApp.sendEmail(ADMIN_EMAIL, subject,
    'Name: '+(data.name||'-')+'\nPhone: '+(data.phone||'-')+'\nEmail: '+(data.email||'-')+'\nCity: '+(data.city||'-')+'\nGenres: '+genres+'\nTime: '+new Date().toLocaleString());
}

// ═══════════════════════════════════════════════════════════════
// PRO EVENT SUBMISSIONS
// ═══════════════════════════════════════════════════════════════
var PRO_TAB     = 'Pro Event Submissions';
var PRO_HEADERS = ['Timestamp','Status','Business Name','Venue Type','City','Address','Event Title','Date','Doors Open','Genre','Capacity','Description','Special Offer','Contact Name','Phone','Email','Instagram','Website','Submitted At'];

function saveProEvent(data) {
  var ss  = SpreadsheetApp.openById(SHEET_ID);
  var tab = ss.getSheetByName(PRO_TAB);
  if (!tab) {
    tab = ss.insertSheet(PRO_TAB);
    tab.appendRow(PRO_HEADERS);
    tab.getRange(1,1,1,PRO_HEADERS.length).setFontWeight('bold').setBackground('#0a1828').setFontColor('#00d084');
    tab.setFrozenRows(1);
  }
  tab.appendRow([new Date(),'Pending Review',data.businessName||'',data.venueType||'',data.city||'',data.address||'',data.eventTitle||'',data.date||'',data.doorsOpen||'',data.genre||'',data.capacity||'',data.description||'',data.specialOffer||'',data.contactName||'',data.phone||'',data.email||'',data.instagram||'',data.website||'',data.submittedAt||'']);
  tab.autoResizeColumns(1, PRO_HEADERS.length);
}

function sendProAlert(data) {
  var subject = 'New Event Submission: ' + (data.eventTitle||'?') + ' - ' + (data.city||'?');
  MailApp.sendEmail(ADMIN_EMAIL, subject,
    'BUSINESS: '+(data.businessName||'-')+' ('+data.venueType+')\nEVENT: '+(data.eventTitle||'-')+'\nDATE: '+(data.date||'-')+' at '+(data.doorsOpen||'-')+'\nCITY: '+(data.city||'-')+'\nCONTACT: '+(data.contactName||'-')+' - '+(data.phone||'-')+' - '+(data.email||'-')+'\n\nSubmitted: '+new Date().toLocaleString());
}

// ═══════════════════════════════════════════════════════════════
// PRO ACCOUNT SIGN-UPS
// ═══════════════════════════════════════════════════════════════
var PRO_SIGNUP_TAB     = 'Pro Account Sign-Ups';
var PRO_SIGNUP_HEADERS = ['Timestamp','Name','Business Name','Email','Source','User Agent'];

function saveProSignup(data) {
  var ss  = SpreadsheetApp.openById(SHEET_ID);
  var tab = ss.getSheetByName(PRO_SIGNUP_TAB);
  if (!tab) {
    tab = ss.insertSheet(PRO_SIGNUP_TAB);
    tab.appendRow(PRO_SIGNUP_HEADERS);
    tab.getRange(1,1,1,PRO_SIGNUP_HEADERS.length).setFontWeight('bold').setBackground('#0a1828').setFontColor('#f5c842');
    tab.setFrozenRows(1);
  }
  tab.appendRow([new Date(),data.name||'',data.businessName||'',data.email||'',data.source||'pro-signup',data.userAgent||'']);
}

function sendProSignupAlert(data) {
  MailApp.sendEmail(ADMIN_EMAIL,
    'New Business Sign-Up: ' + (data.name||'?') + ' - ' + (data.businessName||'?'),
    'Name: '+(data.name||'-')+'\nBusiness: '+(data.businessName||'-')+'\nEmail: '+(data.email||'-')+'\nTime: '+new Date().toLocaleString());
}

// ── Test — run this manually from the editor to verify email works ──
function testEmail() {
  try {
    Logger.log('Attempting to send to: ' + ADMIN_EMAIL);
    MailApp.sendEmail(ADMIN_EMAIL, 'Tonight Test Email', 'This is a test from Tonight Vietnam. If you see this, email is working!');
    Logger.log('SUCCESS — email sent to ' + ADMIN_EMAIL);
  } catch(e) {
    Logger.log('FAILED — ' + e.toString());
  }
}

// ═══════════════════════════════════════════════════════════════
// APPROVED EVENTS API  (GET ?action=events)
// Returns approved venue-submitted events as JSON for the app
// ═══════════════════════════════════════════════════════════════
function getApprovedEventsJSON() {
  var events = getApprovedEventsData();
  return ContentService.createTextOutput(JSON.stringify({ status: 'ok', events: events }))
    .setMimeType(ContentService.MimeType.JSON);
}

function getApprovedEventsData() {
  var ss  = SpreadsheetApp.openById(SHEET_ID);
  var tab = ss.getSheetByName(PRO_TAB);
  if (!tab) return [];
  var rows = tab.getDataRange().getValues();
  if (rows.length < 2) return [];
  // PRO_HEADERS: [0]Timestamp [1]Status [2]Business Name [3]Venue Type [4]City [5]Address
  //              [6]Event Title [7]Date [8]Doors Open [9]Genre [10]Capacity [11]Description
  //              [12]Special Offer [13]Contact Name [14]Phone [15]Email [16]Instagram [17]Website [18]Submitted At
  var GENRE_GRADS = {
    'Techno':'grad-purple','House':'grad-teal','EDM':'grad-blue','Trance':'grad-cyan',
    'Hip-Hop':'grad-red','R&B':'grad-rose','Jazz':'grad-gold','Rock':'grad-indigo',
    'Pop':'grad-pink','Other':'grad-orange'
  };
  var events = [];
  var nextId = 1000;
  for (var i = 1; i < rows.length; i++) {
    var row    = rows[i];
    var status = row[1];
    if (status !== 'Approved') continue;
    var genre   = row[9]  || 'House';
    var dateVal = row[7];
    var dateStr = '';
    if (dateVal instanceof Date) dateStr = Utilities.formatDate(dateVal, 'Asia/Ho_Chi_Minh', 'yyyy-MM-dd');
    else dateStr = String(dateVal).substring(0, 10);
    events.push({
      id:        nextId++,
      title:     row[6]  || 'Untitled Event',
      artist:    row[13] || 'Various Artists',
      genre:     genre,
      city:      row[4]  || '',
      area:      '',
      venue:     row[2]  || '',
      lat:       0,
      lng:       0,
      date:      dateStr,
      price:     0,
      img:       '',
      emoji:     '\uD83C\uDFB5',
      grad:      GENRE_GRADS[genre] || 'grad-purple',
      desc:      row[11] || '',
      featured:  false,
      soldOut:   false,
      attendees: parseInt(row[10]) || 0,
      isNew:     true,
      source:    'venue'
    });
  }
  return events;
}

// ═══════════════════════════════════════════════════════════════
// APPROVE EVENT  (POST source:'approve-event')
// Admin approves an event — updates sheet + blasts emails to city
// Call from admin panel or Google Sheets script
// ═══════════════════════════════════════════════════════════════
function approveEventRow(data) {
  var ss  = SpreadsheetApp.openById(SHEET_ID);
  var tab = ss.getSheetByName(PRO_TAB);
  if (!tab) return;
  var rows = tab.getDataRange().getValues();
  // Match by event title + city (or row index if provided)
  for (var i = 1; i < rows.length; i++) {
    var row = rows[i];
    if (row[1] === 'Approved') continue; // already approved
    var titleMatch = data.eventTitle && row[6] === data.eventTitle;
    var cityMatch  = data.city      && row[4] === data.city;
    var rowMatch   = data.rowIndex  && (i + 1) === parseInt(data.rowIndex);
    if (rowMatch || (titleMatch && cityMatch)) {
      tab.getRange(i + 1, 2).setValue('Approved');
      tab.getRange(i + 1, 2).setBackground('#00d084').setFontColor('#000');
      break;
    }
  }
}

// ═══════════════════════════════════════════════════════════════
// EMAIL BLAST — fires when event is approved
// Sends beautiful flyer to all community members in that city
// ═══════════════════════════════════════════════════════════════
function sendEventBlast(data) {
  var ss  = SpreadsheetApp.openById(SHEET_ID);
  var tab = ss.getSheetByName(TAB_NAME); // 'Tonight Community'
  if (!tab) return 0;
  var rows    = tab.getDataRange().getValues();
  var city    = (data.city || '').toLowerCase().trim();
  var sent    = 0;
  var seen    = {};
  for (var i = 1; i < rows.length; i++) {
    var row         = rows[i];
    var memberCity  = (row[4] || '').toLowerCase().trim();
    var email       = (row[3] || '').trim();
    var name        = row[1] || 'Friend';
    if (!email || seen[email]) continue;
    // Send to matching city or all if city not specified
    if (!city || memberCity === city || memberCity === '') {
      try { sendEventFlyer(email, name, data); sent++; seen[email] = true; } catch(ex) {}
    }
  }
  return sent;
}

function sendEventFlyer(toEmail, toName, ev) {
  var firstName = toName.split(' ')[0] || 'Friend';
  var subject   = '\uD83C\uDFB5 New Event Alert \u2014 ' + (ev.eventTitle || 'Tonight') + ' in ' + (ev.city || 'your city');
  var dateRow   = ev.date  ? '<tr><td style="font-size:12px;color:rgba(255,255,255,0.45);padding-right:8px;padding-bottom:5px">\uD83D\uDCC5</td><td style="font-size:13px;color:rgba(255,255,255,0.8);padding-bottom:5px">' + ev.date + '</td></tr>' : '';
  var venueRow  = ev.venue ? '<tr><td style="font-size:12px;color:rgba(255,255,255,0.45);padding-right:8px;padding-bottom:5px">\uD83D\uDCCD</td><td style="font-size:13px;color:rgba(255,255,255,0.8);padding-bottom:5px">' + ev.venue + (ev.city?', '+ev.city:'') + '</td></tr>' : '';
  var genreRow  = ev.genre ? '<tr><td style="font-size:12px;color:rgba(255,255,255,0.45);padding-right:8px;padding-bottom:5px">\uD83C\uDFB6</td><td style="font-size:13px;color:rgba(255,255,255,0.8);padding-bottom:5px">' + ev.genre + '</td></tr>' : '';
  var doorsRow  = ev.doorsOpen ? '<tr><td style="font-size:12px;color:rgba(255,255,255,0.45);padding-right:8px;padding-bottom:5px">\uD83D\uDD50</td><td style="font-size:13px;color:rgba(255,255,255,0.8);padding-bottom:5px">Doors open ' + ev.doorsOpen + '</td></tr>' : '';
  var descBlock = ev.description ? '<tr><td style="padding:0 32px 20px"><div style="font-size:14px;color:rgba(255,255,255,0.6);line-height:1.65;border-left:3px solid rgba(245,200,66,0.4);padding-left:14px">' + ev.description + '</div></td></tr>' : '';
  var offerBlock = ev.specialOffer ? '<tr><td style="padding:0 32px 24px"><div style="background:rgba(245,200,66,0.1);border:1px solid rgba(245,200,66,0.25);border-radius:8px;padding:12px 16px;font-size:13px;color:#f5c842">\u2728 Special Offer: ' + ev.specialOffer + '</div></td></tr>' : '';
  var html = emailHeader() +
    '<tr><td style="padding:28px 32px 16px">' +
      '<div style="font-size:22px;font-weight:700;color:#fff;margin-bottom:8px">' + (ev.eventTitle||'New Event') + ' is LIVE \uD83C\uDF89</div>' +
      '<div style="font-size:14px;color:rgba(255,255,255,0.55);line-height:1.6">Hey ' + firstName + '! A new event just dropped in your city. Be among the first to know.</div>' +
    '</td></tr>' +
    '<tr><td style="padding:0 32px 20px">' +
      '<table width="100%" cellpadding="0" cellspacing="0" style="background:rgba(0,208,132,0.07);border:1px solid rgba(0,208,132,0.2);border-radius:10px;padding:16px">' +
        '<tr><td style="padding-bottom:12px"><table cellpadding="0" cellspacing="0">' +
          dateRow + venueRow + genreRow + doorsRow +
        '</table></td></tr>' +
      '</table>' +
    '</td></tr>' +
    descBlock +
    offerBlock +
    '<tr><td style="padding:0 32px 32px;text-align:center">' +
      '<a href="' + APP_URL + '" style="display:inline-block;background:#f5c842;color:#000;font-weight:700;font-size:14px;padding:14px 36px;border-radius:100px;text-decoration:none;letter-spacing:0.5px">Open Tonight App \u2192</a>' +
    '</td></tr>' +
    emailFooter('You are receiving this because you joined the Tonight community.<br/>Reply STOP to unsubscribe.');
  MailApp.sendEmail({ to: toEmail, subject: subject, htmlBody: html, name: APP_NAME });
}

// ═══════════════════════════════════════════════════════════════
// DAILY REMINDERS — installed as a time-based trigger
// Sends "tomorrow" reminders for approved events
// Call installDailyTrigger() once manually from the editor
// ═══════════════════════════════════════════════════════════════
function sendDailyReminders() {
  var ss     = SpreadsheetApp.openById(SHEET_ID);
  var evTab  = ss.getSheetByName(PRO_TAB);
  if (!evTab) return;
  var rows = evTab.getDataRange().getValues();
  var tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  var tmrStr = Utilities.formatDate(tomorrow, 'Asia/Ho_Chi_Minh', 'yyyy-MM-dd');
  for (var i = 1; i < rows.length; i++) {
    var row    = rows[i];
    var status = row[1];
    if (status !== 'Approved') continue;
    var dateVal = row[7];
    var dateStr = '';
    if (dateVal instanceof Date) dateStr = Utilities.formatDate(dateVal, 'Asia/Ho_Chi_Minh', 'yyyy-MM-dd');
    else dateStr = String(dateVal).substring(0, 10);
    if (dateStr !== tmrStr) continue;
    var remCol = row[19]; // column T — 'Reminder Sent'
    if (remCol === 'sent') continue;
    var evData = {
      eventTitle:   row[6],
      city:         row[4],
      venue:        row[2],
      date:         dateStr,
      doorsOpen:    row[8],
      genre:        row[9],
      description:  row[11],
      specialOffer: row[12]
    };
    sendCityReminder(evData);
    evTab.getRange(i + 1, 20).setValue('sent'); // mark column T
  }
}

function sendCityReminder(ev) {
  var ss  = SpreadsheetApp.openById(SHEET_ID);
  var tab = ss.getSheetByName(TAB_NAME);
  if (!tab) return;
  var rows   = tab.getDataRange().getValues();
  var city   = (ev.city || '').toLowerCase().trim();
  var seen   = {};
  for (var i = 1; i < rows.length; i++) {
    var row        = rows[i];
    var memberCity = (row[4] || '').toLowerCase().trim();
    var email      = (row[3] || '').trim();
    var name       = row[1] || 'Friend';
    if (!email || seen[email]) continue;
    if (!city || memberCity === city || memberCity === '') {
      try { sendReminderEmail(email, name, ev); seen[email] = true; } catch(ex) {}
    }
  }
}

function sendReminderEmail(toEmail, toName, ev) {
  var firstName = toName.split(' ')[0] || 'Friend';
  var subject   = '\u23F0 Tomorrow! ' + (ev.eventTitle||'Event') + ' \u2014 ' + (ev.venue||ev.city||'');
  var dateRow   = ev.date      ? '<tr><td style="font-size:12px;color:rgba(255,255,255,0.45);padding-right:8px;padding-bottom:5px">\uD83D\uDCC5</td><td style="font-size:13px;color:rgba(255,255,255,0.8);padding-bottom:5px">Tomorrow, ' + ev.date + '</td></tr>' : '';
  var venueRow  = ev.venue     ? '<tr><td style="font-size:12px;color:rgba(255,255,255,0.45);padding-right:8px;padding-bottom:5px">\uD83D\uDCCD</td><td style="font-size:13px;color:rgba(255,255,255,0.8);padding-bottom:5px">' + ev.venue + (ev.city?', '+ev.city:'') + '</td></tr>' : '';
  var doorsRow  = ev.doorsOpen ? '<tr><td style="font-size:12px;color:rgba(255,255,255,0.45);padding-right:8px;padding-bottom:5px">\uD83D\uDD50</td><td style="font-size:13px;color:rgba(255,255,255,0.8);padding-bottom:5px">Doors open ' + ev.doorsOpen + '</td></tr>' : '';
  var html = emailHeader() +
    '<tr><td style="padding:28px 32px 16px">' +
      '<div style="display:inline-block;background:rgba(255,59,92,0.15);border:1px solid rgba(255,59,92,0.35);border-radius:20px;padding:4px 14px;font-size:11px;font-weight:700;letter-spacing:1.5px;color:#ff3b5c;text-transform:uppercase;margin-bottom:14px">Tomorrow \u23F0</div>' +
      '<div style="font-size:22px;font-weight:700;color:#fff;margin-bottom:8px">' + (ev.eventTitle||'Event') + '</div>' +
      '<div style="font-size:14px;color:rgba(255,255,255,0.55);line-height:1.6">Hey ' + firstName + '! Just a reminder — this event is tomorrow. Don\'t miss out!</div>' +
    '</td></tr>' +
    '<tr><td style="padding:0 32px 20px">' +
      '<table width="100%" cellpadding="0" cellspacing="0" style="background:rgba(255,59,92,0.07);border:1px solid rgba(255,59,92,0.2);border-radius:10px;padding:16px">' +
        '<tr><td><table cellpadding="0" cellspacing="0">' +
          dateRow + venueRow + doorsRow +
        '</table></td></tr>' +
      '</table>' +
    '</td></tr>' +
    '<tr><td style="padding:0 32px 32px;text-align:center">' +
      '<a href="' + APP_URL + '" style="display:inline-block;background:#ff3b5c;color:#fff;font-weight:700;font-size:14px;padding:14px 36px;border-radius:100px;text-decoration:none;letter-spacing:0.5px">View Event \u2192</a>' +
    '</td></tr>' +
    emailFooter('Reminder sent by Tonight Vietnam. Reply STOP to unsubscribe.');
  MailApp.sendEmail({ to: toEmail, subject: subject, htmlBody: html, name: APP_NAME });
}

// ── ONE-TIME SETUP: run once manually from the Apps Script editor ──
// Creates a daily trigger at 10 AM Vietnam time (03:00 UTC) for reminders
function installDailyTrigger() {
  // Remove existing triggers first to avoid duplicates
  ScriptApp.getProjectTriggers().forEach(function(t) {
    if (t.getHandlerFunction() === 'sendDailyReminders') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('sendDailyReminders')
    .timeBased()
    .atHour(10)
    .everyDays(1)
    .inTimezone('Asia/Ho_Chi_Minh')
    .create();
  Logger.log('Daily reminder trigger installed — fires every day at 10:00 AM Vietnam time');
}

// ── Test the approval + blast flow (run manually) ──
function testApproveAndBlast() {
  var testData = {
    source:      'approve-event',
    eventTitle:  'TEST EVENT — delete me',
    city:        'Ho Chi Minh City',
    venue:       'Test Venue',
    date:        '2026-04-20',
    doorsOpen:   '22:00',
    genre:       'Techno',
    description: 'Test description',
    rowIndex:    null
  };
  Logger.log('Blasting to community…');
  var count = sendEventBlast(testData);
  Logger.log('Sent to ' + count + ' members');
}

// ── Helper ────────────────────────────────────────────────────
function jsonOk(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
