# DDU-GKY Recruitment Portal — Gmail API delivery on Railway Hobby

This update keeps sending email from `info@drbiswas.co.in`, but uses Google's **Gmail API over HTTPS** rather than SMTP. Railway Hobby blocks outbound SMTP. You **do not** need Resend, and you do not need to change the React frontend or MongoDB.

## Files in this ZIP
- `backend/mail.js` — selects Gmail API when `EMAIL_PROVIDER=gmail_api`, preserving all existing templates, PDFs, and local SMTP fallback.
- `backend/gmailApi.js` — exchanges the refresh token for a short-lived access token, builds MIME HTML/PDF messages using Nodemailer's stream transport (without an SMTP connection), and posts Gmail API messages over HTTPS.
- `backend/.env.example` — sample variable names only; keep secrets in Railway Variables.
- `backend/tests/gmailApi.test.js` — mocked-network transport tests.

**Before replacing `backend/mail.js`, back up any custom changes made since your last Railway backend runtime fix.** This file is based on the latest previously supplied backend runtime fix.

## Part A — Google Cloud Console (once)
1. Open https://console.cloud.google.com and create/select a Google Cloud project owned by your organization.
2. Open **APIs & Services > Library**, find **Gmail API**, and choose **Enable**.
3. Open **Google Auth Platform** (or **APIs & Services > OAuth consent screen**).
   - If the project belongs to your Google Workspace organization and the authorized sender is in that organization, choose **Internal**, if available.
   - Otherwise choose **External**; add the sender account as a **Test user** while configuring, and follow any Google requirements for production verification.
   - Add only the scope `https://www.googleapis.com/auth/gmail.send` (no read/delete permissions).
4. In **Clients / Credentials**, create an **OAuth client ID**, application type **Web application**.
5. Add this *exact* **Authorized redirect URI**: `https://developers.google.com/oauthplayground`.
6. Save the OAuth **Client ID** and **Client Secret** privately. Do not place them in frontend env variables or GitHub.

## Part B — Obtain the one-time refresh token (once)
1. Open https://developers.google.com/oauthplayground
2. Click the gear/settings icon at the top-right.
3. Check **Use your own OAuth credentials** and enter the OAuth **Client ID** and **Client Secret** from the Google Cloud project.
4. Set **OAuth flow = Server-side**, **Access type = Offline**, and **Force prompt = Consent Screen**, then close settings.
5. Under **Step 1**, enter this scope in the custom scope field: `https://www.googleapis.com/auth/gmail.send`.
6. Click **Authorize APIs**. Sign in as the *actual sending account*, `info@drbiswas.co.in`, or the Workspace account with an authorized Gmail send-as alias. Approve sending permissions.
7. Under **Step 2**, click **Exchange authorization code for tokens**. Copy the **Refresh token**, not the temporary Access token. Keep it secret.
8. **Important:** Google's OAuth Playground revokes *its own default-client tokens* after 24 hours; using **your own OAuth credentials** avoids that default-client behavior.

**Token lifetime:** An External OAuth app still in **Testing** issues a Gmail refresh token that normally expires after **7 days**. For a reliable live recruitment website, choose an eligible Workspace **Internal** app or move an External app to **In production** and complete Google verification if required for the `gmail.send` sensitive scope. Never assume a test token will last indefinitely.

## Part C — Railway backend service variables
Open **Railway > application-portal backend service > Variables** and add:

```env
EMAIL_PROVIDER=gmail_api
GMAIL_CLIENT_ID=YOUR_GOOGLE_OAUTH_WEB_CLIENT_ID
GMAIL_CLIENT_SECRET=YOUR_GOOGLE_OAUTH_CLIENT_SECRET
GMAIL_REFRESH_TOKEN=YOUR_REFRESH_TOKEN
GMAIL_FROM=info@drbiswas.co.in
NODE_ENV=production
```

Keep the existing `MONGO_URI`, `JWT_SECRET`, `OTP_PEPPER`, `CLIENT_URL` variables unchanged.

Your old `SMTP_HOST`, `SMTP_PORT`, `SMTP_PASS`, etc. are **not used** while `EMAIL_PROVIDER=gmail_api`. Remove or retain them as appropriate, but revoke the previously exposed App Password. Do not add these OAuth secrets to `VITE_*` frontend variables.

Use a real Gmail/Google Workspace account as `GMAIL_FROM`—usually the account that granted consent. If it's a send-as alias, that alias must already be authorized and configured in Gmail.

## Part D — Install updated backend files and push
Extract this ZIP into your local repo root, merging the `backend` directory.

Windows CMD:

```cmd
cd /d "E:\Subrata\Projects\Application Portal"
git add backend/mail.js backend/gmailApi.js backend/tests/gmailApi.test.js GMAIL_API_RAILWAY_SETUP.md
git status
git commit -m "Use Gmail API HTTPS for Railway Hobby email delivery"
git push origin main
```

`backend/.env.example` is optional documentation and may be ignored by your current `.gitignore` rule. Don't stage your real `backend/.env`.

Railway should rebuild the backend automatically if GitHub auto-deployment is enabled; otherwise redeploy manually. No frontend deployment is required.

## Part E — Test
1. Verify Railway backend `/api/health` responds successfully.
2. Register a **new test candidate** with a real email address and check whether OTP arrives.
3. For an existing candidate record created during an SMTP timeout, click **Resend OTP** rather than registering again.
4. Test password reset and application acknowledgement.
5. Issue a test interview call with PDF attachment. Confirm the email, PDF filename and attachment content.

## Typical errors
- **`invalid_grant`** — refresh token expired, revoked or generated while External OAuth app was in Testing; regenerate after fixing OAuth publishing status.
- **`403 PERMISSION_DENIED`** — Gmail API disabled, the wrong scope was granted, or the Workspace admin restricted API access.
- **`401 UNAUTHENTICATED`** — token/consent issue.
- **Wrong From address** — OAuth consent was granted from a different mailbox; use the authorized sender or set up a verified Gmail send-as alias.
- **No message arrives** — check candidate spam folder, Railway backend logs, and Gmail account's Sent folder.

## Security
The sender's OAuth client secret and refresh token provide significant access to send email. Store them as Railway backend secrets only; never print or email them, place them in screenshots, Git, or share them in chat. Revoke the previously exposed MongoDB and Gmail credentials.
