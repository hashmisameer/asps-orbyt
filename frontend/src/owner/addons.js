// Small helpers shared by the owner screens that deal with add-ons and prices.

export const today = () => new Date().toLocaleDateString('en-CA');          // 'YYYY-MM-DD'
export const WARN_DAYS = 15;

export const fmtDate = (iso) => (iso ? iso.split('-').reverse().join('-') : '');
export const rupees = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
export const perShort = (per) => (per === 'year' ? '/ yr' : '/ mo');

// Whole days from today to a 'YYYY-MM-DD' date (negative = already passed)
export function daysLeft(iso) {
  if (!iso) return null;
  const a = Date.parse(`${today()}T00:00:00Z`);
  const b = Date.parse(`${iso}T00:00:00Z`);
  return Math.round((b - a) / 86400000);
}

export const LEVEL = { screen: 'Screen', report: 'Report', function: 'Function', tool: 'Top bar tool' };

// Price per month for the total, from a price and how often it is charged
export const monthly = (price, per) => (per === 'year' ? Number(price || 0) / 12 : Number(price || 0));
