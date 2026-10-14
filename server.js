const express = require('express');
const session = require('express-session');
const cors = require('cors');
const path = require('path');
const http = require('http');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { Server } = require('socket.io');
const TursoStore = require('./session-store');
require('dotenv').config();

const app = express();
const server = http.createServer(app);

// Warn if secret is missing (do not silently fall back to insecure default in prod)
if (!process.env.SESSION_SECRET) {
  console.warn('⚠️  SESSION_SECRET is not set — using insecure default. Set it in Render env vars.');
}

const io = new Server(server, { cors: { origin: '*' } });

const PORT = process.env.PORT || 3000;

// ------------------------------------------------------------
// TRUST PROXY (required for Render + secure cookies + rate limit)
// ------------------------------------------------------------
app.set('trust proxy', 1);

// ------------------------------------------------------------
// SECURITY HEADERS (Helmet)
// ------------------------------------------------------------
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.socket.io"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "blob:", "https:"],
      connectSrc: ["'self'", "wss:", "https:", "ws:"],
      fontSrc: ["'self'", "data:"],
      objectSrc: ["'none'"],
      frameAncestors: ["'none'"],
      upgradeInsecureRequests: []
    }
  },
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: 'cross-origin' }
}));

// ------------------------------------------------------------
// CORS — restrict to your own origin(s) instead of "any"
// ------------------------------------------------------------
const ALLOWED_ORIGINS = [
  'https://saaa-flight.fun/',
  'https://flight-app-saaa.onrender.com',
  'http://localhost:3000',
  'http://localhost:10000'
];

app.use(cors({
  origin: function(origin, callback) {
    // Allow same-origin requests (no Origin header) and allowed origins
    if (!origin) return callback(null, true);
    if (ALLOWED_ORIGINS.indexOf(origin) !== -1) return callback(null, true);
    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true
}));

// ------------------------------------------------------------
// BODY PARSING — with size limits (prevents memory DoS)
// ------------------------------------------------------------
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// ------------------------------------------------------------
// RATE LIMITING
// ------------------------------------------------------------
// Global API limiter — 300 requests per minute per IP
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, slow down.' }
});

// Auth limiter — strict, applied to /api/auth/login and /api/auth/setup
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,   // 15 minutes
  max: 20,                     // 20 attempts per window
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts. Try again later.' },
  skipSuccessfulRequests: true
});

app.use('/api/', apiLimiter);
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/setup', authLimiter);

// ------------------------------------------------------------
// SESSION
// ------------------------------------------------------------
app.use(session({
  store: new TursoStore(),
  secret: process.env.SESSION_SECRET || 'dev-secret-change-me',
  resave: false,
  saveUninitialized: false,
  proxy: true,
  rolling: true,
  cookie: {
    secure: true,
    httpOnly: true,
    sameSite: 'none',
    maxAge: 1000 * 60 * 60 * 24 * 30
  }
}));

// ------------------------------------------------------------
// STATIC FILES
// ------------------------------------------------------------
app.use(express.static(path.join(__dirname, 'public'), {
  // Don't serve index.html for /api/* paths (avoid HTML fallback for API)
  setHeaders: function(res, filePath) {
    // Ensure HTML is never cached aggressively so users get fresh versions
    if (filePath.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    }
  }
}));

// ------------------------------------------------------------
// ROUTES
// ------------------------------------------------------------
app.set('io', io);

app.use('/api/auth', require('./routes/auth'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/flights', require('./routes/flights'));
app.use('/api/materials', require('./routes/materials'));
app.use('/api/aircraft', require('./routes/aircraft'));
app.use('/api/notams', require('./routes/notams'));
app.use('/api/routes', require('./routes/routes'));
app.use('/api/certificates', require('./routes/certificates'));
app.use('/api/rentals', require('./routes/rentals'));
app.use('/api/notifications', require('./routes/notifications'));

app.get('/api/health', function(req, res) {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ------------------------------------------------------------
// FALLBACK — serve index.html only for non-API paths
// ------------------------------------------------------------
app.get('*', function(req, res) {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'Not found' });
  }
  res.sendFile(path.join(__dirname, 'public', 'index.html'), function(err) {
    if (err) {
      res.status(200).send('<h1>San Andreas Aviation Administration</h1><p>Server is running.</p>');
    }
  });
});

// ------------------------------------------------------------
// SOCKET.IO
// ------------------------------------------------------------
const authMiddleware = require('./middleware/auth');

io.on('connection', function(socket) {
  socket.emit('online-users', authMiddleware.getOnlineUsers());
  const interval = setInterval(function() {
    try { socket.emit('online-users', authMiddleware.getOnlineUsers()); } catch (e) {}
  }, 10000);
  socket.on('disconnect', function() { clearInterval(interval); });
});

// ------------------------------------------------------------
// ERROR HANDLER
// ------------------------------------------------------------
app.use(function(err, req, res, next) {
  console.error(err.stack);
  if (err.message === 'Not allowed by CORS') {
    return res.status(403).json({ error: 'Origin not allowed' });
  }
  res.status(500).json({ error: 'Something went wrong!' });
});

server.listen(PORT, '0.0.0.0', function() {
  console.log('');
  console.log('===========================================');
  console.log('  San Andreas Aviation Administration');
  console.log('===========================================');
  console.log('  Server: http://localhost:' + PORT);
  console.log('  API:    http://localhost:' + PORT + '/api');
  console.log('===========================================');
});
