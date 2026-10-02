# FOCMS election frontend

React/Vite client for the FOCMS/SAS election portal. Provides public status and announcements, sign-in, student ballots, and the modular admin dashboard. BBA/MBA registration fields, semester filters, filtered exports and ballot resets are preserved.

Uses React, React Router, axios, Lucide, XLSX, Recharts, and Tailwind. The backend is authoritative for authentication and voting. Run `npm install` and `npm run dev` from the repository root. Run `npm run build` for `frontend/dist` and `npm run lint` for static checks.

Development uses the Vite `/api` proxy; production requires your FOCMS `VITE_API_BASE_URL`. Optional candidate uploads require institution-owned Cloudinary configuration. See [root README](../README.md).
