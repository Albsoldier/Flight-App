const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const router = express.Router();
const database = require('./database');
const authMiddleware = require('./middleware/auth');

function isStrongPassword(pw) {
  if (!pw || pw.length < 10) return 'Password must be at least 10 characters';
  if (!/[A-Z]/.test(pw)) return 'Password must contain an uppercase letter';
  if (!/[a-z]/.test(pw)) return 'Password must contain a lowercase letter';
  if (!/[0-9]/.test(pw)) return 'Password must contain a number';
  return null;
}

async function establishSession(req, user) {
  req.session.userId = user.id;
  req.session.username = user.username;
  req.session.role = user.role;
  req.session.fullName = user.full_name;
  await authMiddleware.logSession(user.id, req.session.id, req.ip, req.get('user-agent'));
}

// STATUS
router.get('/status', async function(req, res) {
  try {
    const initialized = (await database.isSystemInitialized()) || (await database.adminExists());
    const hasAdmin = await database.adminExists();
    res.json({
      initialized: initialized,
      hasAdmin: hasAdmin,
      needsSetup: !initialized && !hasAdmin,
      discordEnabled: !!(process.env.DISCORD_CLIENT_ID && process.env.DISCORD_CLIENT_SECRET),
      gtawEnabled: !!(process.env.GTAW_CLIENT_ID && process.env.GTAW_CLIENT_SECRET)
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// SETUP FIRST ADMIN
router.post('/setup', async function(req, res) {
  try {
    if ((await database.isSystemInitialized()) || (await database.adminExists())) {
      return res.status(403).json({ error: 'System already initialized' });
    }
    const username = req.body.username;
    const password = req.body.password;
    const fullName = req.body.fullName;
    const email = req.body.email;
    if (!username || !password || !fullName) {
      return res.status(400).json({ error: 'Username, password, and fullName required' });
    }
    const pwErr = isStrongPassword(password);
    if (pwErr) return res.status(400).json({ error: pwErr });
    const adminId = await database.createFirstAdmin(username, password, fullName, email);
    await database.markSystemInitialized();
    res.json({ success: true, message: 'Admin created', adminId: adminId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create admin' });
  }
});

// LOGIN
router.post('/login', async function(req, res) {
  try {
    const username = req.body.username;
    const password = req.body.password;
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password required' });
    }
    const result = await database.db.execute({
      sql: 'SELECT * FROM users WHERE username = ? AND is_active = 1',
      args: [username]
    });
    const user = result.rows[0];
    if (!user || !user.password || !bcrypt.compareSync(password, user.password)) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    await establishSession(req, user);
    res.json({
      success: true,
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        fullName: user.full_name,
        email: user.email
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Login failed' });
  }
});

// LOGOUT
router.post('/logout', async function(req, res) {
  if (req.session) await authMiddleware.removeSession(req.session.id);
  req.session.destroy(function(err) {
    if (err) return res.status(500).json({ error: 'Logout failed' });
    res.json({ success: true });
  });
});

// ME
router.get('/me', async function(req, res) {
  if (!req.session || !req.session.userId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  try {
    const result = await database.db.execute({
      sql: 'SELECT id, username, role, full_name, email, phone, license_number, total_hours, created_at, auth_provider, discord_username, gtaw_username, gtaw_character FROM users WHERE id = ?',
      args: [req.session.userId]
    });
    const user = result.rows[0];
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ user: user });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// UPDATE DISPLAY NAME
router.post('/set-name', async function(req, res) {
  if (!req.session || !req.session.userId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const fullName = (req.body.fullName || '').trim();

  if (!fullName) {
    return res.status(400).json({ error: 'Name is required' });
  }
  if (fullName.length < 2) {
    return res.status(400).json({ error: 'Name must be at least 2 characters' });
  }
  if (fullName.length > 40) {
    return res.status(400).json({ error: 'Name must be 40 characters or less' });
  }
  if (!/^[A-Za-z0-9 \-'.]+$/.test(fullName)) {
    return res.status(400).json({ error: 'Name contains invalid characters' });
  }

  try {
    await database.db.execute({
      sql: 'UPDATE users SET full_name = ? WHERE id = ?',
      args: [fullName, req.session.userId]
    });

    req.session.fullName = fullName;

    res.json({ success: true, fullName: fullName });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update name' });
  }
});

// DISCORD REDIRECT
router.get('/discord', function(req, res) {
  const clientId = process.env.DISCORD_CLIENT_ID;
  const redirectUri = process.env.DISCORD_REDIRECT_URI;
  if (!clientId || !redirectUri) {
    return res.status(500).send('Discord login not configured');
  }
  const state = crypto.randomBytes(16).toString('hex');
  req.session.oauthState = state;
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'identify guilds guilds.members.read',
    state: state,
    prompt: 'consent'
  });
  res.redirect('https://discord.com/oauth2/authorize?' + params.toString());
});

// DISCORD CALLBACK
router.get('/discord/callback', async function(req, res) {
  const code = req.query.code;
  const state = req.query.state;

  if (!state || state !== req.session.oauthState) {
    return res.redirect('/index.html?error=state_mismatch');
  }
  delete req.session.oauthState;

  if (!code) {
    return res.redirect('/index.html?error=no_code');
  }

  try {
    const tokenResponse = await fetch('https://discord.com/api/v10/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.DISCORD_CLIENT_ID,
        client_secret: process.env.DISCORD_CLIENT_SECRET,
        grant_type: 'authorization_code',
        code: code,
        redirect_uri: process.env.DISCORD_REDIRECT_URI
      })
    });

    if (!tokenResponse.ok) {
      console.error('Discord token exchange failed:', await tokenResponse.text());
      return res.redirect('/index.html?error=discord_token_failed');
    }

    const tokenData = await tokenResponse.json();
    const accessToken = tokenData.access_token;

    const userResponse = await fetch('https://discord.com/api/v10/users/@me', {
      headers: { Authorization: 'Bearer ' + accessToken }
    });

    if (!userResponse.ok) {
      return res.redirect('/index.html?error=discord_user_failed');
    }

    const discordUser = await userResponse.json();

    const guildId = process.env.DISCORD_GUILD_ID;
    const memberResponse = await fetch(
      'https://discord.com/api/v10/users/@me/guilds/' + guildId + '/member',
      { headers: { Authorization: 'Bearer ' + accessToken } }
    );

    if (!memberResponse.ok) {
      console.error('Discord member check failed. Status:', memberResponse.status);
      return res.redirect('/index.html?error=not_in_gtaW');
    }

    const member = await memberResponse.json();

    const requiredRole = process.env.DISCORD_REQUIRED_ROLE_ID;
    if (requiredRole && (!member.roles || member.roles.indexOf(requiredRole) === -1)) {
      return res.redirect('/index.html?error=missing_role');
    }

    const existingResult = await database.db.execute({
      sql: 'SELECT * FROM users WHERE discord_id = ?',
      args: [discordUser.id]
    });

    let user = existingResult.rows[0];

    if (!user) {
      const username = 'discord_' + discordUser.id;
      const fullName = discordUser.global_name || discordUser.username;
      const insertResult = await database.db.execute({
        sql: 'INSERT INTO users (username, password, role, full_name, is_active, discord_id, discord_username, discord_avatar, auth_provider) VALUES (?, NULL, ?, ?, 1, ?, ?, ?, ?)',
        args: [
          username,
          'student',
          fullName,
          discordUser.id,
          discordUser.username,
          discordUser.avatar || null,
          'discord'
        ]
      });
      const newUserId = Number(insertResult.lastInsertRowid);
      const newUserResult = await database.db.execute({
        sql: 'SELECT * FROM users WHERE id = ?',
        args: [newUserId]
      });
      user = newUserResult.rows[0];
    } else {
      await database.db.execute({
        sql: 'UPDATE users SET discord_username = ?, discord_avatar = ? WHERE id = ?',
        args: [discordUser.username, discordUser.avatar || null, user.id]
      });
    }

    if (!user.is_active) {
      return res.redirect('/index.html?error=account_inactive');
    }

    await establishSession(req, user);
    res.redirect('/dashboard.html');

  } catch (err) {
    console.error('Discord auth error:', err);
    res.redirect('/index.html?error=discord_error');
  }
});

// ============================================
// GTAW OAUTH 2.0
// ============================================

// Step 1: Redirect to GTAW
router.get('/gtaw', function(req, res) {
  const clientId = process.env.GTAW_CLIENT_ID;
  const redirectUri = process.env.GTAW_REDIRECT_URI;
  const server = process.env.GTAW_SERVER || 'en';

  if (!clientId || !redirectUri) {
    return res.status(500).send('GTAW login not configured');
  }

  const state = crypto.randomBytes(16).toString('hex');
  req.session.gtawState = state;

  const baseUrl = server === 'fr'
    ? 'https://ucp-fr.gta.world'
    : 'https://ucp.gta.world';

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    state: state
  });

  res.redirect(baseUrl + '/oauth/authorize?' + params.toString());
});

// Step 2: Handle GTAW callback
router.get('/gtaw/callback', async function(req, res) {
  const code = req.query.code;
  const state = req.query.state;
  const errorParam = req.query.error;
  const server = process.env.GTAW_SERVER || 'en';

  if (errorParam) {
    console.error('GTAW callback error:', errorParam, req.query.error_description || '');
    if (errorParam === 'access_denied') {
      return res.redirect('/index.html?error=no_code');
    }
    return res.redirect('/index.html?error=gtaw_error');
  }

  if (!state || state !== req.session.gtawState) {
    return res.redirect('/index.html?error=state_mismatch');
  }
  delete req.session.gtawState;

  if (!code) {
    return res.redirect('/index.html?error=no_code');
  }

  try {
    const baseUrl = server === 'fr'
      ? 'https://ucp-fr.gta.world'
      : 'https://ucp.gta.world';

    const tokenResponse = await fetch(baseUrl + '/oauth/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json'
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: process.env.GTAW_CLIENT_ID,
        client_secret: process.env.GTAW_CLIENT_SECRET,
        code: code,
        redirect_uri: process.env.GTAW_REDIRECT_URI
      })
    });

    if (!tokenResponse.ok) {
      const errBody = await tokenResponse.text();
      console.error('GTAW token exchange failed:', errBody);
      return res.redirect('/index.html?error=gtaw_token_failed');
    }

    const tokenData = await tokenResponse.json();
    const accessToken = tokenData.access_token;

    const userInfoUrl = baseUrl + '/api/user';

    const userResponse = await fetch(userInfoUrl, {
      headers: {
        'Authorization': 'Bearer ' + accessToken,
        'Accept': 'application/json'
      }
    });

    const contentType = userResponse.headers.get('content-type') || '';

    if (!userResponse.ok) {
      const errText = await userResponse.text();
      console.error('=== GTAW USERINFO ERROR ===');
      console.error('Status:', userResponse.status);
      console.error('Body (first 500):', errText.substring(0, 500));
      return res.redirect('/index.html?error=gtaw_user_failed');
    }

    if (contentType.indexOf('application/json') === -1) {
      const rawText = await userResponse.text();
      console.error('=== GTAW RETURNED NON-JSON ===');
      console.error('Content-Type:', contentType);
      console.error('Body (first 500):', rawText.substring(0, 500));
      return res.redirect('/index.html?error=gtaw_user_failed');
    }

    const gtawUser = await userResponse.json();
    console.log('=== GTAW USER DATA ===');
    console.log(JSON.stringify(gtawUser, null, 2));

    const existingResult = await database.db.execute({
      sql: 'SELECT * FROM users WHERE gtaw_id = ?',
      args: [String(gtawUser.sub || gtawUser.id)]
    });

    let user = existingResult.rows[0];

    if (!user) {
      const gtawId = String(gtawUser.sub || gtawUser.id);
      const username = 'gtaw_' + gtawId;
      const fullName = gtawUser.username || gtawUser.name || 'GTAW User';
      const email = gtawUser.email || null;
      const character = gtawUser.character ? (gtawUser.character.name || JSON.stringify(gtawUser.character)) : null;

      const insertResult = await database.db.execute({
        sql: 'INSERT INTO users (username, password, role, full_name, email, is_active, gtaw_id, gtaw_username, gtaw_character, auth_provider) VALUES (?, NULL, ?, ?, ?, 1, ?, ?, ?, ?)',
        args: [
          username,
          'student',
          fullName,
          email,
          gtawId,
          gtawUser.username || null,
          character,
          'gtaw'
        ]
      });
      const newUserId = Number(insertResult.lastInsertRowid);
      const newUserResult = await database.db.execute({
        sql: 'SELECT * FROM users WHERE id = ?',
        args: [newUserId]
      });
      user = newUserResult.rows[0];
    } else {
      const character = gtawUser.character ? (gtawUser.character.name || JSON.stringify(gtawUser.character)) : null;
      await database.db.execute({
        sql: 'UPDATE users SET gtaw_username = ?, gtaw_character = ? WHERE id = ?',
        args: [gtawUser.username || null, character, user.id]
      });
    }

    if (!user.is_active) {
      return res.redirect('/index.html?error=account_inactive');
    }

    await establishSession(req, user);
    res.redirect('/dashboard.html');

  } catch (err) {
    console.error('GTAW auth error:', err);
    res.redirect('/index.html?error=gtaw_error');
  }
});

module.exports = router;
