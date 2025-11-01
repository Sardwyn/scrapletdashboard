export const widgets = [
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
  {
    id: 'donation',
    name: 'Donation Tracker',
    icon: '💰',
    description: 'Displays recent donations and goals',
    configSchema: {
      fields: [
        { name: 'goalAmount', type: 'text', label: 'Donation Goal' },
        { name: 'showRecent', type: 'select', label: 'Show Recent Donations', options: ['yes', 'no'] }
      ]
    }
  },
  {
    id: 'stats',
    name: 'Stream Stats',
    icon: '📊',
    description: 'Live viewer count and engagement',
    configSchema: {
      fields: [
        { name: 'showViewers', type: 'select', label: 'Show Viewer Count', options: ['yes', 'no'] },
        { name: 'style', type: 'select', label: 'Style', options: ['minimal', 'graph', 'compact'] }
      ]
    }
  }
];

export function getWidgetById(id) {
  return widgets.find(w => w.id === id);
}


export const overlays = [
  {
    id: 'overlay-1',
    name: 'Intro Splash',
    description: 'Animated intro overlay for stream start',
    status: 'installed',
    icon: '🎬'
  },
  {
    id: 'overlay-2',
    name: 'Break Screen',
    description: 'AFK overlay with music and countdown',
    status: 'unlocked',
    icon: '⏸️'
  },
  {
    id: 'overlay-3',
    name: 'End Credits',
    description: 'Outro overlay with supporter names',
    status: 'locked',
    icon: '🎞️'
  }
];
