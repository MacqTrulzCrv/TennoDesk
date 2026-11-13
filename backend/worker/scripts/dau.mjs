// Prints the anonymous daily-active-user counts the worker records while
// STATS_SALT is set. Identities are salted daily hashes; nothing personal is
// stored or shown. Requires the worker's admin key:
//
//   ADMIN_API_KEY=... node scripts/dau.mjs [days]
//
// WORKER_URL overrides the production worker (e.g. a wrangler dev instance).
const key = process.env.ADMIN_API_KEY;
if (!key) {
	console.error('Set ADMIN_API_KEY to the worker admin secret, then retry.');
	process.exit(1);
}
const base = (process.env.WORKER_URL || 'https://api.tennodesk.workers.dev').replace(/\/+$/, '');
const days = Math.max(1, Math.min(8, Number(process.argv[2]) || 7));

const response = await fetch(`${base}/admin/stats/active-users?days=${days}`, {
	headers: { authorization: `Bearer ${key}` },
});
if (!response.ok) {
	console.error(`HTTP ${response.status}: ${await response.text()}`);
	process.exit(1);
}
const body = await response.json();
if (!body.enabled) {
	console.log('DAU counting is off: STATS_SALT is not set on the worker.');
	process.exit(0);
}
console.log('date        users');
for (const row of body.result) {
	console.log(`${row.date}  ${String(row.users).padStart(5)}`);
}
