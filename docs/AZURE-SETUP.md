# Moving themacabuhay.com from Firebase to Azure: portal steps

The code on the `azure-migration` branch expects the following. Do these once, in order.
Everything except step 2c is in https://portal.azure.com.

## 1. Members table
1. Storage account **macabuhaymedia** → **Access keys** → copy **Connection string** (key1).
   You'll paste it in step 4. (The API creates the `members` table by itself on first use.)

## 2. Family sign-in (email + password, Google): Microsoft Entra External ID
a. **Create the tenant.** Search *Microsoft Entra External ID* → **Create a tenant** → *External* →
   name `Macabuhay Family`, domain `macabuhayfamily`, region Asia, subscription *Azure subscription 1*,
   resource group `macabuhay-website`. Note the **Tenant ID** (a GUID) and the subdomain (`macabuhayfamily`).

b. **Switch into the new tenant**, then:
   - **App registrations → New registration**: name `macabuhay-site`, *Accounts in this organizational directory only*,
     redirect URI (Web): `https://www.themacabuhay.com/.auth/login/family/callback`.
     Also add `https://themacabuhay.com/.auth/login/family/callback`, plus the PR preview URL's
     `/.auth/login/family/callback` while testing.
   - Copy the **Application (client) ID**. **Certificates & secrets → New client secret** (24 months) → copy the **Value**.
   - **API permissions**: make sure `openid`, `profile`, `email`, `offline_access` are there → **Grant admin consent**.
   - **User flows → New user flow**: name `signup_signin`, identity providers **Email with password** (+ Google once 2c is done),
     attributes to collect: **Display Name**. Then **Applications** in the flow → add `macabuhay-site`.
   - **Company branding**: upload the Macabuhay logo (`Files/Macabuhay Animated Logo.svg` → export PNG), background colour cream `#faf7f2`.

c. **Google (optional).** In https://console.cloud.google.com → APIs & Services → Credentials → *Create OAuth client ID* (Web):
   authorized redirect URIs: copy the exact list Microsoft shows on the External ID → Google identity-provider page
   (they include `https://login.microsoftonline.com/te/<TENANT_ID>/oauth2/authresp` and several
   `https://macabuhayfamily.ciamlogin.com/<TENANT_ID>/federation/...` addresses).
   Copy the client ID/secret into External ID → **External Identities → All identity providers → Google**, then tick Google in the user flow.

d. In the repo, edit `staticwebapp.config.json` and replace `REPLACE_TENANT_SUBDOMAIN` and `REPLACE_TENANT_ID`.

## 3. Microsoft-account sign-in: reuse `macabuhay-firebase-auth`
In your **normal** directory → App registrations → `macabuhay-firebase-auth` → **Authentication**:
add Web redirect URIs `https://www.themacabuhay.com/.auth/login/aad/callback` and `https://themacabuhay.com/.auth/login/aad/callback`.
Keep *Accounts in any organizational directory and personal Microsoft accounts*.
Create a **new client secret** for the site (don't reuse Firebase's).

## 4. Static Web App settings
Static Web Apps → **macabuhay-site** → **Settings → Environment variables** (Production, and the preview environment while testing):

| Name | Value |
|---|---|
| `STORAGE_CONNECTION_STRING` | step 1 |
| `FAMILY_ID_CLIENT_ID` / `FAMILY_ID_CLIENT_SECRET` | step 2b |
| `MICROSOFT_CLIENT_ID` / `MICROSOFT_CLIENT_SECRET` | step 3 |
| `ADMIN_EMAILS` | `marco@themacabuhay.com, marknmacabuhay@gmail.com` (these are always admin; you can't lock yourself out) |

## 5. Move the members
Run `tools/export-firebase-users.js` in the browser on the old admin page, save as `tools/firebase-users.json`, then run
`tools/import-members.mjs` (instructions inside each file). Do a `--dry-run` first.

## 6. Go live, then clean up after 30 days
- Merge the PR → the site switches to Azure sign-in. Family members who used email + password register again once (same email, it keeps their approval).
- After 30 trouble-free days: delete the Firebase project, and remove the old `…firebaseapp.com/__/auth/handler` redirect URI and old secret from `macabuhay-firebase-auth`.
