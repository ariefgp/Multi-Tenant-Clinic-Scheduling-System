# Clinic Scheduler Backend

NestJS API server for the Multi-Tenant Clinic Scheduling System.

## Tech Stack

- NestJS 11 with Fastify adapter
- Drizzle ORM with Neon PostgreSQL driver
- Passport JWT for authentication
- Google OAuth 2.0 for staff login
- Zod for validation

## Setup

### Install Dependencies

```bash
pnpm install
```

### Configure Environment

Create `.env.local` file:

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

### Run Development Server

```bash
pnpm start:dev
```

Server runs at http://localhost:3000. Swagger docs at http://localhost:3000/docs.

## Project Structure

```
src/
├── modules/
│   ├── auth/           Google OAuth + JWT authentication
│   │   ├── strategies/ JWT strategy
│   │   ├── guards/     Auth guards
│   │   ├── decorators/ @CurrentUser, @Public
│   │   ├── dto/        Response DTOs
│   │   ├── auth.service.ts
│   │   └── auth.controller.ts
│   ├── appointment/    CRUD + conflict checking
│   ├── availability/   Slot search algorithm
│   ├── doctor/
│   ├── patient/
│   ├── service/
│   ├── room/
│   └── device/
├── database/
│   ├── schema/         Drizzle table definitions
│   ├── database.module.ts
│   └── migrate.ts      Auto-migration on startup
└── common/
    ├── middleware/     Tenant ID middleware
    ├── guards/         Tenant guard
    └── filters/        Exception filters
```

## API Endpoints

### Authentication (Public)

```
GET  /api/auth/google          → Redirect to Google OAuth
GET  /api/auth/google/callback → Handle OAuth callback
POST /api/auth/refresh         → Refresh access token
```

### Authentication (JWT Required)

```
POST /api/auth/logout          → Logout
GET  /api/auth/me              → Get current user
```

### Resources (JWT + Tenant Required)

```
GET  /api/doctors              → List doctors
GET  /api/patients             → List patients
GET  /api/services             → List services
GET  /api/rooms                → List rooms
GET  /api/devices              → List devices
```

### Appointments (JWT + Tenant Required)

```
POST   /api/appointments       → Create appointment
GET    /api/appointments/:id   → Get appointment
PATCH  /api/appointments/:id   → Reschedule
DELETE /api/appointments/:id   → Cancel
GET    /api/schedule           → All appointments
GET    /api/doctors/:id/schedule → Doctor schedule
GET    /api/availability       → Search available slots
```

## Scripts

```bash
pnpm start:dev   # Development with hot reload
pnpm start:prod  # Production mode
pnpm build       # Build for production
pnpm lint        # Run ESLint
pnpm test        # Run tests
```

## Database

The database schema is automatically created on first startup. See `src/database/migrate.ts` for the migration logic.

Tables:
- tenants, users
- doctors, patients, rooms, devices
- services, service_doctors, service_devices
- working_hours, breaks
- appointments, appointment_devices, appointment_audit_log

## Authentication Flow

1. Frontend redirects to `/api/auth/google`
2. Backend redirects to Google consent screen
3. User authenticates with Google
4. Google redirects back with auth code
5. Backend exchanges code for tokens
6. Backend creates/updates user record
7. Backend generates JWT tokens
8. Backend redirects to frontend with tokens
