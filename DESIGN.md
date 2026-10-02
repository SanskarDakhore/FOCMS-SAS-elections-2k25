# FOCMS integration design

## Architecture

The root is an npm workspace with `frontend` (React/Vite) and `backend` (Express/Mongoose). The user selected the upstream MongoDB/Express architecture. Firebase configuration is retained only as an archived migration reference.

## Decisions

- Merge source: Tanmay2602B/Election-Portal-2k25, commit `99228b3`. Preserve the FOCMS/SAS identity, original repository remote, BBA/MBA programs, semester filtering/export, and existing Windows metadata edits.
- Use one root package lock and explicit workspace scripts so dependency installation and builds are repeatable.
- Use a relative `/api` development URL and an explicit FOCMS production URL. Do not connect to upstream hosted services. Environment files are ignored; backend startup requires a strong configured JWT secret and a replica set.
- Validate each complete ballot against its schedule, positions, candidates, and departmental eligibility. Claim the student's voted flag and insert the entire ballot in one transaction. A unique student/position index prevents duplicates.
- Keep results and raw ballots admin-only. Load the current account role from the database instead of trusting a stale JWT role. Bootstrap admins with a local CLI rather than a public default-password endpoint.
- Hash passwords. Registry exports retain program/semester metadata; new credential sheets are generated only during an explicit password reset.

## Security boundary and limits

The backend is authoritative for roles, election timing, eligibility, and ballot validity. Production hosting must provide HTTPS and a controlled MongoDB database. Candidate photo uploads use the institution's configured Cloudinary unsigned preset. JWTs expire after four hours; existing tokens are not revoked immediately by password resets, but account deletion and role changes take effect on subsequent requests. Election administrators can inspect individual ballots and reset them. This is an audited administrative voting system, not an anonymous cryptographic election protocol.

The importer requires a normalized offline export and an empty database; Firebase admin authentication requires new credentials. Live migration/deployment and production hosting credentials remain operator steps. Department restrictions match the existing class-based frontend policy. Administrators should close voting before changing positions, candidates, or registries.

## Change history

2026-10-02: Integrated the upstream modular frontend, Express/MongoDB API, announcement management, election status and voting fixes; retained FOCMS identity and adapted the data/security boundaries for the new backend.
