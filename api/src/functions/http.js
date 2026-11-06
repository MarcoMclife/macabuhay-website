'use strict';

const { app } = require('@azure/functions');
const principal = require('../lib/principal');
const members = require('../lib/members');
const { defaultStore } = require('../lib/store');

const json = (status, body) => ({
  status,
  jsonBody: body,
  headers: { 'Cache-Control': 'no-store' },
});

/**
 * Wrap a handler with sign-in and role checks. Routes in
 * staticwebapp.config.json already block these, this is a second lock.
 */
function guarded(requiredRole, handler) {
  return async (request, context) => {
    const user = principal.fromRequest(request);
    if (!user) return json(401, { error: 'Sign in first.' });
    if (requiredRole && !user.roles.includes(requiredRole)) return json(403, { error: 'Not allowed.' });
    try {
      return await handler(request, user, defaultStore(), context);
    } catch (e) {
      if (e instanceof members.RuleError) return json(e.status, { error: e.message });
      context.error(e);
      return json(500, { error: 'Something went wrong. Please try again.' });
    }
  };
}

// Static Web Apps calls this at every sign-in to decide the user's roles.
app.http('GetRoles', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'GetRoles',
  handler: async (request, context) => {
    try {
      const body = await request.json();
      const user = principal.fromObject(body);
      const roles = user ? await members.rolesFor(defaultStore(), user.email) : [];
      return { jsonBody: { roles } };
    } catch (e) {
      context.error(e);
      return { jsonBody: { roles: [] } };
    }
  },
});

app.http('me', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'me',
  handler: guarded(null, async (_req, user, store) => {
    const m = await members.touch(store, user);
    return json(200, {
      email: m.email,
      name: m.name,
      role: m.role,
      provider: user.provider,
      // Roles are fixed at sign-in; if an admin approved the user since,
      // the page must send them through sign-in once more to pick them up.
      sessionRoles: user.roles,
    });
  }),
});

app.http('familyMembers', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'family/members',
  handler: guarded('member', async (_req, _user, store) => json(200, await members.familyList(store))),
});

app.http('adminMembersList', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'admin/members',
  handler: guarded('admin', async (_req, _user, store) => json(200, await members.adminList(store))),
});

app.http('adminMembersAdd', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'admin/members/add',
  handler: guarded('admin', async (req, user, store) => {
    const body = await req.json().catch(() => ({}));
    return json(200, await members.addMember(store, user.email, body.email, body.role, body.name));
  }),
});

app.http('adminMembersSetRole', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'admin/members/role',
  handler: guarded('admin', async (req, user, store) => {
    const body = await req.json().catch(() => ({}));
    return json(200, await members.setRole(store, user.email, body.email, body.role));
  }),
});
