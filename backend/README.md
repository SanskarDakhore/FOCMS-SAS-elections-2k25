# FOCMS election API

Express/Mongoose API serving the FOCMS election frontend. Handles authentication, BBA/MBA students, positions, candidates, announcements, schedules, admin results, and atomic ballots.

Requires Node.js 22.12+, a MongoDB replica set, bcrypt, cors, dotenv, express, jsonwebtoken, and mongoose. Configuration is described in the [root README](../README.md).

From the repository root: `npm install`, configure `backend/.env`, run `npm run create-admin`, then `npm start` or `npm run dev`. `npm test` starts an isolated database for API integration checks.

Routes live under `/api`: `/health`, `/auth`, `/users`, `/positions`, `/candidates`, `/votes`, `/settings`, `/announcements`. Administrator creation and offline migration use scripts, not public endpoints. See [MIGRATION.md](../MIGRATION.md).
