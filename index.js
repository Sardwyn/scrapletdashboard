
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

import dotenv from 'dotenv';
import dashboardRoutes from './routes/dashboard.js';
import session from 'express-session';
import authRoutes from './routes/auth.js';
import accountRoutes from './routes/account.js';
import publicRoutes from './routes/public.js';
import profileRoutes from './routes/profile.js';
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

app.get('/test-icon', (req, res) => {
  res.send('<img src="/icons/github.svg" alt="GitHub Icon" />');
});

app.use((req, res, next) => {
  console.log('Request:', req.method, req.url);
  next();
});

app.get('/debug', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/icons/github.svg'));
});




app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.static(path.join(__dirname, 'public')));

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.use(cors({
  origin: 'http://scraplet.store',
  credentials: true
}));

const sessionSecret = process.env.SESSION_SECRET;
if (!sessionSecret) {
  console.warn('SESSION_SECRET is not set. Falling back to an insecure default.');
}

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

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
