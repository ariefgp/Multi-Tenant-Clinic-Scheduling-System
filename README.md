# Multi-Tenant Clinic Scheduling System

A full-stack appointment scheduling system for multi-tenant clinics, built with NestJS, React, and PostgreSQL.

## Features

- Multi-tenant isolation via Row Level Security
- Conflict-free scheduling with PostgreSQL exclusion constraints
- Availability search with split-shift support
- Appointment create, cancel, and reschedule
- Week calendar view with booking flow
- Swagger API documentation

## Tech Stack

- **Backend:** NestJS 11 + Fastify + Drizzle ORM
- **Frontend:** React 19 + TypeScript + TailwindCSS v4 + TanStack Query
- **Database:** PostgreSQL 16 / Neon (serverless)
- **Deployment:** GKE + GitHub Actions CI/CD

## Quick Start

### Prerequisites

- Node.js 20+
- pnpm
- Docker (for local PostgreSQL)

### 1. Start PostgreSQL

```bash
docker-compose up -d
```

This creates the database, runs `db/ddl.sql`, and seeds with `db/seed.sql`.

### 2. Start Backend

```bash
cd backend
pnpm install
cp ../.env.example .env.local
# Edit .env.local with your DATABASE_URL
pnpm start:dev
```

Backend runs at http://localhost:3000. Swagger docs at http://localhost:3000/docs.

### 3. Start Frontend

```bash
cd frontend
pnpm install
pnpm dev
```

Frontend runs at http://localhost:5173 with API proxy to backend.

### Using Neon (Serverless PostgreSQL)

For Neon, set your connection string in `backend/.env.local`:

```
DATABASE_URL=postgresql://user:pass@ep-xxx.region.aws.neon.tech/dbname?sslmode=require
```

Then run the DDL and seed manually:

```bash
psql $DATABASE_URL -f db/ddl.sql
psql $DATABASE_URL -f db/seed.sql
```

## API

All endpoints require the `X-Tenant-Id` header.

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/health | Health check |
| GET | /api/doctors | List doctors |
| GET | /api/patients | List patients |
| GET | /api/services | List services |
| GET | /api/rooms | List rooms |
| GET | /api/devices | List devices |
| POST | /api/appointments | Create appointment |
| GET | /api/appointments/:id | Get appointment |
| PATCH | /api/appointments/:id | Reschedule |
| DELETE | /api/appointments/:id | Cancel |
| GET | /api/schedule | All appointments |
| GET | /api/doctors/:id/schedule | Doctor schedule |
| GET | /api/availability | Search slots |

### Example: Create Appointment

```bash
curl -X POST http://localhost:3000/api/appointments \
  -H "Content-Type: application/json" \
  -H "X-Tenant-Id: 1" \
  -d '{
    "doctor_id": 101,
    "patient_id": 501,
    "service_id": 1,
    "room_id": 11,
    "starts_at": "2026-02-09T09:00:00+01:00"
  }'
```

### Example: Search Availability

```bash
curl "http://localhost:3000/api/availability?service_id=1&from=2026-02-09T08:00:00%2B01:00&to=2026-02-13T18:00:00%2B01:00&limit=5" \
  -H "X-Tenant-Id: 1"
```

### Example: Reschedule

```bash
curl -X PATCH http://localhost:3000/api/appointments/1 \
  -H "Content-Type: application/json" \
  -H "X-Tenant-Id: 1" \
  -d '{"starts_at": "2026-02-10T10:00:00+01:00"}'
```

See `api.http` for all endpoint examples.

## Project Structure

```
├── backend/           NestJS API server
│   └── src/
│       ├── modules/   Domain modules (appointment, availability, etc.)
│       ├── database/  Drizzle ORM schemas
│       └── common/    Middleware, decorators, filters
├── frontend/          React SPA
│   └── src/
│       ├── components/  Calendar, BookingModal, etc.
│       ├── api/         Typed API client
│       └── types/       TypeScript interfaces
├── db/                SQL files
│   ├── ddl.sql        Database schema
│   └── seed.sql       Demo data
├── k8s/               Kubernetes manifests
├── .github/workflows/ CI/CD pipelines
├── DESIGN.md          Architecture documentation
└── api.http           API test requests
```

## GKE Deployment

See [DESIGN.md](DESIGN.md) for full deployment guide. Required GitHub Secrets:

| Secret | Description |
|--------|-------------|
| `GCP_PROJECT_ID` | GCP project ID |
| `WIF_PROVIDER` | Workload Identity Federation provider |
| `WIF_SERVICE_ACCOUNT` | GCP service account email |
| `NEON_DATABASE_URL` | Neon PostgreSQL connection string |
