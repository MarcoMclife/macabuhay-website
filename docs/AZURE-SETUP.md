# themacabuhay.com on Azure: one-time setup

Everything lives in the existing **The Macabuhay** tenant (themacabuhay.com, tenant ID `fe0885ef-072f-4362-819d-3fb63953823e`)
and in Azure subscription 1. Family members are **invited guests** of that tenant. They sign in with their Microsoft or Google
account, or with a one-time code emailed to them. The site is invitation only; there are no site passwords.

## 1. App registration `macabuhay-site` (Entra → App registrations)
- **Supported accounts:** *Accounts in this organizational directory only* (single tenant). Guests count as part of the directory.
- **Redirect URIs (Web):**
  - `https://www.themacabuhay.com/.auth/login/aad/callback`
  - `https://themacabuhay.com/.auth/login/aad/callback`
  - while testing: `https://<pr-preview-host>/.auth/login/aad/callback`
- **Token configuration → Add optional claim → ID → `email`**, so guests' email addresses always reach the site.
- **API permissions → Microsoft Graph → Application → `User.Invite.All` → Grant admin consent.**
  This lets the admin page email invitations. It's optional: without it, the admin page still saves the member,
  and you send the invitation from Entra (Users → Invite external user).
- **Certificates & secrets → New client secret** (24 months). Copy the **Value** for step 3.

## 2. Guest sign-in options (Entra → External Identities)
- **All identity providers → Email one-time passcode:** on (it's the default). Anyone without a Microsoft account gets a code by email.
- **Google (optional):** lets Gmail users sign in with their Google account instead of a code. Create an OAuth client in
  Google Cloud with the redirect URIs Entra shows on the Google provider page, then paste its ID and secret there.
- **External collaboration settings → Guest invite restrictions:** "Only users assigned to specific admin roles can invite" (recommended).

## 3. Static Web App settings (macabuhay-site → Settings → Environment variables)
Add to **Production**, and to the preview environment while testing:

| Name | Value |
|---|---|
| `MICROSOFT_CLIENT_ID` | Application (client) ID of `macabuhay-site` |
| `MICROSOFT_CLIENT_SECRET` | the secret Value from step 1 |
| `TENANT_ID` | `fe0885ef-072f-4362-819d-3fb63953823e` |
| `STORAGE_CONNECTION_STRING` | Storage account `macabuhaymedia` → Access keys → Connection string |
| `ADMIN_EMAILS` | `marco@themacabuhay.com, marknmacabuhay@gmail.com` (always admin) |
| `SITE_URL` | `https://www.themacabuhay.com` (link used in invitation emails) |

## 4. Move the members
Run `tools/export-firebase-users.js` in the browser on the old admin page, save the output as `tools/firebase-users.json`,
then run `tools/import-members.mjs` (instructions inside each file; do a `--dry-run` first).
Then, on the new admin page, re-add each member so they get their Entra invitation (or invite them in Entra).

## 5. Go live, then clean up after 30 days
- Merge the PR. The site switches to Azure sign-in.
- After 30 trouble-free days: delete the Firebase project and the old `macabuhay-firebase-auth` app registration.
- The unused **Macabuhay Family** External ID tenant (created then abandoned on 6 Nov 2026) can be deleted:
  Manage tenants → select it → Delete. You'll need to finish its one-time Authenticator prompt first.
