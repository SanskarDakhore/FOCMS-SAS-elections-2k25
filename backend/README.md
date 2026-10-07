# FOCMS election API

Express/Mongoose API serving the FOCMS election frontend. Handles authentication, BBA/MBA students, positions, candidates, announcements, schedules, admin results, and atomic ballots.

Requires Node.js 22.12+, a MongoDB replica set, bcrypt, cors, dotenv, express, jsonwebtoken, and mongoose. Configuration is described in the [root README](../README.md).

From the repository root: `npm install`, configure `backend/.env`, run `npm run create-admin`, then `npm start` or `npm run dev`. `npm test` starts an isolated database for API integration checks.

Routes live under `/api`: `/health`, `/auth`, `/users`, `/positions`, `/candidates`, `/votes`, `/settings`, `/announcements`. Administrator creation and offline migration use scripts, not public endpoints. Export Firebase election data with `npm run export-firestore --workspace backend -- C:/secure/focms-export.json`, then import it with `npm run import-firestore --workspace backend -- C:/secure/focms-export.json`. Keep the export outside the repository; it may contain plaintext legacy student passwords. See [MIGRATION.md](../MIGRATION.md) for the full migration and verification procedure.

The API logs MongoDB command starts, completions, and failures to the backend terminal, including command and collection names and durations. Command payloads, document values, student IDs, passwords, and tokens are intentionally excluded from logs.
