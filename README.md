# Raithu Palu — Dairy Milk Management & Customer Ordering Platform

## Phase 0: Project Foundation

This repository contains the Phase 0 monorepo foundation for **Raithu Palu**, a dairy milk management and customer ordering web application.

### Monorepo Structure

```text
raithu-palu/
├── backend/                  # Node.js + Express + Mongoose TypeScript backend
│   ├── src/
│   │   ├── config/           # Centralized env validation & Mongoose connection module
│   │   ├── middleware/       # 404 Not Found & centralized error-handling middleware
│   │   ├── routes/           # Health check route (GET /api/health)
│   │   ├── app.ts            # Express application setup (Helmet, CORS, body limits)
│   │   └── index.ts          # HTTP server bootstrap & graceful shutdown
│   ├── .env.example
│   ├── package.json
│   └── tsconfig.json
├── frontend/                 # React + Vite + Tailwind CSS TypeScript frontend
│   ├── public/
│   ├── src/
│   │   ├── components/       # Reusable LoadingState, ErrorState, NotFoundState
│   │   ├── layouts/          # Responsive AppLayout
│   │   ├── lib/              # Centralized API configuration (apiConfig.ts)
│   │   ├── pages/            # LandingDashboardPage, SystemStatusPage, NotFoundPage
│   │   ├── App.tsx           # React Router configuration
│   │   ├── index.css         # Tailwind CSS directives
│   │   └── main.tsx          # React entry point
│   ├── .env.example
│   ├── index.html
│   ├── package.json
│   ├── postcss.config.js
│   ├── tailwind.config.js
│   └── vite.config.ts
├── .env.example
├── .gitignore
├── package.json
└── README.md
```

---

## MongoDB Deployment Requirement (Transactions)

Later approved phases of Raithu Palu implement immutable financial ledgers, FIFO invoice allocations, advance credit provenance, and concurrency-guarded payment reversals that rely on **MongoDB multi-document ACID transactions**.

- **Standalone MongoDB servers do NOT support multi-document transactions.**
- You **must** configure `MONGODB_URI` to connect to either:
  1. **MongoDB Atlas** (all tiers, including M0 free tier, run as a replica set and support multi-document transactions), or
  2. A **self-managed MongoDB replica set** initialized with `rs.initiate()`.

---

## Prerequisites

- **Node.js** `>= 20.x`
- **npm** `>= 10.x`
- A transactions-capable **MongoDB Atlas** cluster or **MongoDB replica set**

---

## Setup & Installation

1. **Install dependencies for both `backend/` and `frontend/`:**

   ```bash
   # From repository root:
   npm run install:all

   # Or install each application independently:
   cd backend && npm install
   cd ../frontend && npm install
   ```

2. **Configure environment variables:**

   Copy `.env.example` values into `backend/.env` and `frontend/.env`:

   ```bash
   cp backend/.env.example backend/.env
   cp frontend/.env.example frontend/.env
   ```

   Edit `backend/.env` and set `MONGODB_URI` to your MongoDB Atlas or replica-set URI and `CORS_ORIGIN` to the allowed frontend origin (e.g., `http://localhost:5173`).

---

## Running Frontend and Backend Independently

### Backend (`backend/`)

```bash
# Development mode (with tsx watch):
cd backend
npm run dev

# Production build & start:
cd backend
npm run build
npm run start
```

### Frontend (`frontend/`)

```bash
# Development server (Vite on port 5173):
cd frontend
npm run dev

# Production build & preview:
cd frontend
npm run build
npm run preview
```

---

## Health Check Endpoint

- **Endpoint:** `GET /api/health`
- **Behavior:** Reports application status (`up`, environment, uptime) and database connectivity (`connected`, `status`, `transactionsRequired`) separately without exposing connection strings, credentials, or sensitive topology details.
