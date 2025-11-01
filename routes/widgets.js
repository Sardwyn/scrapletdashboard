import { widgets, getWidgetById } from '../utils/mockData.js';
const express = require('express');
const router = express.Router();

// Mock widget data for now
const widgets = [
  {
    id: 'chat',
    name: 'Live Chat',
    icon: '💬',
    description: 'Real-time chat overlay for streams',
    configSchema: {
      fields: [
        { name: 'theme', type: 'select', label: 'Theme', options: ['dark', 'light', 'neon'] },
        { name: 'fontSize', type: 'text', label: 'Font Size (px)' }
      ]
    }
  },
  // Add more widgets here
];

// Utility to fetch widget by ID
function getWidgetById(id) {
  return widgets.find(w => w.id === id);
}

// GET /dashboard/widgets/:id/configure
router.get('/:id/configure', (req, res) => {
  const widget = getWidgetById(req.params.id);
  if (!widget) return res.status(404).send('Widget not found');
  res.render('widget-configure', { widget, user: req.user });
});

module.exports = router;
