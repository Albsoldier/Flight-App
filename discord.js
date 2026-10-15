// server/discord.js
//
// Fire-and-forget Discord webhook notifier.
// Never throws — a Discord outage must not break API responses.
//
// Env vars:
//   DISCORD_WEBHOOK_URL        required — full webhook URL from Discord
//   DISCORD_MENTION_IDS        optional — comma-separated role IDs (or user IDs) to @mention
//   DISCORD_MENTION_ID         optional — single role/user ID (kept for backward compat)
//   DISCORD_MENTION_IS_USER    optional — 'true' if the IDs are users, else roles
//   DISCORD_RENTALS_ENABLED    optional — 'false' to disable (default: enabled)

const https = require('https');
const { URL } = require('url');

const WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL || '';
const MENTION_RAW = process.env.DISCORD_MENTION_IDS || process.env.DISCORD_MENTION_ID || '';
const ENABLED     = process.env.DISCORD_RENTALS_ENABLED !== 'false';

const COLORS = {
  info:    0x38bdf8,
  success: 0x10b981,
  warning: 0xf59e0b,
  danger:  0xef4444
};

function isEnabled() {
  return ENABLED && WEBHOOK_URL.length > 0;
}

// Parse comma-separated mention IDs into a proper mention prefix.
// Non-numeric or blank entries are silently dropped.
function mentionPrefix() {
  if (!MENTION_RAW) return '';
  const isUser = process.env.DISCORD_MENTION_IS_USER === 'true';
  const ids = MENTION_RAW.split(',')
    .map(function(s) { return s.trim(); })
    .filter(function(s) { return /^\d+$/.test(s); });
  if (ids.length === 0) return '';
  return ids.map(function(id) {
    return isUser ? '<@' + id + '>' : '<@&' + id + '>';
  }).join(' ') + ' ';
}

function isoUtc(str) {
  if (!str) return '—';
  const s = String(str).replace(' ', 'T');
  const d = new Date(/[zZ]$/.test(s) ? s : s + 'Z');
  if (isNaN(d.getTime())) return str;
  return d.toISOString().slice(0, 16).replace('T', ' ') + 'Z';
}

function clip(s, max) {
  if (s == null) return '';
  const str = String(s);
  return str.length > max ? str.slice(0, max - 1) + '…' : str;
}

// Low-level send. Returns a Promise<boolean> that resolves either way.
function postPayload(payload) {
  if (!isEnabled()) return Promise.resolve(false);

  let url;
  try { url = new URL(WEBHOOK_URL); } catch (e) {
    console.error('[discord] invalid webhook URL');
    return Promise.resolve(false);
  }

  const body = Buffer.from(JSON.stringify(payload), 'utf8');

  return new Promise(function(resolve) {
    const req = https.request({
      hostname: url.hostname,
      path: url.pathname + url.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': body.length,
        'User-Agent': 'SAAA-Flight-App/1.0'
      },
      timeout: 8000
    }, function(res) {
      res.on('data', function() {});
      res.on('end', function() {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(true);
        } else {
          console.error('[discord] webhook returned status', res.statusCode);
          resolve(false);
        }
      });
    });

    req.on('error', function(err) {
      console.error('[discord] webhook error:', err.message);
      resolve(false);
    });
    req.on('timeout', function() {
      console.error('[discord] webhook timeout');
      req.destroy();
      resolve(false);
    });

    req.write(body);
    req.end();
  });
}

// ---------------------------------------------
// Event helpers
// ---------------------------------------------

async function notifyNewRentalRequest(r) {
  return postPayload({
    content: mentionPrefix() + 'New rental request needs review.',
    allowed_mentions: { parse: ['roles', 'users'] },
    embeds: [{
      title: '📝 New Rental Request',
      color: COLORS.warning,
      fields: [
        { name: 'Aircraft',  value: '**' + (r.tail_number || '?') + '** (' + (r.model || '?') + ')', inline: true },
        { name: 'Requester', value: r.requester_name || 'Unknown', inline: true },
        { name: 'Start',     value: isoUtc(r.start_date), inline: true },
        { name: 'Duration',  value: (r.duration_hours || 0) + ' h', inline: true },
        { name: 'Rate',      value: r.hourly_rate ? '$' + Number(r.hourly_rate).toLocaleString() + '/h' : '—', inline: true }
      ].concat(
        r.notes ? [{ name: 'Notes', value: clip(r.notes, 500) }] : []
      ),
      footer: { text: 'Request #' + (r.id || '?') },
      timestamp: new Date().toISOString()
    }]
  });
}

async function notifyRentalReviewed(r) {
  const approved = r.status === 'approved';
  return postPayload({
    content: mentionPrefix() + 'Rental request **' + r.status + '**.',
    allowed_mentions: { parse: ['roles', 'users'] },
    embeds: [{
      title: approved ? '✅ Rental Approved' : '❌ Rental Denied',
      color: approved ? COLORS.success : COLORS.danger,
      fields: [
        { name: 'Aircraft',    value: '**' + (r.tail_number || '?') + '** (' + (r.model || '?') + ')', inline: true },
        { name: 'Requester',   value: r.requester_name || 'Unknown', inline: true },
        { name: 'Reviewed by', value: r.reviewer_name || '—', inline: true }
      ].concat(
        r.review_notes ? [{ name: 'Reviewer notes', value: clip(r.review_notes, 500) }] : []
      ),
      footer: { text: 'Request #' + (r.id || '?') },
      timestamp: new Date().toISOString()
    }]
  });
}

async function notifyRentalCancelled(r) {
  return postPayload({
    embeds: [{
      title: '🚫 Rental Request Cancelled',
      color: COLORS.danger,
      fields: [
        { name: 'Aircraft',  value: '**' + (r.tail_number || '?') + '** (' + (r.model || '?') + ')', inline: true },
        { name: 'Requester', value: r.requester_name || 'Unknown', inline: true }
      ],
      footer: { text: 'Request #' + (r.id || '?') },
      timestamp: new Date().toISOString()
    }]
  });
}

// Generic helper for ad-hoc messages
async function notifyCustom(title, body, level) {
  return postPayload({
    embeds: [{
      title: title,
      description: body ? clip(body, 2000) : undefined,
      color: COLORS[level] || COLORS.info,
      timestamp: new Date().toISOString()
    }]
  });
}

module.exports = {
  isEnabled,
  notifyNewRentalRequest,
  notifyRentalReviewed,
  notifyRentalCancelled,
  notifyCustom
};
