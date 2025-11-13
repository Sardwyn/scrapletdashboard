// routes/widgets-loader.js
import express from 'express';
import { verifyWidgetToken } from '../utils/widgetTokens.js';
import path from 'path';
import { fileURLToPath } from 'url';

const router = express.Router();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Public OBS loader: /w/:token
router.get('/w/:token', async (req, res) => {
  try {
    const token = req.params.token;
    const payload = verifyWidgetToken(token);
    if (!payload) throw new Error('Invalid or expired widget token');

    const { sub: userId, wid: widgetId } = payload;

    // Optional: log the view
    console.log(`🎛️ Widget '${widgetId}' loaded for user ${userId}`);

    // Render widget view (must exist in /views/widgets/)
    res.render(`widgets/${widgetId}`, {
      userId,
      widgetId,
      config: {}
    });
  } catch (err) {
    console.error('Widget load failed:', err.message);
    res.status(401).send('Invalid or expired widget link.');
  }
});

export default router;
