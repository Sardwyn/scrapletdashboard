
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import ejs from 'ejs';
import dotenv from 'dotenv';

import cors from 'cors';

import dashboardRoutes from './routes/dashboard.js';

import session from 'express-session';

import dashboardRoutes from './routes/dashboard.js';
import authRoutes from './routes/auth.js';
import accountRoutes from './routes/account.js';
import publicRoutes from './routes/public.js';
import profileRoutes from './routes/profile.js';
import adminRoutes from './routes/admin.js';


import cors from 'cors'; // ✅ also make sure this is imported with `import`, not `require`
import db from './db.js';

dotenv.config({ path: path.join(__dirname, '.env') });


const app = express(); // ✅ must come before any `app.use(...)`
const port = 3000;

(async () => {
  try {
    await db.query('SELECT 1');
    console.log('Connected to PostgreSQL');
  } catch (error) {
    console.error('DB connection error:', error);
  }
})();


const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

app.set('trust proxy', 1);

app.engine('ejs', ejs.__express);
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());


const allowedOrigins = (process.env.CORS_ORIGINS || 'http://scraplet.store')
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

app.use(cors({
  origin: 'http://scraplet.store',
  credentials: true
}));


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

app.get('/healthz', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

app.use(session({
  secret: sessionSecret || 'change-me',
  resave: false,
  saveUninitialized: false,
  cookie: {
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production'
  }
}));


app.use('/dashboard', dashboardRoutes);
app.use('/auth', authRoutes);
app.use('/account', accountRoutes);
app.use('/', publicRoutes);
app.use('/profile', profileRoutes);
app.use('/admin', adminRoutes);


app.use((req, res) => {
  res.status(404).render('404');
});

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).render('500');
});



app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
