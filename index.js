// index.js (sanitised)
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import ejs from 'ejs';
import dotenv from 'dotenv';
import cors from 'cors';
import session from 'express-session';

import sponsorRoutes from './routes/sponsors.js';
import dashboardRoutes from './routes/dashboard.js';
import authRoutes from './routes/auth.js';
import accountRoutes from './routes/account.js';
import publicRoutes from './routes/public.js';
import profileRoutes from './routes/profile.js';
import adminRoutes from './routes/admin.js';
import db from './db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load env early
dotenv.config({ path: path.join(__dirname, '.env') });

const app = express();
const port = process.env.PORT || 3000;

// ────────────────────────────────────────────────────────────────────────────────
// Health check (cheap + early)
app.get('/healthz', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

// Optional: trust proxy only if you actually run behind one (e.g., Nginx/CF)
if (process.env.TRUST_PROXY === '1' || process.env.NODE_ENV === 'production') {
  app.set('trust proxy', 1);
}

// View engine
app.engine('ejs', ejs.__express);
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Static assets
app.use(express.static(path.join(__dirname, 'public')));
// Serve uploads explicitly (do not put behind /dashboard)
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// NOTE: Removed app.use('/sponsors', express.static(...))
// It conflicts with /sponsors router. If you need sponsor assets, serve them from /public.

// Body parsers (before session & routes)
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// CORS (before routes)
const allowedOrigins = (process.env.CORS_ORIGINS || 'http://scraplet.store,https://scraplet.store,http://localhost:3000')
  .split(',')
  .map(o => o.trim())
  .filter(Boolean);

app.use(
  cors({
    origin(origin, cb) {
      if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
      console.warn(`Blocked CORS origin: ${origin}`);
      return cb(new Error('Not allowed by CORS'));
    },
    credentials: true
  })
);

// Sessions (before routes)
// TIP: In production set a strong SESSION_SECRET and secure cookies.
const sessionSecret = process.env.SESSION_SECRET || 'change-me';
if (!process.env.SESSION_SECRET) {
  console.warn('SESSION_SECRET is not set. Falling back to an insecure default.');
}
app.use(
  session({
    name: 'sid',
    secret: sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production', // requires HTTPS when production
      httpOnly: true
    }
  })
);

// Locals for all templates (AFTER session so user is available)
app.use((req, res, next) => {
  res.locals.req = req;                  // allows req.originalUrl in EJS
  res.locals.user = req.session?.user || null; // <%= user %> in all templates
  next();
});

// DB sanity check (non-blocking)
(async () => {
  try {
    await db.query('SELECT 1');
    console.log('Connected to PostgreSQL');
  } catch (error) {
    console.error('DB connection error:', error);
  }
})();

// ────────────────────────────────────────────────────────────────────────────────
// Routes
app.use('/dashboard', dashboardRoutes);
app.use('/auth', authRoutes);
app.use('/account', accountRoutes);
app.use('/', publicRoutes);
app.use('/profile', profileRoutes);
app.use('/admin', adminRoutes);
app.use('/sponsors', sponsorRoutes);

// Dev login helper (kept, but wrapped in try/catch)
app.get('/dev-login', async (req, res, next) => {
  try {
    const userId = Number(process.env.DEV_LOGIN_USER_ID) || 4;

    const result = await db.query('SELECT * FROM users WHERE id = $1', [userId]);
    const user = result.rows[0];
    if (!user) return res.status(404).send('User not found');

    req.session.userId = user.id;
    req.session.user = user;

    console.log('Dev login session set:', { userId: req.session.userId });
    res.redirect('/dashboard');
  } catch (err) {
    next(err);
  }
});

// Track profile click events
app.post('/track-click', async (req, res, next) => {
  try {
    const { userId, action: rawAction, referrer, timestamp } = req.body;
    const action = typeof rawAction === 'string' ? rawAction.trim().toLowerCase() : null;

    if (!userId || !action) return res.status(400).send('Missing data');

    await db.query(
      `INSERT INTO profile_clicks (user_id, action, referrer, timestamp)
       VALUES ($1, $2, $3, to_timestamp($4 / 1000.0))`,
      [userId, action, referrer || null, timestamp || Date.now()]
    );

    res.sendStatus(200);
  } catch (err) {
    next(err);
  }
});

// Track heatmap clicks
app.post('/track-heatmap', async (req, res, next) => {
  try {
    const { userId, x, y } = req.body;
    if (!userId || x == null || y == null) return res.status(400).send('Missing data');

    await db.query(
      `INSERT INTO profile_heatmap (user_id, x, y)
       VALUES ($1, $2, $3)`,
      [userId, x, y]
    );

    res.sendStatus(200);
  } catch (err) {
    next(err);
  }
});

// ────────────────────────────────────────────────────────────────────────────────
// Errors
app.use((req, res) => {
  res.status(404).render('404');
});

app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).render('500');
});

// ────────────────────────────────────────────────────────────────────────────────
// Start
app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
