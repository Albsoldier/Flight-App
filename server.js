const express = require('express');
const session = require('express-session');
const cors = require('cors');
const path = require('path');
const http = require('http');
const { Server } = require('socket.io');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

const PORT = process.env.PORT || 3000;

app.set('trust proxy', 1);
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(session({
  secret: process.env.SESSION_SECRET || 'dev-secret-change-me',
  resave: false,
  saveUninitialized: false,
  proxy: true,
  cookie: {
    secure: true,
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 1000 * 60 * 60 * 8
  }
}));

app.use(express.static(path.join(__dirname, 'public')));

// Make io globally accessible to routes
app.set('io', io);

app.use('/api/auth', require('./routes/auth'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/flights', require('./routes/flights'));
app.use('/api/materials', require('./routes/materials'));
app.use('/api/aircraft', require('./routes/aircraft'));
app.use('/api/notams', require('./routes/notams'));

app.get('/api/health', function(req, res) {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.get('*', function(req, res) {
  res.sendFile(path.join(__dirname, 'public', 'index.html'), function(err) {
    if (err) {
      res.status(200).send('<h1>San Andreas Aviation Administration</h1><p>Server is running.</p>');
    }
  });
});

const authMiddleware = require('./middleware/auth');

io.on('connection', function(socket) {
  socket.emit('online-users', authMiddleware.getOnlineUsers());
  const interval = setInterval(function() {
    try { socket.emit('online-users', authMiddleware.getOnlineUsers()); } catch (e) {}
  }, 10000);
  socket.on('disconnect', function() { clearInterval(interval); });
});

app.use(function(err, req, res, next) {
  console.error(err.stack);
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
