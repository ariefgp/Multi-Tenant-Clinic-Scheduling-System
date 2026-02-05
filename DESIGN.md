# Design Document: Multi-Tenant Clinic Scheduling System

## Architecture Overview

```
┌─────────────┐     ┌──────────────────┐     ┌──────────────────┐
│   Frontend   │────▶│   Backend (API)  │────▶│  Neon PostgreSQL │
│  React SPA   │     │  NestJS/Fastify  │     │   (Serverless)   │
│  TailwindCSS │     │  Drizzle ORM     │     │   Row Level Sec  │
└─────────────┘     └──────────────────┘     └──────────────────┘
       │                     │
       └─── Vite proxy ──────┘
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, TypeScript, TailwindCSS v4, TanStack Query |
| Backend | NestJS 11, Fastify, Drizzle ORM |
| Database | Neon PostgreSQL (serverless) |
| Validation | Zod |
| Deployment | GKE (Kubernetes), GitHub Actions CI/CD |
| Package Manager | pnpm |

## Database Design

### Multi-Tenancy Strategy

Row Level Security (RLS) enforced at the database level. Every table includes a `tenant_id` column. A session variable `app.current_tenant` is set per-request via middleware, and RLS policies filter all queries automatically.

### Key Tables

- **tenants** — Clinic organizations
- **doctors, patients, rooms, devices** — Core resources scoped by tenant
- **services** — Appointment types with duration, buffers, room requirements
- **service_doctors / service_devices** — Many-to-many with redundant `tenant_id` for efficient RLS
- **working_hours** — Doctor availability per weekday (supports split shifts)
- **breaks** — Resource-level breaks (doctor, room, device)
- **appointments** — Core scheduling with exclusion constraints
- **appointment_devices** — Device assignments with exclusion constraints
- **appointment_audit_log** — Event sourcing for all changes

### Conflict Prevention

Two layers of protection:

1. **Application-level pre-check** — `ConflictCheckerService` queries existing appointments for overlap before insert. Provides user-friendly error messages.

2. **Database-level exclusion constraints** — PostgreSQL `EXCLUDE USING gist` constraints on appointments (doctor, room) and appointment_devices (device). Catches race conditions from concurrent bookings.

```sql
ALTER TABLE appointments ADD CONSTRAINT no_doctor_overlap
    EXCLUDE USING gist (
        tenant_id WITH =, doctor_id WITH =,
        tstzrange(starts_at - buffer_before, ends_at + buffer_after) WITH &&
    ) WHERE (status NOT IN ('cancelled'));
```

### Design Decisions

| Decision | Rationale |
|----------|-----------|
| No UNIQUE on working_hours(doctor, weekday) | Allows split shifts (e.g., 08-12, 14-17) |
| tenant_id on junction tables | Direct RLS policy — avoids slow EXISTS subqueries |
| Nullable room_id on appointments | Services like phone consultations don't need a room |
| Exclusion constraint WHERE clause | Only active appointments block; cancelled ones don't |
| Interval type for buffers | PostgreSQL-native arithmetic with timestamps |

## API Design

RESTful API with global `/api` prefix. Tenant isolation via `X-Tenant-Id` header.

### Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | /api/health | Health check |
| GET | /api/tenants | List tenants |
| GET | /api/doctors | List active doctors |
| GET | /api/patients | List patients |
| GET | /api/services | List services with requirements |
| GET | /api/rooms | List active rooms |
| GET | /api/devices | List active devices |
| POST | /api/appointments | Create appointment |
| GET | /api/appointments/:id | Get appointment |
| PATCH | /api/appointments/:id | Reschedule appointment |
| DELETE | /api/appointments/:id | Cancel appointment |
| GET | /api/doctors/:id/schedule | Doctor schedule for date range |
| GET | /api/schedule | All appointments for date range |
| GET | /api/availability | Search available slots |

### Availability Algorithm

1. Load service requirements (duration, buffers, required doctors/devices)
2. Batch-load all data in parallel (appointments, working hours, breaks, rooms)
3. Build sorted busy-interval maps per resource
4. Iterate days → doctors → shifts → 15-min slots
5. Binary search for overlaps with skip-ahead optimization
6. Find first available room and required devices
7. Return up to `limit` valid slots

### Error Handling

- `400` — Validation errors (Zod)
- `401` — Missing X-Tenant-Id
- `404` — Resource not found
- `409` — Scheduling conflict (with detailed conflict info)

## Frontend Architecture

Single-page application with three main views:

1. **WeekCalendar** — Time grid showing appointments as colored blocks
2. **BookingModal** — 3-step wizard: select service/doctor/patient → pick slot → confirm
3. **AppointmentDetail** — View details and cancel

State management via TanStack Query (server state) and React useState (UI state).

## Deployment

### Local Development
```
docker-compose up -d          # PostgreSQL with DDL + seed
cd backend && pnpm start:dev  # NestJS with hot reload
cd frontend && pnpm dev       # Vite dev server with API proxy
```

### Production (GKE)
- Backend: 2-5 pods (HPA at 70% CPU), ClusterIP service
- Frontend: 1 pod (nginx), LoadBalancer service
- Database: Neon PostgreSQL (external, serverless)
- CI: GitHub Actions on PRs (lint, test, build)
- CD: GitHub Actions on main (build images → push to Artifact Registry → deploy to GKE)
- Auth: Workload Identity Federation (no service account keys)
