// The menu itself comes from the server after login (session.menu), already cut down to
// the modules, screens and reports this user may open. Nothing else is ever sent to the browser.

// Screens that are built. key = feature code from the server, value = screen id used by AppShell.
export const READY_SCREENS = {
  'order.entry': 'orderEntry',
  'order.costing': 'costing',
  'order.bom': 'bom',
  'masters.buyer': 'buyer',
  'masters.season': 'season',
  'masters.currency': 'currency',
  'masters.item_group': 'itemGroup',
  'masters.item': 'item'
};
