# Harvey Norman Operations Dashboard

## Step-by-step implementation plan

1. Project foundation
   - Create a Vite React app with static hosting support and a responsive Tailwind-powered UI foundation.
   - Keep the app intentionally static-site friendly for GitHub Pages compatibility.

2. Local-first data layer
   - Use Dexie with IndexedDB to store users, imports, and normalized retail KPIs locally.
   - Persist authentication state across sessions and prevent data loss during offline use.

3. Authentication and RBAC
   - Implement username/password login flows with PBKDF2-based hashing for stored credentials.
   - Seed default users for Manager, Salesperson, and Warehouse roles and restrict data access by role.

4. Unified data ingestion
   - Build an import experience for Google Sheets, CSV, XLSX, and Access files.
   - Normalize all incoming rows into a single schema so dashboard widgets can render consistently.

5. KPI dashboard and UX
   - Create a Slack-inspired dashboard with dark/light mode, responsive card layouts, summary KPIs, tables, and charts.
   - Tailor the dashboard content by role so each user sees only relevant data and controls.

6. Deployment
   - Prepare Vite for static hosting and add a GitHub Actions workflow for GitHub Pages publishing.
   - Provide local build and deployment instructions for the development phase.

## Architecture overview

The application is a client-side React app compiled with Vite. The data flow is intentionally simple and durable:

- UI: React + Tailwind CSS provides the dashboard, login screens, import tools, and admin controls.
- Data persistence: Dexie wraps IndexedDB and stores application records locally for offline-first access.
- Authentication: passwords are hashed in-browser using PBKDF2 and compared during login.
- Import pipeline: CSV/XLSX uploads are parsed with xlsx, Google Sheets inputs are normalized as a sheet import, and Access database files are captured as import records in a browser-safe workflow with normalization applied to the resulting data objects.
- Dashboard: Recharts generates revenue and regional charts; role-specific filtering controls which KPIs are displayed.

## Getting started

```bash
npm install
npm run dev
```

Then open the local URL shown by Vite, typically http://localhost:5173/.

## Production build

```bash
npm run build
```

The build output is generated in the dist folder and is compatible with static hosting.

## GitHub Pages deployment

This project includes a GitHub Pages workflow in .github/workflows/deploy.yml.

To publish from a GitHub repository:

1. Push this project to GitHub.
2. In GitHub, open the repository settings and enable GitHub Pages.
3. Set the source to GitHub Actions if prompted.
4. Push to the main branch to trigger the workflow.

Alternative local deploy command:

```bash
npm run deploy
```

This uses gh-pages to publish the dist directory.

## Demo credentials

- Manager: manager / Harvey123!
- Salesperson: sales / Harvey123!
- Warehouse: warehouse / Harvey123!

## Project structure

```text
.
├── .github/
│   └── workflows/
│       └── deploy.yml
├── src/
│   ├── data/
│   │   └── seed.js
│   ├── lib/
│   │   ├── auth.js
│   │   ├── db.js
│   │   └── import.js
│   ├── App.jsx
│   ├── index.css
│   └── main.jsx
├── .gitignore
├── index.html
├── package.json
├── postcss.config.js
├── README.md
├── tailwind.config.js
└── vite.config.js
```

## Notes

- The dashboard is intentionally designed for a Harvey Norman-style retail environment with a red-and-white brand palette and Slack-inspired spacing and card design.
- Roles are tailored so each user sees role-relevant metrics without exposing unrelated business data.
- All data remains local to the browser by default, making the app offline-first and suitable for early-stage prototypes and demonstrations.
