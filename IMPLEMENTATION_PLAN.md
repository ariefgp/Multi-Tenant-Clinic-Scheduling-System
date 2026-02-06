# Implementation Plan: Multi-Tenant Clinic Scheduling System

**Total Estimated Time:** 8-10 hours  
**Approach:** Vertical slices — each phase delivers working functionality

---

## Overview

```
Phase 1: Foundation (1.5 hrs)     → Database + Project setup
Phase 2: Core Backend (2.5 hrs)   → Appointments CRUD + Conflict detection
Phase 3: Availability (1.5 hrs)   → Search algorithm + API
Phase 4: Frontend (2 hrs)         → Calendar + Booking flow
Phase 5: Polish (1 hr)            → Tests, docs, seed data
```

---

## Phase 1: Foundation (1.5 hours)

### 1.1 Project Scaffolding (20 min)

```bash
# Directory structure
clinic-scheduler/
├── backend/
│   ├── src/
│   │   ├── modules/
│   │   │   ├── tenant/
│   │   │   ├── doctor/
│   │   │   ├── patient/
│   │   │   ├── service/
│   │   │   ├── room/
│   │   │   ├── device/
│   │   │   ├── appointment/
│   │   │   └── availability/
│   │   ├── common/
│   │   │   ├── guards/
│   │   │   ├── interceptors/
│   │   │   ├── decorators/
│   │   │   └── filters/
│   │   ├── database/
│   │   │   ├── schema/
│   │   │   ├── migrations/
│   │   │   └── seed/
│   │   └── main.ts
│   ├── test/
│   ├── package.json
│   └── tsconfig.json
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   ├── hooks/
│   │   ├── api/
│   │   ├── pages/
│   │   └── App.tsx
│   ├── package.json
│   └── vite.config.ts
├── db/
│   ├── ddl.sql
│   └── seed.sql
├── docker-compose.yml
├── DESIGN.md
├── README.md
└── .env.example
```

**Tasks:**
- [ ] Initialize NestJS project with TypeScript
- [ ] Initialize Vite + React + TypeScript project
- [ ] Create docker-compose.yml with PostgreSQL 16
- [ ] Setup environment variables structure
- [ ] Configure ESLint + Prettier for both projects

**Deliverable:** Both projects run locally, connect to PostgreSQL

---

### 1.2 Database Schema (40 min)

**File: `db/ddl.sql`**

```sql
-- ============================================
-- EXTENSIONS (must be first)
-- ============================================
CREATE EXTENSION IF NOT EXISTS btree_gist;  -- Required for exclusion constraints

-- ============================================
-- CORE TABLES
-- ============================================

-- Tenants (Clinics)
CREATE TABLE tenants (
    id              BIGSERIAL PRIMARY KEY,
    name            VARCHAR(255) NOT NULL,
    timezone        VARCHAR(50) NOT NULL DEFAULT 'Europe/Berlin',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Doctors
CREATE TABLE doctors (
    id              BIGSERIAL PRIMARY KEY,
    tenant_id       BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name            VARCHAR(255) NOT NULL,
    email           VARCHAR(255),
    specialty       VARCHAR(100),
    is_active       BOOLEAN NOT NULL DEFAULT true,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_doctors_tenant ON doctors(tenant_id);

-- Patients
CREATE TABLE patients (
    id              BIGSERIAL PRIMARY KEY,
    tenant_id       BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name            VARCHAR(255) NOT NULL,
    email           VARCHAR(255),
    phone           VARCHAR(50),
    date_of_birth   DATE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_patients_tenant ON patients(tenant_id);

-- Rooms
CREATE TABLE rooms (
    id              BIGSERIAL PRIMARY KEY,
    tenant_id       BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name            VARCHAR(100) NOT NULL,
    room_type       VARCHAR(50),  -- 'consultation', 'procedure', 'imaging'
    is_active       BOOLEAN NOT NULL DEFAULT true,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_rooms_tenant ON rooms(tenant_id);

-- Devices
CREATE TABLE devices (
    id              BIGSERIAL PRIMARY KEY,
    tenant_id       BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name            VARCHAR(100) NOT NULL,
    device_type     VARCHAR(50) NOT NULL,  -- 'xray', 'ultrasound', 'ecg'
    is_active       BOOLEAN NOT NULL DEFAULT true,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_devices_tenant ON devices(tenant_id);

-- Services
CREATE TABLE services (
    id                  BIGSERIAL PRIMARY KEY,
    tenant_id           BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name                VARCHAR(255) NOT NULL,
    duration_minutes    INTEGER NOT NULL CHECK (duration_minutes > 0),
    buffer_before_min   INTEGER NOT NULL DEFAULT 0 CHECK (buffer_before_min >= 0),
    buffer_after_min    INTEGER NOT NULL DEFAULT 0 CHECK (buffer_after_min >= 0),
    requires_room       BOOLEAN NOT NULL DEFAULT true,
    color               VARCHAR(7),  -- Hex color for calendar display
    is_active           BOOLEAN NOT NULL DEFAULT true,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_services_tenant ON services(tenant_id);

-- Service-Doctor mapping (which doctors can perform which services)
CREATE TABLE service_doctors (
    service_id      BIGINT NOT NULL REFERENCES services(id) ON DELETE CASCADE,
    doctor_id       BIGINT NOT NULL REFERENCES doctors(id) ON DELETE CASCADE,
    PRIMARY KEY (service_id, doctor_id)
);

-- Service-Device mapping (which devices a service requires)
CREATE TABLE service_devices (
    service_id      BIGINT NOT NULL REFERENCES services(id) ON DELETE CASCADE,
    device_id       BIGINT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
    PRIMARY KEY (service_id, device_id)
);

-- ============================================
-- SCHEDULING TABLES
-- ============================================

-- Working Hours (per doctor, per weekday)
CREATE TABLE working_hours (
    id              BIGSERIAL PRIMARY KEY,
    tenant_id       BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    doctor_id       BIGINT NOT NULL REFERENCES doctors(id) ON DELETE CASCADE,
    weekday         SMALLINT NOT NULL CHECK (weekday BETWEEN 0 AND 6),  -- 0=Sunday
    start_time      TIME NOT NULL,
    end_time        TIME NOT NULL,
    CHECK (start_time < end_time),
    UNIQUE (doctor_id, weekday)
);

CREATE INDEX idx_working_hours_doctor ON working_hours(tenant_id, doctor_id);

-- Breaks (for doctors, rooms, or devices)
CREATE TABLE breaks (
    id              BIGSERIAL PRIMARY KEY,
    tenant_id       BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    resource_type   VARCHAR(20) NOT NULL CHECK (resource_type IN ('doctor', 'room', 'device')),
    resource_id     BIGINT NOT NULL,
    starts_at       TIMESTAMPTZ NOT NULL,
    ends_at         TIMESTAMPTZ NOT NULL,
    reason          VARCHAR(255),
    CHECK (starts_at < ends_at)
);

CREATE INDEX idx_breaks_resource ON breaks(tenant_id, resource_type, resource_id, starts_at);

-- ============================================
-- APPOINTMENTS (Core table with exclusion constraints)
-- ============================================

CREATE TABLE appointments (
    id              BIGSERIAL PRIMARY KEY,
    tenant_id       BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    doctor_id       BIGINT NOT NULL REFERENCES doctors(id),
    patient_id      BIGINT NOT NULL REFERENCES patients(id),
    service_id      BIGINT NOT NULL REFERENCES services(id),
    room_id         BIGINT NOT NULL REFERENCES rooms(id),
    starts_at       TIMESTAMPTZ NOT NULL,
    ends_at         TIMESTAMPTZ NOT NULL,
    buffer_before   INTERVAL NOT NULL DEFAULT '0 minutes',
    buffer_after    INTERVAL NOT NULL DEFAULT '0 minutes',
    status          VARCHAR(20) NOT NULL DEFAULT 'scheduled' 
                    CHECK (status IN ('scheduled', 'confirmed', 'cancelled', 'completed', 'no_show')),
    notes           TEXT,
    version         INTEGER NOT NULL DEFAULT 1,
    idempotency_key VARCHAR(64) UNIQUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    CHECK (starts_at < ends_at)
);

-- Primary indexes for common queries
CREATE INDEX idx_appt_tenant_doctor_time ON appointments(tenant_id, doctor_id, starts_at);
CREATE INDEX idx_appt_tenant_room_time ON appointments(tenant_id, room_id, starts_at);
CREATE INDEX idx_appt_tenant_patient ON appointments(tenant_id, patient_id, starts_at DESC);
CREATE INDEX idx_appt_tenant_status ON appointments(tenant_id, status) WHERE status = 'scheduled';

-- ============================================
-- EXCLUSION CONSTRAINTS (Race condition prevention)
-- ============================================

-- Prevent doctor double-booking
ALTER TABLE appointments ADD CONSTRAINT no_doctor_overlap
    EXCLUDE USING gist (
        tenant_id WITH =,
        doctor_id WITH =,
        tstzrange(starts_at - buffer_before, ends_at + buffer_after) WITH &&
    ) WHERE (status NOT IN ('cancelled'));

-- Prevent room double-booking
ALTER TABLE appointments ADD CONSTRAINT no_room_overlap
    EXCLUDE USING gist (
        tenant_id WITH =,
        room_id WITH =,
        tstzrange(starts_at - buffer_before, ends_at + buffer_after) WITH &&
    ) WHERE (status NOT IN ('cancelled'));

-- ============================================
-- APPOINTMENT DEVICES (Junction table for device conflicts)
-- ============================================

CREATE TABLE appointment_devices (
    id              BIGSERIAL PRIMARY KEY,
    appointment_id  BIGINT NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
    device_id       BIGINT NOT NULL REFERENCES devices(id),
    tenant_id       BIGINT NOT NULL,
    starts_at       TIMESTAMPTZ NOT NULL,
    ends_at         TIMESTAMPTZ NOT NULL,
    UNIQUE (appointment_id, device_id)
);

-- Prevent device double-booking
ALTER TABLE appointment_devices ADD CONSTRAINT no_device_overlap
    EXCLUDE USING gist (
        tenant_id WITH =,
        device_id WITH =,
        tstzrange(starts_at, ends_at) WITH &&
    );

CREATE INDEX idx_appt_devices_device ON appointment_devices(tenant_id, device_id, starts_at);

-- ============================================
-- AUDIT LOG (Lightweight event sourcing)
-- ============================================

CREATE TABLE appointment_audit_log (
    id              BIGSERIAL PRIMARY KEY,
    tenant_id       BIGINT NOT NULL,
    appointment_id  BIGINT NOT NULL,
    action          VARCHAR(20) NOT NULL,  -- 'created', 'updated', 'cancelled', 'rescheduled'
    changes         JSONB,
    performed_by    VARCHAR(100),
    performed_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_appointment ON appointment_audit_log(appointment_id);
CREATE INDEX idx_audit_tenant_time ON appointment_audit_log(tenant_id, performed_at DESC);

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================

-- Enable RLS on all tenant-scoped tables
ALTER TABLE doctors ENABLE ROW LEVEL SECURITY;
ALTER TABLE patients ENABLE ROW LEVEL SECURITY;
ALTER TABLE rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE services ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_doctors ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE working_hours ENABLE ROW LEVEL SECURITY;
ALTER TABLE breaks ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointment_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointment_audit_log ENABLE ROW LEVEL SECURITY;

-- Create policies (example for appointments, repeat for others)
CREATE POLICY tenant_isolation_doctors ON doctors
    USING (tenant_id = current_setting('app.current_tenant', true)::BIGINT);

CREATE POLICY tenant_isolation_patients ON patients
    USING (tenant_id = current_setting('app.current_tenant', true)::BIGINT);

CREATE POLICY tenant_isolation_rooms ON rooms
    USING (tenant_id = current_setting('app.current_tenant', true)::BIGINT);

CREATE POLICY tenant_isolation_devices ON devices
    USING (tenant_id = current_setting('app.current_tenant', true)::BIGINT);

CREATE POLICY tenant_isolation_services ON services
    USING (tenant_id = current_setting('app.current_tenant', true)::BIGINT);

CREATE POLICY tenant_isolation_working_hours ON working_hours
    USING (tenant_id = current_setting('app.current_tenant', true)::BIGINT);

CREATE POLICY tenant_isolation_breaks ON breaks
    USING (tenant_id = current_setting('app.current_tenant', true)::BIGINT);

CREATE POLICY tenant_isolation_appointments ON appointments
    USING (tenant_id = current_setting('app.current_tenant', true)::BIGINT);

CREATE POLICY tenant_isolation_appointment_devices ON appointment_devices
    USING (tenant_id = current_setting('app.current_tenant', true)::BIGINT);

CREATE POLICY tenant_isolation_audit ON appointment_audit_log
    USING (tenant_id = current_setting('app.current_tenant', true)::BIGINT);

-- For service_doctors and service_devices, join through parent table
CREATE POLICY tenant_isolation_service_doctors ON service_doctors
    USING (EXISTS (
        SELECT 1 FROM services s 
        WHERE s.id = service_id 
        AND s.tenant_id = current_setting('app.current_tenant', true)::BIGINT
    ));

CREATE POLICY tenant_isolation_service_devices ON service_devices
    USING (EXISTS (
        SELECT 1 FROM services s 
        WHERE s.id = service_id 
        AND s.tenant_id = current_setting('app.current_tenant', true)::BIGINT
    ));

-- Create application user (not superuser, so RLS applies)
CREATE USER app_user WITH PASSWORD 'app_password';
GRANT ALL ON ALL TABLES IN SCHEMA public TO app_user;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO app_user;
```

**Tasks:**
- [ ] Create `db/ddl.sql` with all tables
- [ ] Add exclusion constraints for conflict detection
- [ ] Add RLS policies for all tables
- [ ] Add appropriate indexes
- [ ] Verify with `docker-compose up -d` and manual SQL testing

**Deliverable:** Database schema runs, exclusion constraints work

---

### 1.3 Backend Foundation (30 min)

**Tasks:**
- [ ] Install dependencies:
  ```bash
  npm install @nestjs/core @nestjs/common @nestjs/platform-fastify
  npm install drizzle-orm postgres
  npm install @nestjs/swagger swagger-ui-express
  npm install zod class-validator class-transformer
  npm install date-fns date-fns-tz
  npm install -D drizzle-kit @types/node typescript
  ```
- [ ] Configure Drizzle schema matching PostgreSQL tables
- [ ] Create database module with connection pool
- [ ] Create tenant middleware (sets `app.current_tenant`)
- [ ] Setup global exception filter for conflict errors
- [ ] Configure Swagger at `/docs`

**Key Code: Tenant Middleware**

```typescript
// src/common/middleware/tenant.middleware.ts
@Injectable()
export class TenantMiddleware implements NestMiddleware {
  constructor(private readonly db: DatabaseService) {}

  async use(req: Request, res: Response, next: NextFunction) {
    const tenantId = req.headers['x-tenant-id'] as string;
    
    if (!tenantId) {
      throw new UnauthorizedException('X-Tenant-Id header is required');
    }

    // Store in async local storage for use throughout request
    req['tenantId'] = parseInt(tenantId, 10);
    
    // Set PostgreSQL session variable for RLS
    await this.db.execute(
      sql`SELECT set_config('app.current_tenant', ${tenantId}, true)`
    );
    
    next();
  }
}
```

**Deliverable:** NestJS app starts, Swagger UI accessible at `/docs`

---

## Phase 2: Core Backend — Appointments (2.5 hours)

### 2.1 Domain Modules Setup (30 min)

Create basic CRUD for supporting entities (minimal, just what's needed):

```typescript
// Each module follows this structure:
// module.ts, controller.ts, service.ts, dto/, entities/

// Modules to create (minimal implementation):
- TenantModule     // Just for seed data verification
- DoctorModule     // GET /doctors, GET /doctors/:id
- PatientModule    // GET /patients, GET /patients/:id  
- ServiceModule    // GET /services (with doctor & device requirements)
- RoomModule       // GET /rooms
- DeviceModule     // GET /devices
```

**Tasks:**
- [ ] Create module structure for each domain
- [ ] Implement basic GET endpoints (no full CRUD needed)
- [ ] Add Swagger decorators for documentation
- [ ] Verify tenant isolation works via RLS

**Deliverable:** Can list doctors, patients, services, rooms, devices via API

---

### 2.2 Appointment Module — Create (60 min)

**File: `src/modules/appointment/dto/create-appointment.dto.ts`**

```typescript
import { z } from 'zod';

export const CreateAppointmentSchema = z.object({
  doctor_id: z.number().int().positive(),
  patient_id: z.number().int().positive(),
  service_id: z.number().int().positive(),
  room_id: z.number().int().positive(),
  device_ids: z.array(z.number().int().positive()).optional().default([]),
  starts_at: z.string().datetime({ offset: true }),  // ISO8601 with timezone
  idempotency_key: z.string().max(64).optional(),
});

export type CreateAppointmentDto = z.infer<typeof CreateAppointmentSchema>;
```

**File: `src/modules/appointment/appointment.service.ts`**

```typescript
@Injectable()
export class AppointmentService {
  constructor(
    private readonly db: DatabaseService,
    private readonly conflictChecker: ConflictCheckerService,
  ) {}

  async create(tenantId: number, dto: CreateAppointmentDto): Promise<Appointment> {
    // 1. Get service details (duration, buffers)
    const service = await this.getService(dto.service_id);
    
    // 2. Calculate end time
    const startsAt = new Date(dto.starts_at);
    const endsAt = addMinutes(startsAt, service.duration_minutes);
    
    // 3. Pre-check conflicts (for better error messages)
    const conflicts = await this.conflictChecker.findConflicts({
      tenantId,
      doctorId: dto.doctor_id,
      roomId: dto.room_id,
      deviceIds: dto.device_ids,
      startsAt,
      endsAt,
      bufferBefore: service.buffer_before_min,
      bufferAfter: service.buffer_after_min,
    });

    if (conflicts.length > 0) {
      throw new ConflictException({
        error: 'scheduling_conflict',
        message: 'The requested time slot conflicts with existing appointments',
        conflicts: conflicts.map(this.formatConflict),
      });
    }

    // 4. Insert with transaction (database constraint is the real guard)
    try {
      return await this.db.transaction(async (tx) => {
        // Insert appointment
        const [appointment] = await tx.insert(appointments).values({
          tenant_id: tenantId,
          doctor_id: dto.doctor_id,
          patient_id: dto.patient_id,
          service_id: dto.service_id,
          room_id: dto.room_id,
          starts_at: startsAt,
          ends_at: endsAt,
          buffer_before: `${service.buffer_before_min} minutes`,
          buffer_after: `${service.buffer_after_min} minutes`,
          idempotency_key: dto.idempotency_key,
        }).returning();

        // Insert device assignments
        if (dto.device_ids.length > 0) {
          await tx.insert(appointmentDevices).values(
            dto.device_ids.map(deviceId => ({
              appointment_id: appointment.id,
              device_id: deviceId,
              tenant_id: tenantId,
              starts_at: startsAt,
              ends_at: endsAt,
            }))
          );
        }

        // Log to audit trail
        await tx.insert(appointmentAuditLog).values({
          tenant_id: tenantId,
          appointment_id: appointment.id,
          action: 'created',
          changes: dto,
        });

        return appointment;
      });
    } catch (error) {
      // Handle exclusion constraint violation (race condition caught)
      if (error.code === '23P01') {
        const conflicts = await this.conflictChecker.findConflicts({...});
        throw new ConflictException({
          error: 'scheduling_conflict',
          message: 'Scheduling conflict detected (concurrent booking)',
          conflicts: conflicts.map(this.formatConflict),
        });
      }
      
      // Handle idempotency key duplicate
      if (error.code === '23505' && error.constraint?.includes('idempotency')) {
        const existing = await this.findByIdempotencyKey(dto.idempotency_key);
        return existing;
      }
      
      throw error;
    }
  }
}
```

**Tasks:**
- [ ] Create DTOs with Zod validation
- [ ] Implement `ConflictCheckerService` for pre-flight checks
- [ ] Implement `AppointmentService.create()` with transaction
- [ ] Handle exclusion constraint errors gracefully
- [ ] Implement idempotency key support
- [ ] Add audit log entry on creation

**Deliverable:** `POST /api/appointments` works, conflicts return 409

---

### 2.3 Appointment Module — Cancel & Read (30 min)

```typescript
// Cancel appointment (soft delete)
async cancel(tenantId: number, appointmentId: number): Promise<void> {
  const [updated] = await this.db
    .update(appointments)
    .set({ 
      status: 'cancelled',
      updated_at: new Date(),
    })
    .where(and(
      eq(appointments.tenant_id, tenantId),
      eq(appointments.id, appointmentId),
      ne(appointments.status, 'cancelled'),
    ))
    .returning();

  if (!updated) {
    throw new NotFoundException('Appointment not found or already cancelled');
  }

  await this.db.insert(appointmentAuditLog).values({
    tenant_id: tenantId,
    appointment_id: appointmentId,
    action: 'cancelled',
  });
}

// Get doctor's schedule
async getDoctorSchedule(
  tenantId: number,
  doctorId: number,
  from: Date,
  to: Date,
): Promise<Appointment[]> {
  return this.db
    .select()
    .from(appointments)
    .where(and(
      eq(appointments.tenant_id, tenantId),
      eq(appointments.doctor_id, doctorId),
      gte(appointments.starts_at, from),
      lte(appointments.starts_at, to),
      ne(appointments.status, 'cancelled'),
    ))
    .orderBy(appointments.starts_at);
}
```

**Tasks:**
- [ ] Implement `DELETE /api/appointments/:id` (soft delete)
- [ ] Implement `GET /api/doctors/:id/schedule?from=&to=`
- [ ] Add proper error responses (404, 409)
- [ ] Add Swagger documentation

**Deliverable:** Full CRUD for appointments working

---

### 2.4 Conflict Checker Service (30 min)

```typescript
// src/modules/appointment/services/conflict-checker.service.ts

interface ConflictCheckParams {
  tenantId: number;
  doctorId: number;
  roomId: number;
  deviceIds: number[];
  startsAt: Date;
  endsAt: Date;
  bufferBefore: number;
  bufferAfter: number;
  excludeAppointmentId?: number;  // For rescheduling
}

interface Conflict {
  resourceType: 'doctor' | 'room' | 'device';
  resourceId: number;
  resourceName: string;
  appointmentId: number;
  conflictingRange: { start: Date; end: Date };
}

@Injectable()
export class ConflictCheckerService {
  constructor(private readonly db: DatabaseService) {}

  async findConflicts(params: ConflictCheckParams): Promise<Conflict[]> {
    const conflicts: Conflict[] = [];
    
    const effectiveStart = subMinutes(params.startsAt, params.bufferBefore);
    const effectiveEnd = addMinutes(params.endsAt, params.bufferAfter);

    // Check doctor conflicts
    const doctorConflict = await this.db
      .select({
        id: appointments.id,
        starts_at: appointments.starts_at,
        ends_at: appointments.ends_at,
        doctor_name: doctors.name,
      })
      .from(appointments)
      .innerJoin(doctors, eq(doctors.id, appointments.doctor_id))
      .where(and(
        eq(appointments.tenant_id, params.tenantId),
        eq(appointments.doctor_id, params.doctorId),
        ne(appointments.status, 'cancelled'),
        params.excludeAppointmentId 
          ? ne(appointments.id, params.excludeAppointmentId) 
          : sql`true`,
        // Overlap check: NOT (new_end <= existing_start OR new_start >= existing_end)
        sql`tstzrange(${effectiveStart}, ${effectiveEnd}) && 
            tstzrange(${appointments.starts_at} - ${appointments.buffer_before}, 
                      ${appointments.ends_at} + ${appointments.buffer_after})`,
      ))
      .limit(1);

    if (doctorConflict.length > 0) {
      conflicts.push({
        resourceType: 'doctor',
        resourceId: params.doctorId,
        resourceName: doctorConflict[0].doctor_name,
        appointmentId: doctorConflict[0].id,
        conflictingRange: {
          start: doctorConflict[0].starts_at,
          end: doctorConflict[0].ends_at,
        },
      });
    }

    // Check room conflicts (similar pattern)
    // Check device conflicts (similar pattern)
    
    return conflicts;
  }
}
```

**Tasks:**
- [ ] Implement doctor conflict check
- [ ] Implement room conflict check
- [ ] Implement device conflict check (via junction table)
- [ ] Return detailed conflict information
- [ ] Unit test with edge cases (adjacent slots, buffer handling)

**Deliverable:** Conflict checker correctly identifies overlapping appointments

---

## Phase 3: Availability Search (1.5 hours)

### 3.1 Availability Algorithm (60 min)

```typescript
// src/modules/availability/availability.service.ts

interface AvailabilityParams {
  tenantId: number;
  serviceId: number;
  doctorIds?: number[];
  from: Date;
  to: Date;
  limit?: number;
}

interface AvailableSlot {
  doctorId: number;
  doctorName: string;
  roomId: number;
  roomName: string;
  deviceIds: number[];
  start: Date;
  end: Date;
}

@Injectable()
export class AvailabilityService {
  async findSlots(params: AvailabilityParams): Promise<AvailableSlot[]> {
    const { tenantId, serviceId, from, to, limit = 3 } = params;

    // 1. Get service requirements
    const service = await this.getServiceWithRequirements(serviceId);
    const slotDuration = service.duration_minutes;
    const bufferBefore = service.buffer_before_min;
    const bufferAfter = service.buffer_after_min;
    const totalDuration = bufferBefore + slotDuration + bufferAfter;

    // 2. Get eligible doctors
    const doctorIds = params.doctorIds?.length 
      ? params.doctorIds 
      : await this.getDoctorsForService(serviceId);

    // 3. Get all existing appointments in the time window
    const existingAppointments = await this.getAppointmentsInRange(
      tenantId, from, to
    );

    // 4. Build busy intervals per resource
    const doctorBusy = this.buildBusyIntervals(existingAppointments, 'doctor_id');
    const roomBusy = this.buildBusyIntervals(existingAppointments, 'room_id');
    const deviceBusy = await this.buildDeviceBusyIntervals(tenantId, from, to);

    // 5. Get working hours for each doctor
    const workingHours = await this.getWorkingHours(tenantId, doctorIds);

    // 6. Get breaks
    const breaks = await this.getBreaks(tenantId, from, to);

    // 7. Get available rooms and devices
    const rooms = await this.getRooms(tenantId);
    const requiredDevices = service.required_device_ids;

    // 8. Generate candidate slots and filter
    const slots: AvailableSlot[] = [];
    
    // Iterate through each day in the range
    for (let day = startOfDay(from); day <= to; day = addDays(day, 1)) {
      // For each doctor
      for (const doctorId of doctorIds) {
        const dayWorkingHours = workingHours.get(`${doctorId}-${getDay(day)}`);
        if (!dayWorkingHours) continue;

        // Generate time slots within working hours
        const dayStart = setTime(day, dayWorkingHours.start_time);
        const dayEnd = setTime(day, dayWorkingHours.end_time);

        for (
          let slotStart = dayStart;
          addMinutes(slotStart, totalDuration) <= dayEnd;
          slotStart = addMinutes(slotStart, 15)  // 15-min slot granularity
        ) {
          const slotEnd = addMinutes(slotStart, slotDuration);
          const effectiveStart = subMinutes(slotStart, bufferBefore);
          const effectiveEnd = addMinutes(slotEnd, bufferAfter);

          // Skip if outside requested range
          if (slotStart < from || slotEnd > to) continue;

          // Check doctor availability
          if (this.hasOverlap(doctorBusy.get(doctorId), effectiveStart, effectiveEnd)) {
            continue;
          }

          // Check doctor breaks
          if (this.hasBreakOverlap(breaks, 'doctor', doctorId, effectiveStart, effectiveEnd)) {
            continue;
          }

          // Find available room
          const availableRoom = rooms.find(room => 
            !this.hasOverlap(roomBusy.get(room.id), effectiveStart, effectiveEnd) &&
            !this.hasBreakOverlap(breaks, 'room', room.id, effectiveStart, effectiveEnd)
          );
          if (!availableRoom) continue;

          // Find available devices (if required)
          let availableDevices: number[] = [];
          if (requiredDevices.length > 0) {
            availableDevices = this.findAvailableDevices(
              requiredDevices, deviceBusy, effectiveStart, effectiveEnd
            );
            if (availableDevices.length < requiredDevices.length) continue;
          }

          // Valid slot found!
          slots.push({
            doctorId,
            doctorName: await this.getDoctorName(doctorId),
            roomId: availableRoom.id,
            roomName: availableRoom.name,
            deviceIds: availableDevices,
            start: slotStart,
            end: slotEnd,
          });

          if (slots.length >= limit) {
            return slots;
          }
        }
      }
    }

    return slots;
  }

  private buildBusyIntervals(
    appointments: Appointment[],
    resourceKey: string,
  ): Map<number, Interval[]> {
    const busyMap = new Map<number, Interval[]>();
    
    for (const appt of appointments) {
      const resourceId = appt[resourceKey];
      if (!busyMap.has(resourceId)) {
        busyMap.set(resourceId, []);
      }
      busyMap.get(resourceId)!.push({
        start: subMinutes(appt.starts_at, appt.buffer_before_min),
        end: addMinutes(appt.ends_at, appt.buffer_after_min),
      });
    }

    // Sort each list for binary search
    for (const [, intervals] of busyMap) {
      intervals.sort((a, b) => a.start.getTime() - b.start.getTime());
    }

    return busyMap;
  }

  private hasOverlap(intervals: Interval[] | undefined, start: Date, end: Date): boolean {
    if (!intervals || intervals.length === 0) return false;

    // Binary search for potential overlapping interval
    let left = 0;
    let right = intervals.length - 1;

    while (left <= right) {
      const mid = Math.floor((left + right) / 2);
      const interval = intervals[mid];

      if (interval.end <= start) {
        left = mid + 1;
      } else if (interval.start >= end) {
        right = mid - 1;
      } else {
        return true;  // Overlap found
      }
    }

    return false;
  }
}
```

**Tasks:**
- [ ] Implement `AvailabilityService` with the algorithm above
- [ ] Build efficient busy interval maps
- [ ] Implement binary search for overlap checking
- [ ] Handle working hours per doctor per weekday
- [ ] Handle breaks for all resource types
- [ ] Add comprehensive unit tests

**Deliverable:** Availability algorithm returns correct slots efficiently

---

### 3.2 Availability API Endpoint (30 min)

```typescript
// src/modules/availability/availability.controller.ts

@Controller('api/availability')
@ApiTags('Availability')
export class AvailabilityController {
  constructor(private readonly availabilityService: AvailabilityService) {}

  @Get()
  @ApiOperation({ summary: 'Find available appointment slots' })
  @ApiQuery({ name: 'service_id', type: Number, required: true })
  @ApiQuery({ name: 'from', type: String, required: true, description: 'ISO8601 datetime' })
  @ApiQuery({ name: 'to', type: String, required: true, description: 'ISO8601 datetime' })
  @ApiQuery({ name: 'doctor_ids', type: String, required: false, description: 'Comma-separated' })
  @ApiResponse({ status: 200, description: 'Available slots', type: AvailabilityResponseDto })
  async findSlots(
    @TenantId() tenantId: number,
    @Query('service_id', ParseIntPipe) serviceId: number,
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('doctor_ids') doctorIdsParam?: string,
  ): Promise<AvailabilityResponseDto> {
    const doctorIds = doctorIdsParam
      ? doctorIdsParam.split(',').map(id => parseInt(id, 10))
      : undefined;

    const slots = await this.availabilityService.findSlots({
      tenantId,
      serviceId,
      doctorIds,
      from: new Date(from),
      to: new Date(to),
      limit: 3,
    });

    return {
      slots: slots.map(slot => ({
        doctor_id: slot.doctorId,
        doctor_name: slot.doctorName,
        room_id: slot.roomId,
        room_name: slot.roomName,
        device_ids: slot.deviceIds,
        start: slot.start.toISOString(),
        end: slot.end.toISOString(),
      })),
      limit: 3,
    };
  }
}
```

**Tasks:**
- [ ] Create `GET /api/availability` endpoint
- [ ] Parse and validate query parameters
- [ ] Add Swagger documentation
- [ ] Test with various date ranges

**Deliverable:** `GET /api/availability` returns correct slots

---

## Phase 4: Frontend (2 hours)

### 4.1 Project Setup (20 min)

```bash
# Initialize Vite + React + TypeScript
npm create vite@latest frontend -- --template react-ts
cd frontend
npm install @tanstack/react-query @tanstack/react-query-devtools
npm install axios date-fns
npm install tailwindcss postcss autoprefixer
npm install lucide-react
npx tailwindcss init -p
```

**Tasks:**
- [ ] Initialize Vite project
- [ ] Configure TailwindCSS
- [ ] Setup TanStack Query provider
- [ ] Create API client with axios
- [ ] Add base layout component

**Deliverable:** React app runs with TailwindCSS styling

---

### 4.2 API Layer (20 min)

```typescript
// src/api/client.ts
import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:3000/api',
  headers: {
    'X-Tenant-Id': '1',  // Hardcoded for demo
  },
});

export default api;

// src/api/appointments.ts
export const appointmentsApi = {
  create: (data: CreateAppointmentRequest) => 
    api.post<Appointment>('/appointments', data),
  
  cancel: (id: number) => 
    api.delete(`/appointments/${id}`),
  
  getDoctorSchedule: (doctorId: number, from: string, to: string) =>
    api.get<Appointment[]>(`/doctors/${doctorId}/schedule`, { params: { from, to } }),
};

// src/api/availability.ts
export const availabilityApi = {
  search: (params: AvailabilityParams) =>
    api.get<AvailabilityResponse>('/availability', { params }),
};

// src/api/doctors.ts
export const doctorsApi = {
  list: () => api.get<Doctor[]>('/doctors'),
  get: (id: number) => api.get<Doctor>(`/doctors/${id}`),
};

// src/api/services.ts
export const servicesApi = {
  list: () => api.get<Service[]>('/services'),
};
```

**Tasks:**
- [ ] Create axios client with tenant header
- [ ] Create typed API functions for all endpoints
- [ ] Add request/response type definitions
- [ ] Handle error responses

**Deliverable:** API layer ready for use in components

---

### 4.3 Calendar Component (40 min)

```typescript
// src/components/Calendar/WeekCalendar.tsx
import { useMemo } from 'react';
import { 
  startOfWeek, endOfWeek, eachDayOfInterval, format, 
  eachHourOfInterval, setHours, isSameDay, isWithinInterval 
} from 'date-fns';

interface WeekCalendarProps {
  currentDate: Date;
  appointments: Appointment[];
  onSlotClick?: (date: Date, hour: number) => void;
  onAppointmentClick?: (appointment: Appointment) => void;
}

export function WeekCalendar({ 
  currentDate, 
  appointments, 
  onSlotClick,
  onAppointmentClick,
}: WeekCalendarProps) {
  const weekDays = useMemo(() => {
    const start = startOfWeek(currentDate, { weekStartsOn: 1 });
    const end = endOfWeek(currentDate, { weekStartsOn: 1 });
    return eachDayOfInterval({ start, end });
  }, [currentDate]);

  const hours = useMemo(() => {
    return Array.from({ length: 12 }, (_, i) => i + 8); // 8 AM to 7 PM
  }, []);

  const getAppointmentsForDay = (day: Date) => {
    return appointments.filter(apt => 
      isSameDay(new Date(apt.starts_at), day)
    );
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header with day names */}
      <div className="grid grid-cols-8 border-b">
        <div className="p-2 text-sm text-gray-500">Time</div>
        {weekDays.map(day => (
          <div key={day.toISOString()} className="p-2 text-center">
            <div className="text-sm text-gray-500">{format(day, 'EEE')}</div>
            <div className="text-lg font-semibold">{format(day, 'd')}</div>
          </div>
        ))}
      </div>

      {/* Time grid */}
      <div className="flex-1 overflow-auto">
        <div className="grid grid-cols-8">
          {hours.map(hour => (
            <>
              {/* Time label */}
              <div key={`time-${hour}`} className="p-2 text-sm text-gray-500 border-r">
                {format(setHours(new Date(), hour), 'h a')}
              </div>
              
              {/* Day cells */}
              {weekDays.map(day => {
                const dayAppointments = getAppointmentsForDay(day).filter(apt => {
                  const aptHour = new Date(apt.starts_at).getHours();
                  return aptHour === hour;
                });

                return (
                  <div
                    key={`${day.toISOString()}-${hour}`}
                    className="relative h-16 border-r border-b hover:bg-blue-50 cursor-pointer"
                    onClick={() => onSlotClick?.(day, hour)}
                  >
                    {dayAppointments.map(apt => (
                      <div
                        key={apt.id}
                        className="absolute inset-x-1 top-1 p-1 text-xs bg-blue-500 text-white rounded cursor-pointer hover:bg-blue-600"
                        style={{
                          height: `${(apt.duration_minutes / 60) * 64 - 8}px`,
                        }}
                        onClick={(e) => {
                          e.stopPropagation();
                          onAppointmentClick?.(apt);
                        }}
                      >
                        <div className="font-medium truncate">{apt.patient_name}</div>
                        <div className="truncate">{apt.service_name}</div>
                      </div>
                    ))}
                  </div>
                );
              })}
            </>
          ))}
        </div>
      </div>
    </div>
  );
}
```

**Tasks:**
- [ ] Create `WeekCalendar` component with time grid
- [ ] Display appointments as colored blocks
- [ ] Handle click events on slots and appointments
- [ ] Add week navigation (previous/next)
- [ ] Style with TailwindCSS

**Deliverable:** Calendar displays appointments visually

---

### 4.4 Booking Flow (40 min)

```typescript
// src/components/BookingModal/BookingModal.tsx
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

interface BookingModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialDate?: Date;
}

export function BookingModal({ isOpen, onClose, initialDate }: BookingModalProps) {
  const queryClient = useQueryClient();
  const [step, setStep] = useState<'select' | 'slots' | 'confirm'>('select');
  const [selectedService, setSelectedService] = useState<number | null>(null);
  const [selectedDoctor, setSelectedDoctor] = useState<number | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<AvailableSlot | null>(null);
  const [selectedPatient, setSelectedPatient] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Fetch services
  const { data: services } = useQuery({
    queryKey: ['services'],
    queryFn: () => servicesApi.list().then(r => r.data),
  });

  // Fetch doctors
  const { data: doctors } = useQuery({
    queryKey: ['doctors'],
    queryFn: () => doctorsApi.list().then(r => r.data),
  });

  // Fetch patients (simplified)
  const { data: patients } = useQuery({
    queryKey: ['patients'],
    queryFn: () => patientsApi.list().then(r => r.data),
  });

  // Fetch availability when service is selected
  const { data: availability, isLoading: isLoadingSlots } = useQuery({
    queryKey: ['availability', selectedService, selectedDoctor, initialDate],
    queryFn: () => availabilityApi.search({
      service_id: selectedService!,
      doctor_ids: selectedDoctor ? [selectedDoctor] : undefined,
      from: initialDate?.toISOString() || new Date().toISOString(),
      to: addDays(initialDate || new Date(), 7).toISOString(),
    }).then(r => r.data),
    enabled: !!selectedService && step === 'slots',
  });

  // Create appointment mutation
  const createMutation = useMutation({
    mutationFn: (data: CreateAppointmentRequest) => appointmentsApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['appointments'] });
      onClose();
    },
    onError: (error: AxiosError<ConflictError>) => {
      if (error.response?.status === 409) {
        setError(`Conflict: ${error.response.data.message}`);
        // Optionally show conflicting details
      } else {
        setError('Failed to create appointment');
      }
    },
  });

  const handleConfirm = () => {
    if (!selectedSlot || !selectedPatient) return;
    
    createMutation.mutate({
      doctor_id: selectedSlot.doctor_id,
      patient_id: selectedPatient,
      service_id: selectedService!,
      room_id: selectedSlot.room_id,
      device_ids: selectedSlot.device_ids,
      starts_at: selectedSlot.start,
    });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6">
        <h2 className="text-xl font-semibold mb-4">Book Appointment</h2>

        {step === 'select' && (
          <div className="space-y-4">
            {/* Service Selection */}
            <div>
              <label className="block text-sm font-medium mb-1">Service</label>
              <select
                className="w-full border rounded-md p-2"
                value={selectedService || ''}
                onChange={(e) => setSelectedService(Number(e.target.value))}
              >
                <option value="">Select a service</option>
                {services?.map(s => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.duration_minutes} min)
                  </option>
                ))}
              </select>
            </div>

            {/* Doctor Selection (optional) */}
            <div>
              <label className="block text-sm font-medium mb-1">Doctor (optional)</label>
              <select
                className="w-full border rounded-md p-2"
                value={selectedDoctor || ''}
                onChange={(e) => setSelectedDoctor(e.target.value ? Number(e.target.value) : null)}
              >
                <option value="">Any available doctor</option>
                {doctors?.map(d => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
            </div>

            {/* Patient Selection */}
            <div>
              <label className="block text-sm font-medium mb-1">Patient</label>
              <select
                className="w-full border rounded-md p-2"
                value={selectedPatient || ''}
                onChange={(e) => setSelectedPatient(Number(e.target.value))}
              >
                <option value="">Select a patient</option>
                {patients?.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>

            <button
              className="w-full bg-blue-500 text-white py-2 rounded-md hover:bg-blue-600 disabled:opacity-50"
              disabled={!selectedService || !selectedPatient}
              onClick={() => setStep('slots')}
            >
              Find Available Slots
            </button>
          </div>
        )}

        {step === 'slots' && (
          <div className="space-y-4">
            <h3 className="font-medium">Available Slots</h3>
            
            {isLoadingSlots && <p>Loading...</p>}
            
            {availability?.slots.length === 0 && (
              <p className="text-gray-500">No available slots found</p>
            )}

            <div className="space-y-2">
              {availability?.slots.map((slot, idx) => (
                <button
                  key={idx}
                  className={`w-full p-3 border rounded-md text-left hover:border-blue-500 ${
                    selectedSlot === slot ? 'border-blue-500 bg-blue-50' : ''
                  }`}
                  onClick={() => setSelectedSlot(slot)}
                >
                  <div className="font-medium">
                    {format(new Date(slot.start), 'EEE, MMM d')} at {format(new Date(slot.start), 'h:mm a')}
                  </div>
                  <div className="text-sm text-gray-500">
                    Dr. {slot.doctor_name} • Room {slot.room_name}
                  </div>
                </button>
              ))}
            </div>

            <div className="flex gap-2">
              <button
                className="flex-1 border py-2 rounded-md hover:bg-gray-50"
                onClick={() => setStep('select')}
              >
                Back
              </button>
              <button
                className="flex-1 bg-blue-500 text-white py-2 rounded-md hover:bg-blue-600 disabled:opacity-50"
                disabled={!selectedSlot}
                onClick={() => setStep('confirm')}
              >
                Continue
              </button>
            </div>
          </div>
        )}

        {step === 'confirm' && (
          <div className="space-y-4">
            <h3 className="font-medium">Confirm Booking</h3>
            
            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-md text-red-700">
                {error}
              </div>
            )}

            <div className="p-4 bg-gray-50 rounded-md space-y-2">
              <p><strong>Service:</strong> {services?.find(s => s.id === selectedService)?.name}</p>
              <p><strong>Doctor:</strong> {selectedSlot?.doctor_name}</p>
              <p><strong>Date:</strong> {format(new Date(selectedSlot!.start), 'EEEE, MMMM d, yyyy')}</p>
              <p><strong>Time:</strong> {format(new Date(selectedSlot!.start), 'h:mm a')} - {format(new Date(selectedSlot!.end), 'h:mm a')}</p>
              <p><strong>Room:</strong> {selectedSlot?.room_name}</p>
            </div>

            <div className="flex gap-2">
              <button
                className="flex-1 border py-2 rounded-md hover:bg-gray-50"
                onClick={() => setStep('slots')}
              >
                Back
              </button>
              <button
                className="flex-1 bg-green-500 text-white py-2 rounded-md hover:bg-green-600 disabled:opacity-50"
                disabled={createMutation.isPending}
                onClick={handleConfirm}
              >
                {createMutation.isPending ? 'Booking...' : 'Confirm Booking'}
              </button>
            </div>
          </div>
        )}

        <button
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-600"
          onClick={onClose}
        >
          ✕
        </button>
      </div>
    </div>
  );
}
```

**Tasks:**
- [ ] Create multi-step booking modal
- [ ] Implement service/doctor selection
- [ ] Display available slots from API
- [ ] Handle 409 conflict errors gracefully
- [ ] Refresh calendar after successful booking

**Deliverable:** Complete booking flow working end-to-end

---

## Phase 5: Polish (1 hour)

### 5.1 Tests (30 min)

**Key tests to write:**

```typescript
// backend/test/conflict-detection.spec.ts
describe('ConflictDetection', () => {
  it('should detect overlapping doctor appointments', async () => {
    // Create appointment at 9:00 - 9:30
    // Try to create at 9:15 - 9:45
    // Expect conflict
  });

  it('should allow adjacent appointments', async () => {
    // Create appointment at 9:00 - 9:30
    // Create appointment at 9:30 - 10:00
    // Should succeed (closed-open interval)
  });

  it('should include buffers in conflict detection', async () => {
    // Service has 10-min buffer after
    // Create appointment at 9:00 - 9:30 (effective 9:00 - 9:40)
    // Try to create at 9:35 - 10:00
    // Expect conflict
  });

  it('should handle race conditions via database constraint', async () => {
    // Simulate two concurrent requests for same slot
    // Only one should succeed
  });
});

// backend/test/availability.spec.ts
describe('AvailabilitySearch', () => {
  it('should return slots within working hours only', async () => {});
  it('should respect doctor breaks', async () => {});
  it('should find available room for each slot', async () => {});
  it('should return at most 3 slots', async () => {});
});
```

**Tasks:**
- [ ] Write conflict detection unit tests
- [ ] Write availability search tests
- [ ] Write integration test for concurrent booking
- [ ] Aim for 80%+ coverage on critical paths

**Deliverable:** Test suite passes, critical paths covered

---

### 5.2 Seed Data (15 min)

```sql
-- db/seed.sql

-- Tenant
INSERT INTO tenants (id, name, timezone) VALUES 
  (1, 'Berlin Medical Center', 'Europe/Berlin');

-- Doctors
INSERT INTO doctors (id, tenant_id, name, email, specialty) VALUES
  (101, 1, 'Dr. Anna Schmidt', 'anna.schmidt@bmc.de', 'General Practice'),
  (102, 1, 'Dr. Hans Weber', 'hans.weber@bmc.de', 'Cardiology'),
  (103, 1, 'Dr. Maria Müller', 'maria.mueller@bmc.de', 'Dermatology');

-- Patients
INSERT INTO patients (id, tenant_id, name, email, phone) VALUES
  (501, 1, 'Max Mustermann', 'max@example.com', '+49 30 12345678'),
  (502, 1, 'Erika Musterfrau', 'erika@example.com', '+49 30 87654321'),
  (503, 1, 'John Smith', 'john@example.com', '+49 30 11223344');

-- Rooms
INSERT INTO rooms (id, tenant_id, name, room_type) VALUES
  (11, 1, 'Room 101', 'consultation'),
  (12, 1, 'Room 102', 'consultation'),
  (13, 1, 'Room 103', 'procedure'),
  (14, 1, 'Imaging Room', 'imaging');

-- Devices
INSERT INTO devices (id, tenant_id, name, device_type) VALUES
  (21, 1, 'ECG Machine 1', 'ecg'),
  (22, 1, 'Ultrasound 1', 'ultrasound'),
  (23, 1, 'X-Ray Machine', 'xray');

-- Services
INSERT INTO services (id, tenant_id, name, duration_minutes, buffer_before_min, buffer_after_min, color) VALUES
  (1, 1, 'General Consultation', 30, 5, 5, '#3B82F6'),
  (2, 1, 'ECG Examination', 45, 5, 10, '#10B981'),
  (3, 1, 'Skin Check', 20, 0, 5, '#F59E0B'),
  (4, 1, 'Ultrasound', 30, 5, 10, '#8B5CF6');

-- Service-Doctor mappings
INSERT INTO service_doctors (service_id, doctor_id) VALUES
  (1, 101), (1, 102), (1, 103),  -- All doctors do general consultation
  (2, 102),                       -- Only cardiologist does ECG
  (3, 103),                       -- Only dermatologist does skin check
  (4, 101), (4, 102);             -- GP and cardiologist do ultrasound

-- Service-Device mappings
INSERT INTO service_devices (service_id, device_id) VALUES
  (2, 21),  -- ECG needs ECG machine
  (4, 22);  -- Ultrasound needs ultrasound machine

-- Working hours (Mon-Fri, 8:00-17:00)
INSERT INTO working_hours (tenant_id, doctor_id, weekday, start_time, end_time)
SELECT 1, d.id, w.day, '08:00'::TIME, '17:00'::TIME
FROM doctors d
CROSS JOIN (SELECT generate_series(1, 5) AS day) w
WHERE d.tenant_id = 1;

-- Some existing appointments (for testing)
INSERT INTO appointments (tenant_id, doctor_id, patient_id, service_id, room_id, starts_at, ends_at, buffer_before, buffer_after) VALUES
  (1, 101, 501, 1, 11, '2025-09-15 09:00:00+02', '2025-09-15 09:30:00+02', '5 minutes', '5 minutes'),
  (1, 101, 502, 1, 11, '2025-09-15 10:00:00+02', '2025-09-15 10:30:00+02', '5 minutes', '5 minutes'),
  (1, 102, 503, 2, 12, '2025-09-15 09:00:00+02', '2025-09-15 09:45:00+02', '5 minutes', '10 minutes');

-- Set tenant context for RLS (run before queries in app)
-- SELECT set_config('app.current_tenant', '1', false);
```

**Tasks:**
- [ ] Create realistic seed data
- [ ] Include various services with different requirements
- [ ] Add some existing appointments for conflict testing
- [ ] Document how to reset database

**Deliverable:** Fresh database has useful test data

---

### 5.3 Documentation & Final Polish (15 min)

**README.md structure:**

```markdown
# Clinic Scheduling System

## Quick Start

```bash
# Start PostgreSQL
docker-compose up -d

# Setup database
psql -h localhost -U postgres -d clinic -f db/ddl.sql
psql -h localhost -U postgres -d clinic -f db/seed.sql

# Start backend
cd backend && npm install && npm run start:dev

# Start frontend
cd frontend && npm install && npm run dev
```

## API Documentation

Visit http://localhost:3000/docs for Swagger UI.

## Sample Requests

```bash
# Create appointment
curl -X POST http://localhost:3000/api/appointments \
  -H "Content-Type: application/json" \
  -H "X-Tenant-Id: 1" \
  -d '{
    "doctor_id": 101,
    "patient_id": 501,
    "service_id": 1,
    "room_id": 11,
    "starts_at": "2025-09-15T11:00:00+02:00"
  }'

# Search availability
curl "http://localhost:3000/api/availability?service_id=1&from=2025-09-15T08:00:00%2B02:00&to=2025-09-16T18:00:00%2B02:00" \
  -H "X-Tenant-Id: 1"
```
```

**Tasks:**
- [ ] Write comprehensive README
- [ ] Add `.http` file for API testing
- [ ] Ensure Swagger docs are complete
- [ ] Final linting pass
- [ ] Test full flow end-to-end

**Deliverable:** Project is ready for submission

---

## Implementation Checklist Summary

### Phase 1: Foundation ✓
- [ ] Project scaffolding
- [ ] Database schema with exclusion constraints
- [ ] NestJS with Drizzle + tenant middleware

### Phase 2: Core Backend ✓
- [ ] CRUD endpoints for supporting entities
- [ ] Appointment creation with conflict detection
- [ ] Cancel and schedule endpoints
- [ ] Conflict checker service

### Phase 3: Availability ✓
- [ ] Availability search algorithm
- [ ] GET /api/availability endpoint

### Phase 4: Frontend ✓
- [ ] Calendar component
- [ ] Booking flow modal
- [ ] API integration

### Phase 5: Polish ✓
- [ ] Unit and integration tests
- [ ] Seed data
- [ ] Documentation

---

## Time Tracking Template

| Phase | Estimated | Actual | Notes |
|-------|-----------|--------|-------|
| 1.1 Scaffolding | 20 min | | |
| 1.2 Database | 40 min | | |
| 1.3 Backend Foundation | 30 min | | |
| 2.1 Domain Modules | 30 min | | |
| 2.2 Create Appointment | 60 min | | |
| 2.3 Cancel & Read | 30 min | | |
| 2.4 Conflict Checker | 30 min | | |
| 3.1 Availability Algorithm | 60 min | | |
| 3.2 Availability API | 30 min | | |
| 4.1 Frontend Setup | 20 min | | |
| 4.2 API Layer | 20 min | | |
| 4.3 Calendar | 40 min | | |
| 4.4 Booking Flow | 40 min | | |
| 5.1 Tests | 30 min | | |
| 5.2 Seed Data | 15 min | | |
| 5.3 Documentation | 15 min | | |
| **Total** | **8.5 hrs** | | |

---

## Risk Mitigations

| Risk | Mitigation |
|------|------------|
| Exclusion constraints don't work | Test manually in psql first before building service |
| RLS breaks queries | Create test user early, verify policies work |
| Availability too slow | Keep algorithm simple first, optimize only if needed |
| Frontend takes too long | Use minimal styling, focus on functionality |
| Running out of time | Skip device conflicts (simplify to doctor + room only) |

---

## What to Skip If Running Short on Time

**Must have (non-negotiable):**
- Exclusion constraints
- Basic conflict detection
- Availability returning valid slots
- Working booking flow

**Nice to have (skip if needed):**
- Device conflicts (just doctor + room)
- Audit log
- Idempotency keys
- Breaks handling
- Week navigation in calendar
- Comprehensive tests (just write the critical concurrent booking test)

---

Good luck! 🚀
