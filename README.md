# CV Tailor AI

A mobile-first web app that turns your master CV plus a job description into a tailored, ATS-friendly CV for any kind of job you can preview, edit and download as a PDF from your phone.

**Workflow:** upload your CV (PDF or DOCX) or type it in → review and save your master CV → paste a job description → **Tailor My CV** → preview, edit, tell the AI what to change, check the job-match analysis → download the PDF → save the version to your history.

Three things shape the result:

- **Your CV structure.** On the Master CV page, upload a CV or template laid out the way you like. Its section order and heading names are applied to every new CV (its fonts and graphics are not copied). You can also reorder, rename and hide sections by hand, per CV or as your default.
- **A sample CV in the chat.** In the Ask AI tab, tap "Attach a sample CV" (PDF or DOCX). Your CV is put in its manner: section order, heading names and writing style. Nothing factual is copied from it, and the usual fact checks still apply.
- **Instructions to the AI.** Before generating, add guidance on the Tailor form. Afterwards, use the "Tell the AI what to change" box on the CV screen ("make the summary shorter", "put education first", "I used Kafka at my current job for event streaming, add it").
- **Closing gaps truthfully.** The Job match tab lists what the job wants that your CV does not show. Tap one, tell the AI where you really used it, and it is added and the score re-estimated. A score of 100 is reachable only when your real experience covers every requirement; the app will not invent experience to get there.

The app tailors what is true. It never adds employers, dates, qualifications, figures or skills that are not in your master CV (see [How truthfulness is enforced](#how-truthfulness-is-enforced)).

## Contents

- [What is included](#what-is-included)
- [Run it locally](#run-it-locally)
- [Environment variables](#environment-variables)
- [Deploy: MongoDB Atlas + Render](#deploy-mongodb-atlas--render)
- [How truthfulness is enforced](#how-truthfulness-is-enforced)
- [Security and privacy](#security-and-privacy)
- [Tests](#tests)
- [Limitations and manual steps](#limitations-and-manual-steps)
- [Troubleshooting](#troubleshooting)
- [Project layout](#project-layout)

## What is included

| Area | Details |
| --- | --- |
| Frontend | React 19, Vite, TypeScript, Tailwind CSS 4. Installable PWA (manifest + service worker). |
| Backend | Node.js, Express 5, TypeScript. Serves the API and the built frontend from one origin. |
| Database | MongoDB (Atlas in production) through Mongoose. |
| AI | Any OpenAI-compatible `chat/completions` API, configured by environment variables. Replies are JSON validated with zod. |
| Documents | `mammoth` (DOCX) and `unpdf` (PDF) for text extraction; `pdfkit` for PDF output with real, selectable text. |
| Auth | The owner signs in with `APP_PASSWORD`; friends join with invite codes and sign in with email and password (scrypt-hashed). Signed session tokens (7 days), rate-limited. |
| Files | PDF (four designs) and Word (.docx) for CVs and cover letters, via `pdfkit` and `docx`. |

Pages: Dashboard, Master CV, Tailor, CV result (Preview / Ask AI / Match / Edit / More), Applications, Settings, and a public page for shared CVs.

## Features

- **Tailoring** from a master CV to any job advert, any industry, with server-side fact checks.
- **Job match** as a requirement checklist (met / partly / not shown) with a computed score, and "Raise your score" for adding real experience.
- **Ask AI**: free-text instructions, pasting a different job advert, or attaching a sample CV to copy its structure and writing style.
- **Cover letter** in a chosen tone, editable, as PDF or Word.
- **Interview prep**: likely questions with suggested answers from your own experience, honest advice for gaps, and questions to ask.
- **LinkedIn** headline, About section and skills from the master CV.
- **Four PDF designs** (Professional, Modern, Classic, Compact), a live page count, and **Fit on one page**.
- **Word (.docx) download** of the CV.
- **Application tracker**: status (applied, interview, offer, rejected, withdrawn), date and notes per CV, with totals on the dashboard.
- **Share by link**: a read-only page for a saved CV that anyone can open without an account; it can be switched off at any time. The job advert, match and notes are never shown.
- **Accounts for friends**: invite codes, private data per person, a daily AI allowance per person, and owner tools to switch people off or delete them.
- **Busy AI handling**: backup models on the server, two automatic retries in the app, and a notification or vibration when a long task finishes.

**Demo mode.** With no `AI_API_KEY`, the app still works end to end, but no AI is involved: uploaded CVs are read by a basic rule-based parser, and "tailoring" only reorders your own wording by keyword overlap. Everything produced this way is labelled as demo output in the app. It is never presented as AI-generated.

## Run it locally

Requires Node.js 20.12 or newer (22 recommended).

```bash
npm install
cp .env.example .env        # optional: without it the app runs in demo mode
```

For a quick local start you can leave `.env` out entirely. The server then:

- uses a temporary in-memory MongoDB (data disappears on restart; the first start downloads a MongoDB binary, which can take a minute),
- signs you in with the password `dev-password`,
- runs in demo mode.

To use real services locally, set `MONGODB_URI`, `APP_PASSWORD`, `JWT_SECRET` and `AI_API_KEY` in `.env`. Any `<placeholder>` value you leave untouched is treated as not set.

Development, two terminals:

```bash
npm run dev:server     # API on http://localhost:4000
npm run dev:client     # app on http://localhost:5173 (proxies /api to the server)
```

Production build, one process:

```bash
npm run build
npm start              # app and API on http://localhost:4000
```

Other commands: `npm test` (backend test suite), `npm run typecheck`.

## Environment variables

All secrets live on the server. Nothing secret is compiled into the frontend. See [.env.example](.env.example) for a commented template.

| Variable | Required | Purpose |
| --- | --- | --- |
| `NODE_ENV` | production | Set to `production` on Render. The server refuses to start in production without the three variables below. |
| `MONGODB_URI` | production | MongoDB Atlas connection string. |
| `APP_PASSWORD` | production | The password you sign in with. Minimum 10 characters. |
| `JWT_SECRET` | production | Random string, minimum 32 characters, used to sign session tokens. |
| `AI_API_KEY` | for real AI | API key for the AI provider. Empty means demo mode. |
| `AI_BASE_URL` | no | OpenAI-compatible base URL. Default `https://api.openai.com/v1`. |
| `AI_MODEL` | no | Chat model name. Default `gpt-4o-mini`. |
| `AI_FALLBACK_MODELS` | no | Comma-separated models tried in order when the main one is overloaded, rate-limited or too slow. Useful on free tiers. |
| `AI_JSON_MODE` | no | `false` if the provider rejects `response_format: json_object` (the server also retries without it automatically). |
| `AI_TEMPERATURE`, `AI_TIMEOUT_MS` | no | Sampling temperature (unset uses the model default) and request timeout (default 75000). |
| `PORT` | no | Listening port. Render sets it. Default 4000. |
| `CORS_ORIGINS` | split deploys only | Comma-separated origins allowed to call the API from another domain. Empty means same-origin only. |
| `SERVE_CLIENT` | no | `false` to run as an API only. |
| `MAX_UPLOAD_MB` | no | Upload size limit. Default 5. |
| `AI_DAILY_LIMIT` | no | AI requests each invited friend may make per day. Default 40; `0` means unlimited. |
| `AI_DAILY_LIMIT_OWNER` | no | The same for the owner. Default 0 (unlimited). |
| `VITE_API_BASE_URL` | split deploys only | Build-time URL of the API for the frontend. Unset means same origin. |

## Deploy: MongoDB Atlas + Render

The default deployment is **one Render web service** that serves both the API and the frontend, so they are guaranteed to share an origin and no CORS setup is needed. Data lives in MongoDB Atlas, independent of Render, so redeploys and restarts never lose it.

Free tiers change. At the time of writing, Render's free web services sleep after a period without traffic and take up to about a minute to wake, and Atlas offers a small free cluster. Check both providers' current terms.

### 1. Create the MongoDB Atlas database

1. Sign up at <https://www.mongodb.com/atlas> and create a project.
2. **Create a cluster**: choose the free tier and a region close to where you will host on Render.

### 2. Database user and network access

1. **Database Access → Add New Database User.** Authentication method: password. Let Atlas generate a long random password and copy it. Under privileges choose **Read and write to any database** (or restrict it to the `cv-tailor` database). Do not use your Atlas login as the database user.
2. **Network Access → Add IP Address.** The most restrictive option that works is to allow only your Render service's outbound IP addresses: after creating the service in step 5, open it in Render, find its outbound IP addresses (in the service's **Connect** menu) and add each range here. If you cannot use those, the fallback is `0.0.0.0/0` (allow from anywhere); the database is then protected only by the user's password, so keep that password long, random and private.
3. **Database → Connect → Drivers** and copy the connection string. It looks like
   `mongodb+srv://<user>:<password>@<cluster>.mongodb.net/?retryWrites=true&w=majority`.
   Insert the password, and add the database name `cv-tailor` before the `?`:
   `...mongodb.net/cv-tailor?retryWrites=true&w=majority`.
   If the password contains characters such as `@ : / ? #`, URL-encode them.

This full string is your `MONGODB_URI`. Treat it as a secret.

### 3. Get an AI API key

The server talks to any OpenAI-compatible API. Pick one provider:

| Provider | `AI_BASE_URL` | Where to create a key |
| --- | --- | --- |
| OpenAI (default) | `https://api.openai.com/v1` | <https://platform.openai.com/api-keys> (requires billing credit) |
| Groq | `https://api.groq.com/openai/v1` | <https://console.groq.com/keys> |
| OpenRouter | `https://openrouter.ai/api/v1` | <https://openrouter.ai/keys> |
| Google Gemini | `https://generativelanguage.googleapis.com/v1beta/openai` | <https://aistudio.google.com/apikey> |

Set `AI_MODEL` to a chat model that provider currently offers (model names change, so copy it from the provider's model list). Prefer a capable model: weaker models follow the truthfulness rules less reliably, which means more content gets removed by the safeguards. Set a spending limit in the provider's dashboard if it offers one.

Your master CV and each job description are sent to this provider when you tailor a CV or upload a document. Choose one whose data policy you are comfortable with.

### 4. Push the project to GitHub

```bash
git add .
git status                 # confirm .env is NOT listed
git commit -m "CV Tailor AI"
```

Create an empty **private** repository on GitHub (no README), then:

```bash
git branch -M main
git remote add origin https://github.com/<your-username>/<your-repo>.git
git push -u origin main
```

### 5. Deploy to Render

**Option A, Blueprint (uses [render.yaml](render.yaml)):**

1. In Render: **New → Blueprint**, connect your GitHub account and select the repository.
2. Render reads `render.yaml` and asks for the values marked as secrets: `MONGODB_URI`, `APP_PASSWORD`, `AI_API_KEY`. `JWT_SECRET` is generated for you. The file is preset for Google Gemini (`AI_BASE_URL`, `AI_MODEL`, `AI_FALLBACK_MODELS`); edit those three lines in `render.yaml` if you use another provider. Values written in `render.yaml` are re-applied when the blueprint syncs, so change them there rather than in the dashboard.
3. Apply. The first build takes a few minutes.

**Option B, manual:**

1. **New → Web Service**, select the repository.
2. Runtime **Node**. Build command `npm ci --include=dev && npm run build`. Start command `npm start`.
3. Under **Advanced**, set the health check path to `/api/health`.
4. Add the environment variables from step 6, then create the service.

### 6. Set environment variables

In the Render service's **Environment** tab:

| Key | Value |
| --- | --- |
| `NODE_ENV` | `production` |
| `NODE_VERSION` | `22` |
| `MONGODB_URI` | the Atlas connection string from step 2 |
| `APP_PASSWORD` | a long passphrase you will type on your phone |
| `JWT_SECRET` | output of `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"` |
| `AI_API_KEY` | the key from step 3 |
| `AI_BASE_URL` | the provider's base URL |
| `AI_MODEL` | the model name |

Saving triggers a redeploy. Then go back to Atlas and tighten **Network Access** to the service's outbound IPs (step 2).

Check the deployment: open `https://<your-service>.onrender.com/api/health`. It should return `{"status":"ok","db":"connected"}`. If it says `degraded`, the service cannot reach Atlas (see [Troubleshooting](#troubleshooting)).

### 7. Test on your Android phone

1. Open `https://<your-service>.onrender.com` in Chrome. If the service was asleep, the first load can take up to a minute.
2. Sign in with `APP_PASSWORD`.
3. Open **Settings**. "AI provider" should say **Connected** with your model. If it says **Demo mode**, `AI_API_KEY` is not set.
4. **Master CV → Choose PDF or DOCX**, pick your CV from the phone, review every section and press **Save master CV**.
5. **Tailor** → fill in the job title and company, paste a job description, press **Tailor My CV**.
6. Check **Preview**, **Job match** and **Edit**. Change something, then press **Download PDF** and open the file from Chrome's downloads: it should contain your edit and have selectable text.
7. Press **Save version**, then check **History**.
8. Optional: Chrome menu → **Add to Home screen** (or **Install app**) to launch it like a native app.

### Hosting the frontend separately (optional)

Not needed for the setup above. If you do host the frontend elsewhere (for example a Render static site):

- Build the client with `VITE_API_BASE_URL=https://<your-api-origin>`.
- On the API service set `CORS_ORIGINS=https://<your-frontend-origin>` and `SERVE_CLIENT=false`.
- Configure the static host to rewrite all paths to `/index.html`.

## How truthfulness is enforced

Prompting alone is not trusted. There are three layers:

1. **Prompt design** ([server/src/services/ai/prompts.ts](server/src/services/ai/prompts.ts)). The system prompt names the master CV as the only source of facts and forbids inventing employers, dates, figures, qualifications or skills. The job description and uploaded CV text are passed as delimited data in the user message, with explicit instructions to ignore any instructions found inside them. Closing tags are stripped from untrusted text so it cannot escape its data block.
2. **Constrained output** ([server/src/schemas.ts](server/src/schemas.ts)). The model is only asked for a summary, a skill selection, bullet points per role (by id) and project selection, plus the analysis. It never outputs names, titles, employers, dates, education or certifications. The reply is validated against a schema; one correction attempt is allowed, then the request fails cleanly.
3. **Server-side safeguards** ([server/src/services/safeguards.ts](server/src/services/safeguards.ts)), applied to every AI reply:
   - Contact details, job titles, employers, dates, education, certifications, languages and volunteer work are copied from the master CV unchanged.
   - Every role from the master CV is kept, in your order. Unknown ids are discarded.
   - A skill is kept only if your master CV lists it or mentions it. Rejected skills are moved to "not shown in your master CV" and reported.
   - A generated bullet is removed if it contains a figure that appears nowhere in your master CV, or mentions something the job wants that your master CV lacks. If no bullet survives for a role, your original wording is used.
   - Project technologies are limited to those listed on that project.
   - The summary is checked the same way; problems are shown under "Check before sending" rather than silently kept.
   - "Keywords included" only lists terms that really appear in the final CV.

**What you say counts as fact.** You are the authority on your own experience. Text you type in the editor, in the Tailor form's instructions, or in an instruction to the AI is treated as true alongside your master CV, so "I used Kafka at Example Ltd for event streaming" lets Kafka appear. An instruction such as "add Kubernetes" or "make the score 100", with nothing behind it, is declined by the prompt, and anything the model adds anyway is still removed by the checks above. Your manual edits are not policed: once you edit the CV, what it says is up to you.

The job-match score is an AI estimate (or a keyword-overlap estimate in demo mode). It is labelled as such in the app. It is not an ATS result.

## Security and privacy

- **Accounts.** The owner signs in with `APP_PASSWORD` (leave the email empty, or tap "I am the app owner"). Nobody else can sign up without an invite code from the owner (Settings → Invite a friend). Codes have a use limit and can be switched off. Friends' passwords are stored as scrypt hashes, never in plain text.
- **Private data.** Every master CV, CV version and structure belongs to one account, and every query is scoped to the signed-in person. Members cannot reach the admin tools. Switching a person off ends their access at once.
- **Public routes** are only `/api/health`, sign-in, joining with an invite code (both rate-limited: 10 attempts per 15 minutes per IP) and opening a share link. A share link shows only the CV itself, uses an unguessable 24-character token, and stops working the moment it is switched off.
- **AI allowance.** Each friend has a daily cap on AI requests (`AI_DAILY_LIMIT`), and every AI route also has an hourly per-IP ceiling, so nobody can run up your AI bill or use up a free quota.
- **Secrets stay on the server.** The AI key, database URI and signing secret are read from environment variables and never sent to the browser. `.env` files are git-ignored.
- **Uploads** are accepted only as PDF or DOCX (extension and file signature are both checked), limited in size (5 MB unless `MAX_UPLOAD_MB` says otherwise), processed in memory and discarded. They are never written to disk or stored, and there are no public file URLs.
- **Input validation.** Every request body is validated with zod before use. Database queries are built from validated values and always scoped to the owner; ids are checked before querying.
- **Logging** records method, path, status and duration only. No request bodies, CV content, identity details, tokens or keys.
- **Transport.** Render serves the app over HTTPS. In production the server sends HSTS and a restrictive Content-Security-Policy. API responses are marked `no-store`, and the service worker never caches API responses.
- **Third parties.** CV data is sent only to MongoDB (storage) and the AI provider you configured.
- **In the browser.** The session token is kept in `localStorage`; the CV you are currently editing is kept in `sessionStorage` so a refresh does not lose it. Both are cleared on sign-out.
- **Deleting data.** Delete single versions in History, or everything (master CV and all versions) in **Settings → Delete all my data**.

## Tests

```bash
npm test
```

145 backend tests (Vitest) covering:

- PDF and DOCX text extraction; unsupported, disguised, corrupted, empty and oversized files.
- The AI client against a local OpenAI-compatible mock server: valid replies, schema violations and the correction retry, provider errors (401, 404, 429, 500), empty replies, unreachable provider, timeouts, missing API key (demo mode).
- Prompt-injection handling and the factual safeguards.
- Accounts and invite codes (single-use codes, private data, switching people off, password changes, daily AI limits), PDF designs and page counts, Word files, cover letters, interview prep, LinkedIn, one-page mode, the application tracker and share links.
- CV structures (reading a template, order, renamed and hidden sections in the PDF), AI instructions (stated facts accepted, unstated ones rejected, facts never altered), and failover between models.
- PDF generation for short, long (multi-page) and nearly empty CVs, edited content, special characters, filename sanitising.
- The HTTP API with a real (in-memory) MongoDB: authentication on every protected route, profile validation, tailoring, saving, loading, updating and deleting versions, version isolation, delete-all, CORS, production config checks, and behaviour when the database goes away.

The first run downloads a MongoDB binary for the in-memory test database.

`npx tsx scripts/sample-pdf.ts out.pdf [--long]` (run inside `server/`) writes a sample PDF for checking the layout by eye.

## Limitations and manual steps

- **Deployment is manual.** Creating the Atlas cluster, the AI key, the GitHub repository and the Render service requires your accounts (steps 1 to 6 above).
- **No self-service password reset.** If a friend forgets their password, delete their account in Settings and send them a new invite (their CVs are lost), or let them keep using a signed-in device and change it in Settings. Email-based reset would need an email service.
- **Share links show contact details** (name, email, phone) to anyone who has the link. Switch a link off when it is no longer needed.
- **Notifications** when a task finishes in the background need the installed app (or Chrome) and your permission; otherwise the phone vibrates and the tab title changes.
- **Scanned PDFs are not supported.** There is no OCR; image-only PDFs are rejected with an explanation.
- **Extraction is never perfect.** Multi-column or heavily designed CVs can extract out of order. Always review the form before saving. The no-AI basic parser is much rougher than the AI one.
- **The safeguards are conservative, not omniscient.** They match text, so they can remove a legitimate bullet (for example when the AI writes "10 engineers" and your CV says "ten"), and they cannot detect every subtle exaggeration in wording. Read the CV before sending it; the "Check before sending" list shows what was removed and why.
- **PDF fonts.** The PDF uses the standard Helvetica family for maximum ATS compatibility. Western European characters are supported; other Latin letters are transliterated (ł becomes l) and non-Latin scripts are not supported.
- **One visual design**, A4. An uploaded structure changes section order and heading names only; fonts, colours, columns and graphics of the uploaded file are not reproduced. The on-screen preview mirrors content and order, not exact page breaks.
- **AI instructions change wording, skills and section order.** Adding or removing roles and projects, and changing titles, employers or dates, is done in the Edit tab. The chat history is not saved with a version.
- **Free AI tiers are unreliable at busy times.** Models can report overload or respond slowly; `AI_FALLBACK_MODELS` softens this, and a failed request can simply be retried.
- **Job posting URL** is stored for reference only. The app does not fetch job pages.
- **Offline.** The installed app opens offline, but everything useful needs the server.
- **Free hosting** has cold starts and usage limits. A long AI request on a sleeping service can occasionally time out; retry once it is awake.

## Troubleshooting

| Symptom | Likely cause and fix |
| --- | --- |
| Deploy fails or `/api/health` returns `degraded` | The service cannot reach Atlas. Check `MONGODB_URI` (password URL-encoded, database name present) and Atlas **Network Access**. |
| Service exits at start with "Invalid production configuration" | `APP_PASSWORD`, `JWT_SECRET` or `MONGODB_URI` is missing or too short. The log lists which. |
| "Demo mode" badge in the app | `AI_API_KEY` is not set on the server. |
| "The AI provider rejected the API key" | Wrong key, or the key belongs to a different provider than `AI_BASE_URL`. |
| "did not recognise the model or endpoint" | `AI_MODEL` is not offered by that provider, or `AI_BASE_URL` is wrong (it must not include `/chat/completions`). |
| "rate-limiting requests or the account is out of quota" | Provider limit reached or no credit. Wait, or check the provider's billing page. |
| "returned a response in an unexpected format" | The model failed to produce valid JSON twice. Try again or use a more capable model. |
| First page load takes about a minute | Free-tier cold start. |
| Local `npm run build` fails in CSS with a Tailwind error | An unrelated `postcss.config.js` in a parent folder; `client/vite.config.ts` already guards against this, so make sure that guard is still in place. |

## Project layout

```
client/                 React app (Vite, Tailwind)
  public/               PWA manifest, service worker, icons
  src/pages/            Dashboard, Master CV, Tailor, CV result, History, Settings, Login
  src/components/       UI kit, form editors, CV preview, match analysis
  src/api.ts            API client
server/
  src/app.ts            Express app: security headers, CORS, static frontend
  src/routes/api.ts     All API routes
  src/schemas.ts        zod schemas: the single definition of valid data
  src/models/           Mongoose models: User (owner), MasterProfile, TailoredCv (+ job metadata)
  src/services/ai/      Provider client and prompts
  src/services/         Text extraction, safeguards, demo mode, PDF rendering
  tests/                Vitest suites
render.yaml             Render blueprint
.env.example            Environment variable template
```
