// The full ORBYT menu. Each module only shows if it is switched on for the company.
// Items listed in READY_SCREENS are built and open as a tab; the rest show "soon".
export const MENU = [
  { code: 'masters', name: 'Masters', groups: [
    { title: 'Party', items: ['Party master'] },
    { title: 'Item', items: ['Item master', 'Item group', 'Product category', 'Unit of measure (UOM)', 'Brand'] },
    { title: 'Order setup', items: ['Style', 'Size range', 'Colour'] },
    { title: 'Location', items: ['Company and units', 'Warehouse / location'] },
    { title: 'Tax and terms', items: ['Tax / HSN', 'Payment terms', 'Delivery terms', 'Currency'] }
  ] },
  { code: 'order', name: 'Order', groups: [
    { title: 'Transactions', items: ['Order entry'] },
    { title: 'Reports', items: ['Order register', 'Pending orders'] }
  ] },
  { code: 'purchase', name: 'Purchase', groups: [
    { title: 'Transactions', items: ['Indent', 'Purchase order', 'GRN', 'Purchase return'] },
    { title: 'Reports', items: ['Purchase register', 'Pending PO report'] }
  ] },
  { code: 'inventory', name: 'Inventory', groups: [
    { title: 'Transactions', items: ['Material issue', 'Material return', 'Stock transfer'] },
    { title: 'Reports', items: ['Stock ledger', 'Stock summary'] }
  ] },
  { code: 'production', name: 'Production', groups: [
    { title: 'Transactions', items: ['Production entry'] }
  ] },
  { code: 'finance', name: 'Finance', groups: [
    { title: 'Transactions', items: ['Purchase bill', 'Payment', 'Receipt'] },
    { title: 'Reports', items: ['Ledger', 'GST register'] }
  ] },
  { code: 'admin', name: 'Admin', groups: [
    { title: 'Users and access', items: ['Users', 'Roles and permissions', 'Modules on / off'] },
    { title: 'Settings', items: ['Company settings', 'Number series'] }
  ] }
];

// Screens that are built. key = menu item name, value = screen id used by AppShell.
export const READY_SCREENS = {
  'Order entry': 'orderEntry'
};
