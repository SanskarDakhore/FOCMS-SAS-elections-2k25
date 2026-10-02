# API design

The goal is to adopt the incoming Express/MongoDB backend while retaining FOCMS data fields and vote protections. `app.js` assembles routes without connecting to a database; `server.js` validates configuration and connects before listening. This separation supports real API tests.

A MongoDB transaction performs ballot validation, claims `hasVoted`, and inserts all selections together. A unique `(userId, positionId)` index supplements transaction checks. Bulk student deletion and individual vote resets are transactional.

Roles come from the current database account on each authenticated request. Results and registry actions require admins; students submit only complete, eligible ballots within the scheduled window. Passwords use bcrypt. JWT secrets have no fallback. Admin bootstrapping is a local CLI. Offline migration refuses a nonempty database.

Known limits and security decisions are recorded in the [root DESIGN.md](../DESIGN.md). Atomic writes require a replica set or Atlas. Production must configure HTTPS, exact CORS origins, and operator-owned credentials.

2026-10-02: Merged upstream API and preserved FOCMS fields, tightened results access, and added transactional voting and integration tests.
