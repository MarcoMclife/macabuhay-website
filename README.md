# themacabuhay.com

Private family site for the Macabuhay family. Hosted on **Azure Static Web Apps** (Standard), deployed by GitHub Actions on every push to `main`.

| Path | What it is |
|---|---|
| `index.html` | Public home, with the animated logo entry screen (`assets/img/macabuhay-logo.svg`) |
| `login.html` | Sign-in (email/Google via Entra External ID, or Microsoft) and access status |
| `family.html` | Members-only portal (Azure serves it to `member`/`admin` only) |
| `admin.html` | Approve/deny/add members (Azure serves it to `admin` only) |
| `assets/css/site.css` | Shared design system |
| `staticwebapp.config.json` | Sign-in providers, page roles, headers |
| `api/` | Azure Functions: `GetRoles`, `me`, `family/members`, `admin/members*` (members stored in Azure Table Storage) |
| `tools/` | Member move from Firebase, local dev server |
| `docs/AZURE-SETUP.md` | One-time Azure portal setup |

## Try it locally

```bash
cd api && npm install && npm test && cd ..
ADMIN_EMAILS=you@example.com node tools/dev-server.mjs   # http://localhost:4280 (fake sign-in, in-memory members)
```

Photos marked `STAND-IN` in the HTML are Wikimedia placeholders (credited in the footers); swap in family photos.
