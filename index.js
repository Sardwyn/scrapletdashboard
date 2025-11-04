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

dotenv.config({ path: path.join(__dirname, '.env') });

const app = express();
const port = process.env.PORT || 3000;

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
app.use(express.json());

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

// 🧭 Routes
app.get('/healthz', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

app.use('/dashboard', dashboardRoutes);
app.use('/auth', authRoutes);
app.use('/account', accountRoutes);
app.use('/', publicRoutes);
app.use('/profile', profileRoutes);
app.use('/admin', adminRoutes);
app.use('/sponsors', sponsorRoutes);

app.get('/dev-login', async (req, res) => {
  const userId = 4;

  // Fetch user from DB
  const result = await db.query('SELECT * FROM users WHERE id = $1', [userId]);
  const user = result.rows[0];

  if (!user) {
    return res.status(404).send('User not found');
  }

  // Set full user session
  req.session.userId = user.id;
  req.session.user = user;

  console.log('Dev login session set:', req.session);
  res.redirect('/dashboard');
});



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
