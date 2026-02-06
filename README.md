# Multi-Tenant Clinic Scheduling System

A full-stack appointment scheduling system for multi-tenant clinics, built with NestJS, React, and PostgreSQL.

## Features

- **Google OAuth Authentication** — Staff login via Google accounts
- **Multi-tenant isolation** — Row Level Security at database level
- **Conflict-free scheduling** — PostgreSQL exclusion constraints prevent double-booking
- **Availability search** — Find open slots with split-shift support
- **Week calendar view** — FullCalendar-powered schedule visualization
- **Cal.com-style booking** — Date picker + time slot selection
- **Dashboard layout** — Sidebar navigation with user profile menu
- **Responsive UI** — Built with shadcn/ui components and TailwindCSS

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | React 19, TypeScript, TailwindCSS v4, TanStack Query, FullCalendar, shadcn/ui |
| Backend | NestJS 11, Fastify, Drizzle ORM, Passport JWT |
| Database | PostgreSQL 16 / Neon (serverless) |
| Auth | Google OAuth 2.0, JWT tokens |
| Deployment | GKE, GitHub Actions CI/CD |
| Package Manager | pnpm |

## Quick Start

### Prerequisites

- Node.js 20+
- pnpm
- Docker (for local PostgreSQL) or Neon account

### 1. Clone and Install

```bash
git clone https://github.com/ariefgp/Multi-Tenant-Clinic-Scheduling-System.git
cd Multi-Tenant-Clinic-Scheduling-System

# Install dependencies
cd backend && pnpm install && cd ..
cd frontend && pnpm install && cd ..
```

### 2. Configure Environment

Create `backend/.env.local`:

```env
# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/clinic

# Google OAuth
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret
GOOGLE_CALLBACK_URL=http://localhost:3000/api/auth/google/callback

# JWT
JWT_SECRET=your-secret-key-at-least-32-chars
JWT_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d

# Frontend URL (for OAuth redirect)
FRONTEND_URL=http://localhost:5173
```

### 3. Start PostgreSQL (Local)

```bash
docker-compose up -d
```

This creates the database, runs schema migrations, and seeds demo data.

### 4. Start Backend

```bash
cd backend
pnpm start:dev
```

Backend runs at http://localhost:3000. Swagger docs at http://localhost:3000/docs.

### 5. Start Frontend

```bash
cd frontend
pnpm dev
```

Frontend runs at http://localhost:5173.

### Using Neon (Serverless PostgreSQL)

For Neon, set your connection string in `backend/.env.local`:

```env
DATABASE_URL=postgresql://user:pass@ep-xxx.region.aws.neon.tech/dbname?sslmode=require
```

The database schema is automatically created on first startup.

## Project Structure

```
├── backend/                 NestJS API server
│   └── src/
│       ├── modules/
│       │   ├── auth/        Google OAuth + JWT authentication
│       │   ├── appointment/ CRUD + conflict checking
│       │   ├── availability/ Slot search algorithm
│       │   ├── doctor/      Doctor management
│       │   ├── patient/     Patient management
│       │   ├── service/     Service types
│       │   └── room/        Room management
│       ├── database/        Drizzle ORM schemas + migrations
│       └── common/          Middleware, decorators, guards
├── frontend/                React SPA
│   └── src/
│       ├── components/
│       │   ├── ui/          shadcn/ui components (button, dialog, etc.)
│       │   ├── layout/      DashboardLayout, Sidebar, Header
│       │   ├── auth/        ProtectedRoute
│       │   ├── BookingModal.tsx
│       │   └── WeekCalendar.tsx
│       ├── pages/           Route pages
│       ├── contexts/        AuthContext
│       ├── api/             Typed API client with auth interceptors
│       ├── router/          React Router config
│       └── types/           TypeScript interfaces
├── db/                      SQL files
│   ├── ddl.sql              Database schema
│   └── seed.sql             Demo data
├── k8s/                     Kubernetes manifests
└── .github/workflows/       CI/CD pipelines
```

## API Endpoints

All endpoints (except auth) require the `X-Tenant-Id` header.

### Authentication

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/auth/google | Redirect to Google OAuth |
| GET | /api/auth/google/callback | OAuth callback |
| POST | /api/auth/refresh | Refresh access token |
| POST | /api/auth/logout | Logout |
| GET | /api/auth/me | Get current user |

### Resources

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/doctors | List doctors |
| GET | /api/patients | List patients |
| GET | /api/services | List services |
| GET | /api/rooms | List rooms |
| GET | /api/devices | List devices |

### Appointments

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /api/appointments | Create appointment |
| GET | /api/appointments/:id | Get appointment |
| PATCH | /api/appointments/:id | Reschedule |
| DELETE | /api/appointments/:id | Cancel |
| GET | /api/schedule | All appointments |
| GET | /api/doctors/:id/schedule | Doctor schedule |
| GET | /api/availability | Search available slots |

## Screenshots

### Dashboard with Week Calendar
- Full week view with time slots
- Click to book appointments
- Color-coded by service type

### Booking Flow
1. Select service, doctor (optional), and patient
2. Pick date from calendar, select time slot
3. Confirm booking details

## Deployment

### GitHub Secrets Required

| Secret | Description |
|--------|-------------|
| `GCP_PROJECT_ID` | GCP project ID |
| `WIF_PROVIDER` | Workload Identity Federation provider |
| `WIF_SERVICE_ACCOUNT` | GCP service account email |
| `NEON_DATABASE_URL` | Neon PostgreSQL connection string |
| `GOOGLE_CLIENT_ID` | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret |
| `JWT_SECRET` | JWT signing secret |

See [DESIGN.md](DESIGN.md) for full deployment guide.

## Development

```bash
# Run backend in watch mode
cd backend && pnpm start:dev

# Run frontend dev server
cd frontend && pnpm dev

# Type check
cd backend && pnpm build
cd frontend && pnpm build

# Lint
cd backend && pnpm lint
cd frontend && pnpm lint
```

## License

MIT
