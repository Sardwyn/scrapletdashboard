const DEFAULT_SECTIONS = [
  { type: 'avatar', visible: true },
  { type: 'bio', visible: true },
  { type: 'socialLinks', visible: true },
  { type: 'stats', visible: true },
  { type: 'featuredWidget', visible: false },
  { type: 'sponsorBanner', visible: false },
  { type: 'customHtml', visible: false }
];

const DEFAULT_THEME = { color: 'dark', font: 'sans', layout: 'stacked' };
const DEFAULT_ORDER = ['avatar', 'bio', 'socialLinks', 'stats'];

function parseLayout(layout) {
  if (layout && typeof layout === 'string') {
    try {
      return JSON.parse(layout);
    } catch (err) {
      console.warn('Failed to parse layout JSON, falling back to defaults', err);
      return {};
    }
  }
  return layout;
}

function coerceVisibility(value) {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['false', '0', 'off', 'no'].includes(normalized)) {
      return false;
    }
    if (['true', '1', 'on', 'yes'].includes(normalized)) {
      return true;
    }
  }

  return Boolean(value);
}

function normalizeSections(sections) {
  const map = new Map();
  if (Array.isArray(sections)) {
    sections.forEach(section => {
      if (section && typeof section.type === 'string') {
        map.set(section.type, {
          type: section.type,
          visible: coerceVisibility(section.visible)
        });
      }
    });
  }

  return DEFAULT_SECTIONS.map(defaultSection => {
    const override = map.get(defaultSection.type);
    if (override) {
      return {
        type: defaultSection.type,
        visible: override.visible
      };
    }
    return { ...defaultSection };
  });
}

function normalizeOrder(order) {
  const allowed = new Set(DEFAULT_SECTIONS.map(section => section.type));
  const seeded = Array.isArray(order) ? order.filter(type => allowed.has(type)) : [];
  const merged = [...new Set([...seeded, ...DEFAULT_ORDER])];
  return merged;
}

export function ensureLayout(rawLayout) {
  let layout = parseLayout(rawLayout);

  if (!layout || typeof layout !== 'object') {
    layout = {};
  }

  layout.sections = normalizeSections(layout.sections);

  const theme = layout.theme && typeof layout.theme === 'object' ? layout.theme : {};
  layout.theme = {
    ...DEFAULT_THEME,
    ...theme
  };

  layout.order = normalizeOrder(layout.order);

  if (typeof layout.showButtonIcons !== 'boolean') {
    layout.showButtonIcons = true;
  }

  return layout;
}

export const layoutDefaults = {
  DEFAULT_SECTIONS,
  DEFAULT_THEME,
  DEFAULT_ORDER
};
