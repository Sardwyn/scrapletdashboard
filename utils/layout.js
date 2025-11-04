const PREMIUM_TYPES = ['sponsorBanner', 'customHtml', 'featuredWidget'];

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
  if (typeof value === 'boolean') return value;

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['false', '0', 'off', 'no'].includes(normalized)) return false;
    if (['true', '1', 'on', 'yes'].includes(normalized)) return true;
  }

  return Boolean(value);
}

function normalizeOrder(order) {
  const allowed = new Set(DEFAULT_SECTIONS.map(section => section.type));
  const seeded = Array.isArray(order) ? order.filter(type => allowed.has(type)) : [];
  const missing = DEFAULT_SECTIONS.map(s => s.type).filter(type => !seeded.includes(type));
  return [...seeded, ...missing];
}

function normalizeSections(sections, order) {
  const visibilityMap = new Map();
  if (Array.isArray(sections)) {
    sections.forEach(section => {
      if (section?.type) {
        visibilityMap.set(section.type, coerceVisibility(section.visible));
      }
    });
  }

  const allTypes = new Set(DEFAULT_SECTIONS.map(s => s.type));
  const orderedTypes = Array.isArray(order)
    ? order.filter(type => allTypes.has(type))
    : DEFAULT_ORDER;

  return orderedTypes.map(type => {
    const fallback = DEFAULT_SECTIONS.find(s => s.type === type);
    return {
      type,
      visible: visibilityMap.has(type)
        ? visibilityMap.get(type)
        : fallback?.visible ?? false,
      premium: PREMIUM_TYPES.includes(type)
    };
  });
}

export function ensureLayout(rawLayout) {
  let layout = parseLayout(rawLayout);
  if (!layout || typeof layout !== 'object') layout = {};

  const allTypes = layoutDefaults.DEFAULT_SECTIONS.map(s => s.type);
  const premiumTypes = ['sponsorBanner', 'customHtml', 'featuredWidget'];

  const sectionMap = new Map();
  Array.isArray(layout.sections) && layout.sections.forEach(s => {
    if (s?.type) sectionMap.set(s.type, s);
  });

  const orderedSections = allTypes.map(type => {
    const existing = sectionMap.get(type);
    return {
      type,
      visible: coerceVisibility(existing?.visible ?? false),
      premium: existing?.premium ?? premiumTypes.includes(type)
    };
  });

  layout.sections = orderedSections;

  const theme = layout.theme && typeof layout.theme === 'object' ? layout.theme : {};
  layout.theme = { ...layoutDefaults.DEFAULT_THEME, ...theme };

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

export function buildVisibilityMap(layout) {
  const visibility = {};
  if (layout && Array.isArray(layout.sections)) {
    layout.sections.forEach(section => {
      if (section?.type) {
        visibility[section.type] = coerceVisibility(section.visible) === true;
      }
    });
  }
  return visibility;
}
