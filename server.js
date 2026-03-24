require('dotenv').config();
const express    = require('express');
const helmet     = require('helmet');
const cors       = require('cors');
const session    = require('express-session');
const cookieParser = require('cookie-parser');
const path       = require('path');

const authRoutes   = require('./routes/auth');
const adminRoutes  = require('./routes/admin');
const editorRoutes = require('./routes/editor');
const { initDatabase } = require('./database/db');

const app  = express();
const PORT = process.env.PORT || 3000;

// ──────────────────────────────────────────────
// Database bootstrap  (handled in startServer)
// ────────────────────────────────────────────

// ──────────────────────────────────────────────
// Security headers (helmet)
// ────────────────────────────────────────────
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc:  ["'self'", "'unsafe-inline'", 'https://www.google.com', 'https://www.gstatic.com'],
        styleSrc:   ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        fontSrc:    ["'self'", 'https://fonts.gstatic.com'],
        imgSrc:     ["'self'", 'data:', 'https://www.gstatic.com', 'https://www.google.com'],
        frameSrc:   ['https://www.google.com', 'https://recaptcha.google.com'],
        connectSrc: ["'self'", 'https://www.google.com'],
      },
    },
  })
);

// ──────────────────────────────────────────────
// CORS
// ────────────────────────────────────────────
app.use(
  cors({
    origin: process.env.FRONTEND_URL || `http://localhost:${PORT}`,
    credentials: true,
  })
);

// ──────────────────────────────────────────────
// Body parsers
// ────────────────────────────────────────────
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));
app.use(cookieParser());

// ──────────────────────────────────────────────
// Session
// ────────────────────────────────────────────
app.use(
  session({
    secret: process.env.SESSION_SECRET || 'dev-secret-change-in-production',
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure:   process.env.NODE_ENV === 'production',
      httpOnly: true,
      maxAge:   30 * 60 * 1000, // 30 minutes
    },
  })
);

// ──────────────────────────────────────────────
// Static files
// ────────────────────────────────────────────
app.use(express.static(path.join(__dirname, 'public')));

// ──────────────────────────────────────────────
// API routes
// ────────────────────────────────────────────
app.use('/api/auth',   authRoutes);
app.use('/api/admin',  adminRoutes);
app.use('/api/editor', editorRoutes);

// ──────────────────────────────────────────────
// Page routes
// ────────────────────────────────────────────
app.get('/',                (_req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/login',           (_req, res) => res.sendFile(path.join(__dirname, 'public', 'login.html')));
app.get('/forgot-password', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'forgot-password.html')));
app.get('/reset-password',  (_req, res) => res.sendFile(path.join(__dirname, 'public', 'reset-password.html')));
app.get('/otp-verify',      (_req, res) => res.sendFile(path.join(__dirname, 'public', 'otp-verify.html')));
app.get('/admin',           (_req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));
app.get('/dashboard',       (_req, res) => res.sendFile(path.join(__dirname, 'public', 'dashboard.html')));
app.get('/editor',          (_req, res) => res.sendFile(path.join(__dirname, 'public', 'editor.html')));
app.get('/change-password', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'change-password.html')));

// ──────────────────────────────────────────────
// Error handlers
// ────────────────────────────────────────────
app.use((_req, res) => res.status(404).json({ success: false, message: 'Resource not found' }));

// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  console.error(err.stack);
  res.status(500).json({ success: false, message: 'Internal server error' });
});

// ──────────────────────────────────────────────
// Start  (async so we can await initDatabase)
// ────────────────────────────────────────────
async function startServer() {
  try {
    await initDatabase();
    const { isGmailConfigured } = require('./utils/emailService');
    const server = app.listen(PORT, () => {
      console.log(`\n🔒  Secure Registration System`);
      console.log(`    http://localhost:${PORT}\n`);
      console.log(`📊  Admin Panel  → http://localhost:${PORT}/admin`);
      console.log(`    Credentials  → admin / Admin@123456\n`);
      if (isGmailConfigured()) {
        console.log(`📧  Email       → Gmail SMTP (${process.env.EMAIL_USER})`);
      } else {
        console.log(`📧  Email       → Ethereal demo (set EMAIL_PASS in .env for real Gmail)`);
      }
      console.log('');
    });

    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        console.error(`\n❌  Port ${PORT} is already in use.`);
        console.error(`    Stop the other process first, or set a different PORT in .env\n`);
        console.error(`    To kill it on Windows, run:`);
        console.error(`      netstat -ano | findstr :${PORT}`);
        console.error(`      taskkill /PID <PID> /F\n`);
      } else {
        console.error('❌  Server error:', err.message);
      }
      process.exit(1);
    });
  } catch (err) {
    console.error('❌  Failed to start server:', err);
    process.exit(1);
  }
}

startServer();
