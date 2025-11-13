import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import ejs from 'ejs';
import dotenv from 'dotenv';
import cors from 'cors';
import session from 'express-session';
import integrationsRoutes from './routes/integrations.js';
import dashboardRoutes from './routes/dashboard.js';
import authRoutes from './routes/auth.js';
import accountRoutes from './routes/account.js';
import publicRoutes from './routes/public.js';
import profileRoutes from './routes/profile.js';
import adminRoutes from './routes/admin.js';
import kickIngest from './routes/kickIngest.js';
import db from './db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '.env'), override: true });

console.log('ENV loaded from', path.join(__dirname, '.env'));
console.log('DATABASE_URL (effective):', (process.env.DASHBOARD_DATABASE_URL || process.env.DATABASE_URL || '').replace(/(:\/\/[^:]+:)([^@]+)@/, '$1***@'));

const app = express();
const port = process.env.PORT || 3000;

const show = (s) => s?.replace(/(:\/\/[^:]+:)([^@]+)@/, '$1***@');
console.log('DATABASE_URL (effective):', show(process.env.DATABASE_URL));


// 🧠 DB check
(async () => {
  try {
    await db.query('SELECT 1');
    console.log('Connected to PostgreSQL');
  } catch (error) {
    console.error('DB connection error:', error);
  }
})();

// 🧩 Express setup
app.set('trust proxy', 1);
app.engine('ejs', ejs.__express);
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));
// keep existing imports…

// BEFORE routes:
app.use(express.json({
  verify: (req, _res, buf) => {
    // Save raw bytes for HMAC verification
    req.rawBody = Buffer.from(buf);
  },
  type: ['application/json', 'application/*+json']
}));


// 🌐 CORS setup
const allowedOrigins = (process.env.CORS_ORIGINS || 'http://scraplet.store,https://scraplet.store,http://localhost:3000')
  .split(',')
  .map(origin => origin.trim())
  .filter(Boolean);

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      console.warn(`Blocked CORS origin: ${origin}`);
      return callback(new Error('Not allowed by CORS'));
    },
    credentials: true
  })
);

// 🔐 Session setup
const sessionSecret = process.env.SESSION_SECRET;
if (!sessionSecret) {
  console.warn('SESSION_SECRET is not set. Falling back to an insecure default.');
}

app.use(
  session({
    secret: sessionSecret || 'change-me',
    resave: false,
    saveUninitialized: false,
    cookie: {
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production'
    }
  })
);

// Dev Login Route

// 🔐 Dev-only login helper (NEVER enable in production)
app.get('/dev-login', async (req, res) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(404).send('Not available');
  }

  try {
    // Default to your own user, override with ?user=SomeOtherName if needed
    const username = (req.query.user || 'Sardwyn').toString().trim();

    const result = await db.query(
      'SELECT id, username, avatar_url FROM users WHERE username = $1 LIMIT 1',
      [username]
    );

    if (!result.rows.length) {
      console.warn('dev-login: user not found', username);
      return res.status(404).send(`User ${username} not found`);
    }

    const user = result.rows[0];

    // This is what requireAuth will look for
    req.session.user = {
      id: user.id,
      username: user.username,
      avatar_url: user.avatar_url || null,
      // add flags if you want: role: 'admin'
    };

    console.log('dev-login OK for', user.username);
    return res.redirect('/dashboard');
  } catch (err) {
    console.error('dev-login error:', err);
    return res.status(500).send('dev-login failed');
  }
});


// 🧭 Routes
app.get('/healthz', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

// Scrapbot → Dashboard ingestion endpoint
app.use(kickIngest); 
app.use(integrationsRoutes);
app.use('/dashboard', dashboardRoutes);
app.use('/auth', authRoutes);
app.use('/account', accountRoutes);
app.use('/', publicRoutes);
app.use('/profile', profileRoutes);
app.use('/admin', adminRoutes);



// 🧱 Error handling
app.use((req, res) => {
  res.status(404).render('404');
});

app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).render('500');
});

// 🚀 Start server
app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
