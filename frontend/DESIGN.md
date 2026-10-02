# Frontend design

The upstream modular dashboard, landing page, announcements and ballot interface are retained in the FOCMS workspace. The public title, sign-in, admin/student headings and image folder use FOCMS identity. Student import/export retains BBA/MBA metadata.

Frontend schedule status uses the same boundary rules as the backend. The backend controls authorization and ballot validity. Sessions use a FOCMS-specific storage key and are cleared on authentication expiry. A successful ballot shows confirmation before logout. Passwords cannot be recovered from hashed storage; explicit bulk reset downloads the newly issued credentials.

The design favors the incoming modular components over the old monolithic Firebase dashboard. Firebase is preserved as an archived migration reference. Production API and image-service settings must belong to FOCMS. See [root DESIGN.md](../DESIGN.md) for security boundaries and known limits.

2026-10-02: Integrated incoming screens and retained FOCMS student management and naming.
