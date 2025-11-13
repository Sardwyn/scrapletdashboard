// /utils/widgetTokens.js
import jwt from 'jsonwebtoken';

const SECRET = process.env.WIDGET_JWT_SECRET;

if (!SECRET || SECRET.length < 16) {
  console.warn('[widgetTokens] Weak or missing WIDGET_JWT_SECRET. Set this in .env.');
}

export function mintWidgetToken({ userId, widgetId, ttlSec = 60 * 60 * 24 }) {
  // Keep payload minimal: fast to validate, cheap to transmit, harder to leak PII
  const payload = { sub: String(userId), wid: String(widgetId) };
  return jwt.sign(payload, SECRET, { algorithm: 'HS256', expiresIn: ttlSec });
}

export function verifyWidgetToken(token) {
  try {
    return jwt.verify(token, SECRET, { algorithms: ['HS256'] });
  } catch (err) {
    return null;
  }
}
