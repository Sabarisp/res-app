const API = 'http://localhost:4000';
async function call(token, path, opts = {}) {
  const res = await fetch(`${API}${path}`, { ...opts, headers: { ...(opts.headers || {}), ...(token ? { authorization: `Bearer ${token}` } : {}), 'content-type': 'application/json' } });
  let body = null; try { body = await res.json(); } catch { body = null; }
  return { status: res.status, body };
}
async function login(identifier, password) {
  const res = await fetch(`${API}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ identifier, password }) });
  const cookie = res.headers.get('set-cookie') || '';
  const token = cookie.match(/token=([^;]+)/)?.[1];
  if (!token) throw new Error('no token for ' + identifier);
  return token;
}
const admin = await login('admin@tavola.com', 'password123');
const order = await call(null, '/orders', { method: 'POST', body: JSON.stringify({ qrToken: 'tbl-01', idempotencyKey: 'ui-review-' + Date.now(), items: [{ menuItemId: 'seed-green-salad', quantity: 1, addonIds: [] }, { menuItemId: 'seed-hyderabadi-chicken-biryani', quantity: 1, addonIds: [] }] }) });
console.log('order', order.status, order.body?.data?.id, order.body?.data?.status);
// also create a spare coupon so the coupons table is not empty in review
const c = await call(admin, '/coupons', { method: 'POST', body: JSON.stringify({ code: 'WELCOME10', type: 'PERCENT', value: 10, minOrderValue: 200 }) });
console.log('coupon', c.status, c.body?.data?.code);
