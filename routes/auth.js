import express from 'express';
import bcrypt from 'bcrypt';
import db from '../db.js';
import validator from 'validator';
import multer from 'multer';

const router = express.Router();
const upload = multer({ dest: 'public/uploads/' });

// Debug middleware for all auth routes
router.use((req, res, next) => {
  console.debug(`Auth route hit: ${req.method} ${req.originalUrl}`);
  next();
});

// Signup route
router.post('/signup', async (req, res) => {
  let { email, password, username } = req.body;

  email = email.trim();
  username = validator.escape(username.trim());

  if (!validator.isEmail(email)) {
    return res.status(400).send('Invalid email format');
  }

  try {
    const passwordHash = await bcrypt.hash(password, 10);

    await db.query(
      'INSERT INTO users (email, password_hash, username) VALUES ($1, $2, $3)',
      [email, passwordHash, username]
    );

    const result = await db.query('SELECT id FROM users WHERE email = $1', [email]);
    const user = result.rows[0];

    req.session.user = {
      id: user.id,
      email,
      username,
      plam: user.plan
    };

    console.debug('Signup successful for:', email);
    res.redirect('/auth/onboard');
  } catch (err) {
    console.error('Signup error:', err.stack || err);
    res.status(500).send('Signup failed');
  }
});

// Login page
router.get('/login', (req, res) => {
  res.render('login');
});

// Login route with enhanced logging
router.post('/login', async (req, res) => {
  let { email, username, password } = req.body;

  console.debug('Login payload received:', { email, username });

  if (!password || (!email && !username)) {
    return res.status(400).json({ success: false, message: 'Email or username and password required' });
  }

  const identifier = email?.trim() || username?.trim();
  const queryField = email ? 'email' : 'username';

  try {
    const result = await db.query(
      `SELECT * FROM users WHERE ${queryField} = $1`,
      [identifier]
    );

    const user = result.rows[0];
    console.debug('User lookup result:', user);

    if (!user || !user.password_hash) {
      console.debug('Login failed: user or password_hash missing');
      return res.status(401).json({ success: false, message: 'User not found or password missing' });
    }

    let valid = false;
    try {
      valid = await bcrypt.compare(password, user.password_hash);
    } catch (err) {
      console.error('bcrypt.compare() error:', err.stack || err);
      return res.status(500).json({ success: false, message: 'Password check failed' });
    }

    if (!valid) {
      console.debug('Login failed: invalid password');
      return res.status(401).json({ success: false, message: 'Invalid password' });
    }

    req.session.user = {
      id: user.id,
      email: user.email,
      username: user.username
    };

    console.debug('Login successful for:', identifier);
    res.json({ success: true, redirect: '/dashboard' });
  } catch (err) {
    console.error('Login route error:', err.stack || err);
    res.status(500).json({ success: false, message: 'Login failed' });
  }
});

// Signup page
router.get('/signup', (req, res) => {
  res.render('signup');
});

// Logout route
router.post('/logout', (req, res) => {
  req.session.destroy(() => {
    console.debug('Session destroyed');
    res.redirect('/');
  });
});

// Onboard page
router.get('/onboard', (req, res) => {
  if (!req.session.user) {
    console.debug('Onboard access denied: no session');
    return res.redirect('/auth/login');
  }
  res.render('onboard');
});

// Onboard submission
router.post('/onboard', upload.single('avatar'), async (req, res) => {
  if (!req.session.user) {
    console.debug('Onboard POST denied: no session');
    return res.redirect('/auth/login');
  }

  let { bio, tags } = req.body;
  const avatarPath = req.file ? `/uploads/${req.file.filename}` : null;
  const tagArray = tags.split(',').map(t => validator.escape(t.trim())).filter(Boolean);

  bio = validator.escape(bio.trim());

  console.debug('Onboarding data:', {
    bio,
    tags: tagArray,
    avatarPath,
    userId: req.session.user.id
  });

  try {
    await db.query(
      'UPDATE users SET bio = $1, tags = $2, avatar_url = $3 WHERE id = $4',
      [bio, tagArray, avatarPath, req.session.user.id]
    );

    res.redirect('/dashboard');
  } catch (err) {
    console.error('Onboarding error:', err.stack || err);
    res.status(500).send('Profile setup failed');
  }
});

export default router;
