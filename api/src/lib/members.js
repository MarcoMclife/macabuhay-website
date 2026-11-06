'use strict';

// Business rules for family access. Pure functions over a store, so they can
// be unit tested without Azure.

const { looksLikeEmail } = require('./principal');

const ROLES = ['pending', 'member', 'admin', 'denied'];
const SITE_ROLES = { member: ['member'], admin: ['admin', 'member'] };

function bootstrapAdmins() {
  return (process.env.ADMIN_EMAILS || '')
    .split(/[,;\s]+/)
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

/** Roles Static Web Apps should attach at sign-in (rolesSource). */
async function rolesFor(store, email) {
  if (!email) return [];
  if (bootstrapAdmins().includes(email)) return SITE_ROLES.admin;
  const m = await store.get(email);
  return (m && SITE_ROLES[m.role]) || [];
}

/**
 * Called by /api/me on every visit to the login page. Creates a pending
 * access request the first time someone signs in.
 */
async function touch(store, principal, now = new Date().toISOString()) {
  const { email, name, provider } = principal;
  if (!email) return { email: '', name, role: 'no-email' };
  const existing = await store.get(email);
  const isBootstrap = bootstrapAdmins().includes(email);
  const role = isBootstrap ? 'admin' : existing ? existing.role : 'pending';
  const saved = await store.upsert({
    email,
    role,
    name: (existing && existing.name) || name,
    provider,
    lastLoginAt: now,
    createdAt: (existing && existing.createdAt) || now,
    preRegistered: false, // a pre-approved address is "claimed" on first sign-in
  });
  return saved;
}

class RuleError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

function normaliseEmail(raw) {
  const email = String(raw || '').trim().toLowerCase();
  if (!looksLikeEmail(email) || /[\/\\#?]/.test(email)) throw new RuleError(400, 'Enter a valid email address.');
  return email;
}

function checkRole(role) {
  if (!ROLES.includes(role)) throw new RuleError(400, `Role must be one of: ${ROLES.join(', ')}.`);
}

async function setRole(store, actorEmail, rawEmail, role) {
  const email = normaliseEmail(rawEmail);
  checkRole(role);
  if (email === actorEmail) throw new RuleError(400, "You can't change your own role.");
  if (bootstrapAdmins().includes(email) && role !== 'admin') {
    throw new RuleError(400, 'This address is a built-in administrator (ADMIN_EMAILS setting).');
  }
  const existing = await store.get(email);
  if (!existing) throw new RuleError(404, 'No such member.');
  return store.upsert({ email, role });
}

async function addMember(store, actorEmail, rawEmail, role, name) {
  const email = normaliseEmail(rawEmail);
  checkRole(role);
  if (email === actorEmail) throw new RuleError(400, "You can't change your own role.");
  const existing = await store.get(email);
  if (existing) return store.upsert({ email, role, name: name || existing.name });
  return store.upsert({
    email,
    role,
    name: name || '',
    createdAt: new Date().toISOString(),
    preRegistered: true,
  });
}

/** What other members may see about each other. */
function publicCard(m) {
  return { name: m.name || m.email.split('@')[0], email: m.email, role: m.role };
}

async function familyList(store) {
  const all = await store.list();
  return all
    .filter((m) => m.role === 'member' || m.role === 'admin')
    .map(publicCard)
    .sort((a, b) => a.name.localeCompare(b.name));
}

async function adminList(store) {
  const all = await store.list();
  return all.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
}

module.exports = { ROLES, rolesFor, touch, setRole, addMember, familyList, adminList, RuleError, bootstrapAdmins };
