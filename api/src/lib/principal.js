'use strict';

// Azure Static Web Apps injects the signed-in user as a base64 JSON header.
// The platform strips any copy a browser tries to send, so it can be trusted
// inside the managed API.

const EMAIL_CLAIMS = [
  'email',
  'emails',
  'preferred_username',
  'upn',
  'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress',
];
const NAME_CLAIMS = ['name', 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name'];

function claimValue(claims, types) {
  if (!Array.isArray(claims)) return '';
  for (const type of types) {
    const hit = claims.find((c) => (c.typ || c.type) === type && (c.val || c.value));
    if (hit) return String(hit.val || hit.value);
  }
  return '';
}

function looksLikeEmail(value) {
  return typeof value === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

/** Normalise a principal-shaped object (header or rolesSource body). */
function fromObject(p) {
  if (!p || !p.userId) return null;
  const claims = p.claims || [];
  let email = looksLikeEmail(p.userDetails) ? p.userDetails : claimValue(claims, EMAIL_CLAIMS);
  email = looksLikeEmail(email) ? email.trim().toLowerCase() : '';
  const name = claimValue(claims, NAME_CLAIMS) || (email ? email.split('@')[0] : '');
  return {
    userId: p.userId,
    provider: p.identityProvider || '',
    email,
    name,
    roles: Array.isArray(p.userRoles) ? p.userRoles : [],
  };
}

/** Read the principal from an @azure/functions v4 HttpRequest. */
function fromRequest(request) {
  const header = request.headers.get('x-ms-client-principal');
  if (!header) return null;
  try {
    return fromObject(JSON.parse(Buffer.from(header, 'base64').toString('utf8')));
  } catch {
    return null;
  }
}

module.exports = { fromObject, fromRequest, looksLikeEmail };
