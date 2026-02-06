# Design Document: Multi-Tenant Clinic Scheduling System

## Architecture Overview

```
┌─────────────────┐     ┌──────────────────┐     ┌──────────────────┐
│    Frontend     │────▶│  Backend (API)   │────▶│ Neon PostgreSQL  │
│   React SPA     │     │  NestJS/Fastify  │     │   (Serverless)   │
│   FullCalendar  │     │  Drizzle ORM     │     │  Row Level Sec   │
│   shadcn/ui     │     │  Passport JWT    │     │                  │
└─────────────────┘     └──────────────────┘     └──────────────────┘
        │                       │
        │                       ├──▶ Google OAuth 2.0
        └─── Vite proxy ────────┘
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, TypeScript, TailwindCSS v4, TanStack Query, FullCalendar, shadcn/ui |
| Backend | NestJS 11, Fastify, Drizzle ORM, Passport JWT |
| Database | Neon PostgreSQL (serverless) |
| Validation | Zod |
| Authentication | Google OAuth 2.0, JWT (access + refresh tokens) |
| Deployment | GKE (Kubernetes), GitHub Actions CI/CD |
| Package Manager | pnpm |

## Authentication

### Google OAuth Flow

1. User clicks "Continue with Google" on login page
2. Frontend redirects to `/api/auth/google`
3. Backend redirects to Google OAuth consent screen
4. User authenticates with Google
5. Google redirects back to `/api/auth/google/callback` with auth code
6. Backend exchanges code for Google tokens
7. Backend fetches user profile from Google
8. Backend creates/updates user in database
9. Backend generates JWT access + refresh tokens
10. Backend redirects to frontend with tokens in URL params
11. Frontend stores tokens in localStorage
12. Frontend uses tokens for API requests

### JWT Token Strategy

- **Access Token**: 15 minutes expiry, used in Authorization header
- **Refresh Token**: 7 days expiry, used to get new access token
- **Auto-refresh**: API client intercepts 401 responses and attempts refresh

### Token Storage

Tokens stored in `localStorage` under `clinic_auth` key:
```typescript
interface StoredAuth {
  accessToken: string;
  refreshToken: string;
  user: User;
}
```

## Database Design

### Multi-Tenancy Strategy

Row Level Security (RLS) enforced at the database level. Every table includes a `tenant_id` column. A session variable `app.current_tenant` is set per-request via middleware, and RLS policies filter all queries automatically.

### Key Tables

- **tenants** — Clinic organizations
- **users** — Staff accounts (linked to Google OAuth)
- **doctors, patients, rooms, devices** — Core resources scoped by tenant
- **services** — Appointment types with duration, buffers, room requirements
- **service_doctors / service_devices** — Many-to-many with redundant `tenant_id` for efficient RLS
- **working_hours** — Doctor availability per weekday (supports split shifts)
- **breaks** — Doctor breaks
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

### Authentication Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | /api/auth/google | Public | Redirect to Google OAuth |
| GET | /api/auth/google/callback | Public | Handle OAuth callback |
| POST | /api/auth/refresh | Public | Refresh access token |
| POST | /api/auth/logout | JWT | Logout current user |
| GET | /api/auth/me | JWT | Get current user profile |

### Resource Endpoints

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
- `401` — Unauthorized (missing/invalid JWT)
- `404` — Resource not found
- `409` — Scheduling conflict (with detailed conflict info)

## Frontend Architecture

### Component Library: shadcn/ui

Using shadcn/ui for consistent, accessible components:
- Button, Card, Badge
- Dialog (modals)
- Select, Combobox (searchable dropdowns)
- Avatar, Separator
- Calendar (date picker)

### Layout Structure

```
DashboardLayout
├── Sidebar
│   ├── Logo
│   ├── Navigation links
│   └── Collapse toggle
├── Header
│   ├── Title
│   └── UserMenu (avatar + dropdown)
└── Main content area
```

### Pages

| Route | Component | Description |
|-------|-----------|-------------|
| /login | LoginPage | Google OAuth login |
| /auth/callback | AuthCallbackPage | Handle OAuth redirect |
| / | DashboardPage | Week calendar + booking |
| /patients | PatientsPage | Patient list |
| /doctors | DoctorsPage | Doctor list |
| /services | ServicesPage | Service list |
| /rooms | RoomsPage | Room list |
| * | NotFoundPage | 404 page |

### Key Components

1. **WeekCalendar** — FullCalendar time grid showing appointments
2. **BookingModal** — 3-step wizard:
   - Step 1: Select service/doctor/patient (searchable comboboxes)
   - Step 2: Pick date + time slot (cal.com-style)
   - Step 3: Confirm booking details
3. **AppointmentDetail** — View and manage appointment

### State Management

- **Server state**: TanStack Query for API data caching
- **Auth state**: React Context (AuthContext)
- **UI state**: React useState for local component state

### API Client

Axios-based client with:
- Base URL from `VITE_API_URL` or `/api` proxy
- Auto-attach `X-Tenant-Id` header
- Auto-attach `Authorization: Bearer {token}` header
- 401 interceptor for automatic token refresh
- Token refresh queue to handle concurrent requests

## Deployment

### Local Development

```bash
docker-compose up -d          # PostgreSQL with DDL + seed
cd backend && pnpm start:dev  # NestJS with hot reload
cd frontend && pnpm dev       # Vite dev server with API proxy
```

### Production (GKE)

- **Backend**: 2-5 pods (HPA at 70% CPU), ClusterIP service
- **Frontend**: 1 pod (nginx), LoadBalancer service
- **Database**: Neon PostgreSQL (external, serverless)
- **CI**: GitHub Actions on PRs (lint, test, build)
- **CD**: GitHub Actions on main (build images → push to Artifact Registry → deploy to GKE)
- **Auth**: Workload Identity Federation (no service account keys)

### Environment Variables

#### Backend

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string |
| `GOOGLE_CLIENT_ID` | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret |
| `GOOGLE_CALLBACK_URL` | OAuth callback URL |
| `JWT_SECRET` | JWT signing secret |
| `JWT_EXPIRES_IN` | Access token expiry (default: 15m) |
| `JWT_REFRESH_EXPIRES_IN` | Refresh token expiry (default: 7d) |
| `FRONTEND_URL` | Frontend URL for OAuth redirect |

#### Frontend

| Variable | Description |
|----------|-------------|
| `VITE_API_URL` | Backend API URL (production only) |

### Kubernetes Secrets

```bash
kubectl create secret generic backend-secrets \
  --from-literal=DATABASE_URL='...' \
  --from-literal=GOOGLE_CLIENT_ID='...' \
  --from-literal=GOOGLE_CLIENT_SECRET='...' \
  --from-literal=GOOGLE_CALLBACK_URL='...' \
  --from-literal=JWT_SECRET='...' \
  --from-literal=JWT_EXPIRES_IN='15m' \
  --from-literal=FRONTEND_URL='...' \
  -n clinic
```
