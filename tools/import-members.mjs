// STEP 2 of the member move: load firebase-users.json into the Azure "members" table.
//
//   cd api && npm install && cd ..
//   STORAGE_CONNECTION_STRING="<from Azure portal: macabuhaymedia > Access keys>" \
//     node tools/import-members.mjs tools/firebase-users.json
//
// Safe to run twice: rows are keyed by email and merged.
// Add --dry-run to see what would be written without writing.

import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { tableStore } = require('../api/src/lib/store.js');

const file = process.argv[2];
const dryRun = process.argv.includes('--dry-run');
if (!file) {
  console.error('Usage: node tools/import-members.mjs <firebase-users.json> [--dry-run]');
  process.exit(1);
}

const ROLES = new Set(['pending', 'member', 'admin', 'denied']);
const rows = JSON.parse(readFileSync(file, 'utf8'));
const byEmail = new Map();
for (const r of rows) {
  const email = String(r.email || '').trim().toLowerCase();
  if (!email.includes('@')) continue;
  const role = ROLES.has(r.role) ? r.role : 'pending';
  const prev = byEmail.get(email);
  // If the same email had two Firebase accounts, keep the stronger role.
  const rank = { denied: 0, pending: 1, member: 2, admin: 3 };
  if (!prev || rank[role] > rank[prev.role]) {
    byEmail.set(email, { email, role, name: r.name || (prev && prev.name) || '', createdAt: r.createdAt || new Date().toISOString(), preRegistered: true });
  }
}

console.table([...byEmail.values()].map(({ email, role, name }) => ({ email, role, name })));
if (dryRun) {
  console.log(`Dry run: ${byEmail.size} members would be written.`);
  process.exit(0);
}

const store = tableStore();
for (const m of byEmail.values()) await store.upsert(m);
console.log(`Imported ${byEmail.size} members into the "members" table.`);
