'use strict';

// Sends a Microsoft Entra guest invitation so a relative can sign in to the
// themacabuhay.com tenant (with their Microsoft or Google account, or a
// one-time code emailed to them). Uses Microsoft Graph with the site's own
// app registration; needs the application permission User.Invite.All with
// admin consent. Without those settings it reports "not-configured" and the
// admin can invite from the Entra portal instead.

const SETTINGS = ['TENANT_ID', 'MICROSOFT_CLIENT_ID', 'MICROSOFT_CLIENT_SECRET'];

function configured(env = process.env) {
  return SETTINGS.every((k) => env[k]);
}

async function graphToken(env, fetchImpl) {
  const res = await fetchImpl(`https://login.microsoftonline.com/${env.TENANT_ID}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.MICROSOFT_CLIENT_ID,
      client_secret: env.MICROSOFT_CLIENT_SECRET,
      scope: 'https://graph.microsoft.com/.default',
      grant_type: 'client_credentials',
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.access_token) throw new Error(`Graph sign-in failed (${res.status}): ${data.error_description || data.error || 'no token'}`);
  return data.access_token;
}

/**
 * @returns {Promise<{sent: boolean, reason?: string, redeemUrl?: string}>}
 */
async function inviteGuest({ email, name }, { env = process.env, fetchImpl = fetch } = {}) {
  if (!configured(env)) return { sent: false, reason: 'not-configured' };
  const token = await graphToken(env, fetchImpl);
  const site = (env.SITE_URL || 'https://www.themacabuhay.com').replace(/\/$/, '');
  const res = await fetchImpl('https://graph.microsoft.com/v1.0/invitations', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      invitedUserEmailAddress: email,
      invitedUserDisplayName: name || undefined,
      inviteRedirectUrl: `${site}/login.html`,
      sendInvitationMessage: true,
      invitedUserMessageInfo: {
        customizedMessageBody:
          'You have been invited to the Macabuhay family website. Accept this invitation, then sign in at ' +
          `${site} with this email address. Our strength is our family.`,
      },
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = (data.error && data.error.message) || `status ${res.status}`;
    throw new Error(`The invitation email could not be sent: ${msg}`);
  }
  return { sent: true, redeemUrl: data.inviteRedeemUrl };
}

module.exports = { inviteGuest, configured };
