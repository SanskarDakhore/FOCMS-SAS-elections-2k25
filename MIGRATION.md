# FOCMS Firebase to MongoDB migration

The migration to MongoDB is complete. The existing `focms-sas-elections-2k25` Firebase project remains untouched; refer to Git history to review historical Firebase rules if needed.

1. Back up Firebase collections before switching the live site. Perform a rehearsal in a separate MongoDB database; keep the live voting site closed during the final migration.
2. Provision a dedicated FOCMS MongoDB Atlas database or replica set. Configure `backend/.env` or hosting environment variables; never reuse the incoming repository's environment file or API service.
3. Sign in with Google Cloud CLI using an account with Firestore read access to the FOCMS Firebase project. Export the five supported collections (`users`, `positions`, `candidates`, `votes`, and `settings`) to a private path outside this repository. The export can contain plaintext legacy student passwords:
	```bash
	gcloud auth login
	npm run export-firestore --workspace backend -- C:/secure/focms-export.json
	```
4. Run `npm run import-firestore --workspace backend -- C:/secure/focms-export.json` against an empty target database. The importer hashes legacy student passwords, preserves student IDs, BBA/MBA program and semester fields, rewrites candidate/position references to MongoDB IDs, preserves ballots and timestamps, and translates `settings/electionConfig` to `votingSchedule`. It refuses a nonempty target database and rolls back on a validation failure. Firebase admin passwords cannot be exported with this command; migrate administrators separately with `npm run export-admins` and `npm run import-admins`, or create a new admin with `npm run create-admin`.
5. Compare student totals, per-position vote totals, schedules, candidate assignments, and voted flags with the backup. Importing old ballots preserves `hasVoted` and prevents students from voting again. Starting a new election requires the administrator to reset the relevant ballots deliberately.
6. Set the deployed frontend's `VITE_API_BASE_URL` to your own FOCMS API and the backend's `ALLOWED_ORIGINS` to the exact frontend origin. Configure optional candidate photos using your institution's image service. Build, test, and sign in with the new admin before switching the live URL.

Student sessions and device fingerprints from Firebase are not transferred: the new backend uses expiring authenticated sessions and an atomic ballot per student. Individual ballot records retain student IDs for administrator review; the application does not claim anonymous or end-to-end encrypted ballots.

Keep the export outside the repository and restrict access: it may contain legacy plaintext passwords. No live migration or deployment is performed by the code merge.
