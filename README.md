# FOCMS Election Portal

FOCMS / SAS student council election portal for BBA and MBA students. This project merges [Election-Portal-2k25](https://github.com/Tanmay2602B/Election-Portal-2k25) at `99228b3` into the existing FOCMS project, using the MongoDB/Express backend selected for this integration.

## Features

- Public landing page with election status, countdown, turnout, and announcements.
- Student and admin sign-in using hashed passwords and expiring sessions.
- Admin management of positions, candidates, candidate photos, students, schedules, results, and announcements.
- FOCMS programs: BBA semesters 1, 3, 5; MBA semesters 1, 3.
- CSV/Excel student import, program/semester search and filters, filtered registry export, password reset with downloadable new credentials, and selective vote reset.
- One complete ballot per student, enforced atomically by MongoDB transactions, with server-side schedule and candidate validation. Results and individual voting records require admin access.

## Local setup

Requires Node.js 22.12 or later and MongoDB Atlas or a MongoDB replica set. A standalone MongoDB server cannot support atomic ballot submission.

```powershell
npm install
if (!(Test-Path backend/.env)) { Copy-Item backend/.env.example backend/.env }
if (!(Test-Path frontend/.env)) { Copy-Item frontend/.env.example frontend/.env }
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Set `MONGODB_URI` to your FOCMS database and `JWT_SECRET` to the generated value in `backend/.env`. Use a dedicated empty database for a new election setup. This integration has already prepared an ignored local `backend/.env` with a random secret and a localhost database URI; edit it for your environment instead of overwriting it if it exists.

Create your administrator by setting `ADMIN_ID`, `ADMIN_PASSWORD` (at least 12 characters), and optionally `ADMIN_NAME` in `backend/.env`, then run:

```powershell
npm run create-admin
npm run dev
```

Open `http://localhost:5173`. The frontend proxies `/api` to the backend on port 5000. Admin sign-in now uses an Admin ID rather than Firebase email authentication. Remove the admin bootstrap variables after creating the account.

## Students

The CSV import template can be downloaded from **Student Registry → Download Template**; it is also available at [frontend/public/student-template.csv](frontend/public/student-template.csv). Columns: `studentId,name,program,semester,class,password`. Numeric student IDs are converted to text. For FOCMS classes, use `BBA-Sem1`, `BBA-Sem3`, `BBA-Sem5`, `MBA-Sem1`, or `MBA-Sem3`.

Student imports allow the same Student ID when the full names differ. Duplicate detection uses the normalized full name (Unicode compatibility normalization, case-insensitive, with repeated whitespace collapsed), and the backend enforces the same rule. Each student receives a unique generated Voter ID and a password; the import credentials workbook contains both alongside Student ID, name, program, semester, and class. Students sign in with Voter ID and password. Student account and vote ownership use an internal account ID, so reused Student IDs do not merge accounts.

Blank import passwords retain the previous portal's `password123` default. Set individual passwords in the import or use **Reset Passwords** to generate unique credentials. Stored passwords are hashed and cannot be exported; **Export Registry** and **Export Filtered** export student details, while **Reset Passwords** downloads the newly generated passwords once.

## Migration and deployment

See [MIGRATION.md](MIGRATION.md) for details on the completed migration from Firebase to MongoDB. All election data and administrator accounts have been imported into MongoDB.

For production, deploy this repository's backend and set `MONGODB_URI`, a random `JWT_SECRET`, and `ALLOWED_ORIGINS` to the exact FOCMS frontend URL. Build the frontend with `VITE_API_BASE_URL=https://YOUR-FOCMS-API/api`. No upstream API URL or database connection is used by default. Configure your own Cloudinary account and unsigned preset for optional photos via the frontend environment variables.

The root `vercel.json` builds `frontend/dist`; `render.yaml` describes the backend service. Deploy with the repository root selected. Environment changes on the frontend require a rebuild.

## Render Keep-Alive / Auto Health Check

To prevent the Render free-tier backend from spinning down after 15 minutes of inactivity:
- **Internal Auto-Ping**: The backend automatically reads Render's `RENDER_EXTERNAL_URL` in production (or `AUTO_PING_URL` in `backend/.env`) and sends periodic health check requests to `/api/health` every 12 minutes.
- **External Cron**: A GitHub Actions workflow (`.github/workflows/render-keepalive.yml`) pings the health endpoint every 14 minutes externally to keep the service warm 24/7.

## Validation

```powershell
npm run build
npm run lint
npm test
```

API tests launch an isolated, temporary MongoDB replica set and remove it afterward. Install `mongod` on your PATH, or set `MONGOD_BINARY` to its executable path. Tests do not use `backend/.env` database settings or live election data.
