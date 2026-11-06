'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { memoryStore } = require('../src/lib/store');
const members = require('../src/lib/members');
const principal = require('../src/lib/principal');

const ADMIN = 'marco@themacabuhay.com';
process.env.ADMIN_EMAILS = `${ADMIN}, marknmacabuhay@gmail.com`;

const who = (email, extra = {}) => ({ userId: 'u-' + email, email, name: 'Tita Ana', provider: 'family', roles: [], ...extra });

test('principal: reads email from userDetails or claims, lowercased', () => {
  assert.equal(principal.fromObject({ userId: '1', userDetails: 'Ana@Example.com' }).email, 'ana@example.com');
  const viaClaim = principal.fromObject({
    userId: '2', userDetails: 'Ana Reyes',
    claims: [{ typ: 'name', val: 'Ana Reyes' }, { typ: 'emails', val: 'ANA@x.ph' }],
  });
  assert.equal(viaClaim.email, 'ana@x.ph');
  assert.equal(viaClaim.name, 'Ana Reyes');
  assert.equal(principal.fromObject({ userId: '3', userDetails: 'no-email' }).email, '');
  assert.equal(principal.fromObject(null), null);
});

test('principal: decodes the x-ms-client-principal header', () => {
  const p = { identityProvider: 'aad', userId: 'abc', userDetails: 'a@b.co', userRoles: ['anonymous', 'authenticated', 'member'] };
  const headers = new Map([['x-ms-client-principal', Buffer.from(JSON.stringify(p)).toString('base64')]]);
  const user = principal.fromRequest({ headers });
  assert.equal(user.email, 'a@b.co');
  assert.deepEqual(user.roles, p.userRoles);
  assert.equal(principal.fromRequest({ headers: new Map() }), null);
});

test('first sign-in creates a pending request with no site roles', async () => {
  const store = memoryStore();
  const m = await members.touch(store, who('ana@x.ph'));
  assert.equal(m.role, 'pending');
  assert.deepEqual(await members.rolesFor(store, 'ana@x.ph'), []);
});

test('bootstrap admins are always admin, even with no row', async () => {
  const store = memoryStore();
  assert.deepEqual(await members.rolesFor(store, ADMIN), ['admin', 'member']);
  assert.equal((await members.touch(store, who(ADMIN))).role, 'admin');
});

test('approve -> member roles; deny -> none', async () => {
  const store = memoryStore();
  await members.touch(store, who('ana@x.ph'));
  await members.setRole(store, ADMIN, 'ana@x.ph', 'member');
  assert.deepEqual(await members.rolesFor(store, 'ana@x.ph'), ['member']);
  await members.setRole(store, ADMIN, 'ANA@x.ph', 'denied');
  assert.deepEqual(await members.rolesFor(store, 'ana@x.ph'), []);
});

test('admins cannot change themselves, bootstrap admins, unknown users or bad roles', async () => {
  const store = memoryStore([{ email: 'ana@x.ph', role: 'pending' }]);
  await assert.rejects(members.setRole(store, ADMIN, ADMIN, 'denied'), /own role/);
  await assert.rejects(members.setRole(store, 'other@x.ph', 'marknmacabuhay@gmail.com', 'denied'), /built-in/);
  await assert.rejects(members.setRole(store, ADMIN, 'nobody@x.ph', 'member'), { status: 404 });
  await assert.rejects(members.setRole(store, ADMIN, 'ana@x.ph', 'owner'), { status: 400 });
  await assert.rejects(members.addMember(store, ADMIN, 'not-an-email', 'member'), { status: 400 });
});

test('pre-approved address keeps its role on first sign-in', async () => {
  const store = memoryStore();
  const added = await members.addMember(store, ADMIN, ' Lolo@X.ph ', 'member', 'Lolo Ben');
  assert.equal(added.email, 'lolo@x.ph');
  assert.equal(added.preRegistered, true);
  const m = await members.touch(store, who('lolo@x.ph', { name: 'Benjamin' }));
  assert.equal(m.role, 'member');
  assert.equal(m.name, 'Lolo Ben');
  assert.equal(m.preRegistered, false);
});

test('family list shows only approved members, sorted, without login metadata', async () => {
  const store = memoryStore([
    { email: 'z@x.ph', role: 'member', name: 'Zeny', lastLoginAt: 't' },
    { email: 'p@x.ph', role: 'pending', name: 'Pending Pete' },
    { email: 'a@x.ph', role: 'admin', name: 'Ana' },
    { email: 'd@x.ph', role: 'denied', name: 'Denied Dan' },
  ]);
  const list = await members.familyList(store);
  assert.deepEqual(list.map((m) => m.name), ['Ana', 'Zeny']);
  assert.equal(list[0].lastLoginAt, undefined);
});

test('invite: not configured -> reports so without calling Graph', async () => {
  const { inviteGuest } = require('../src/lib/invite');
  let called = false;
  const r = await inviteGuest({ email: 'a@x.ph' }, { env: {}, fetchImpl: async () => { called = true; } });
  assert.deepEqual(r, { sent: false, reason: 'not-configured' });
  assert.equal(called, false);
});

test('invite: gets a Graph token, then posts the invitation to the site login page', async () => {
  const { inviteGuest } = require('../src/lib/invite');
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    if (url.includes('/oauth2/')) return { ok: true, status: 200, json: async () => ({ access_token: 'tok' }) };
    return { ok: true, status: 201, json: async () => ({ inviteRedeemUrl: 'https://login/redeem' }) };
  };
  const env = { TENANT_ID: 't', MICROSOFT_CLIENT_ID: 'c', MICROSOFT_CLIENT_SECRET: 's' };
  const r = await inviteGuest({ email: 'ana@x.ph', name: 'Ana' }, { env, fetchImpl });
  assert.equal(r.sent, true);
  assert.match(calls[0].url, /login\.microsoftonline\.com\/t\/oauth2\/v2\.0\/token/);
  assert.equal(calls[1].url, 'https://graph.microsoft.com/v1.0/invitations');
  assert.equal(calls[1].init.headers.Authorization, 'Bearer tok');
  const body = JSON.parse(calls[1].init.body);
  assert.equal(body.invitedUserEmailAddress, 'ana@x.ph');
  assert.equal(body.inviteRedirectUrl, 'https://www.themacabuhay.com/login.html');
  assert.equal(body.sendInvitationMessage, true);
});

test('invite: a Graph error becomes a readable message', async () => {
  const { inviteGuest } = require('../src/lib/invite');
  const fetchImpl = async (url) => url.includes('/oauth2/')
    ? { ok: true, status: 200, json: async () => ({ access_token: 'tok' }) }
    : { ok: false, status: 403, json: async () => ({ error: { message: 'Insufficient privileges' } }) };
  const env = { TENANT_ID: 't', MICROSOFT_CLIENT_ID: 'c', MICROSOFT_CLIENT_SECRET: 's' };
  await assert.rejects(inviteGuest({ email: 'a@x.ph' }, { env, fetchImpl }), /Insufficient privileges/);
});
