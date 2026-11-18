export const WAREHOUSE_COORDS = [6.9585, 79.8845]; // Peliyagoda Central Hub, Colombo

const COLOMBO_03 = [6.9022, 79.8518]; // Kollupitiya / Galle Road

// Escapes text before it is placed inside Leaflet popup HTML (popups render markup, not text).
export const escapeHtml = (value) =>
  String(value ?? '').replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[ch]));

// First matching rule wins. Patterns use word boundaries so "Colombo 15" is not read as "Colombo 1",
// and "Galle Road" (a Colombo street) is not read as the city of Galle.
const DESTINATION_RULES = [
  { pattern: /\b(kandy|peradeniya)\b/, coords: [7.2906, 80.6337] },
  { pattern: /\b(galle(?!\s+(?:road|rd|face))|rampart)\b/, coords: [6.0535, 80.221] },
  { pattern: /\b(bambalapitiya|bauddhaloka)\b|\bcolombo\s*0?4\b/, coords: [6.8905, 79.8587] },
  { pattern: /\b(cinnamon|ward place)\b|\bcolombo\s*0?7\b/, coords: [6.908, 79.869] },
  { pattern: /\b(fort|pettah)\b|\bcolombo\s*0?1\b/, coords: [6.9344, 79.8428] },
  { pattern: /\b(nugegoda|high level)\b/, coords: [6.8649, 79.8997] },
  { pattern: /\b(dehiwala|mount lavinia)\b/, coords: [6.8301, 79.8801] },
];

export const resolveDestinationCoords = (address = '', city = '') => {
  const text = `${address ?? ''} ${city ?? ''}`.toLowerCase();
  const rule = DESTINATION_RULES.find(({ pattern }) => pattern.test(text));
  return rule ? rule.coords : COLOMBO_03;
};
