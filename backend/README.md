# FOCMS election API

Express/Mongoose API serving the FOCMS election frontend. Handles authentication, BBA/MBA students, positions, candidates, announcements, schedules, admin results, and atomic ballots.

Requires Node.js 22.12+, a MongoDB replica set, bcrypt, cors, dotenv, express, jsonwebtoken, and mongoose. Configuration is described in the [root README](../README.md).

From the repository root: `npm install`, configure `backend/.env`, run `npm run create-admin`, then `npm start` or `npm run dev`. `npm test` starts an isolated database for API integration checks.

Routes live under `/api`: `/health`, `/auth`, `/users`, `/positions`, `/candidates`, `/votes`, `/settings`, `/announcements`. Administrator creation and offline migration use scripts, not public endpoints. Export Firebase election data with `npm run export-firestore --workspace backend -- C:/secure/focms-export.json`, then import it with `npm run import-firestore --workspace backend -- C:/secure/focms-export.json`. Keep the export outside the repository; it may contain plaintext legacy student passwords. See [MIGRATION.md](../MIGRATION.md) for the full migration and verification procedure.

The API logs MongoDB command starts, completions, and failures to the backend terminal, including command and collection names and durations. Command payloads, document values, student IDs, passwords, and tokens are intentionally excluded from logs.

On startup the API migrates student vote and active-batch ownership from Student IDs to Mongo account IDs, assigns or repairs missing/legacy Voter IDs to unique six-character alphanumeric values, and replaces the Student-ID unique index with a unique normalized-name index for students. Student IDs can therefore be reused when the registered full names differ; normalized duplicate names are rejected by both preview and API. Every student receives a unique Voter ID, which is used with the password to sign in. If existing student records contain duplicate normalized names, startup stops and reports the conflicting account IDs; resolve those records before restarting.
