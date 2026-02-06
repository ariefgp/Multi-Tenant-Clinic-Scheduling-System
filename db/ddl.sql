-- ============================================
-- Multi-Tenant Clinic Scheduling System DDL
-- ============================================

-- Extensions (must be first)
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- ============================================
-- CORE TABLES
-- ============================================

CREATE TABLE tenants (
    id              BIGSERIAL PRIMARY KEY,
    name            VARCHAR(255) NOT NULL,
    timezone        VARCHAR(50) NOT NULL DEFAULT 'Europe/Berlin',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

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

CREATE TABLE rooms (
    id              BIGSERIAL PRIMARY KEY,
    tenant_id       BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name            VARCHAR(100) NOT NULL,
    room_type       VARCHAR(50),
    is_active       BOOLEAN NOT NULL DEFAULT true,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_rooms_tenant ON rooms(tenant_id);

CREATE TABLE devices (
    id              BIGSERIAL PRIMARY KEY,
    tenant_id       BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name            VARCHAR(100) NOT NULL,
    device_type     VARCHAR(50) NOT NULL,
    is_active       BOOLEAN NOT NULL DEFAULT true,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_devices_tenant ON devices(tenant_id);

CREATE TABLE services (
    id                  BIGSERIAL PRIMARY KEY,
    tenant_id           BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name                VARCHAR(255) NOT NULL,
    duration_minutes    INTEGER NOT NULL CHECK (duration_minutes > 0),
    buffer_before_min   INTEGER NOT NULL DEFAULT 0 CHECK (buffer_before_min >= 0),
    buffer_after_min    INTEGER NOT NULL DEFAULT 0 CHECK (buffer_after_min >= 0),
    requires_room       BOOLEAN NOT NULL DEFAULT true,
    color               VARCHAR(7),
    is_active           BOOLEAN NOT NULL DEFAULT true,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_services_tenant ON services(tenant_id);

-- Junction tables with tenant_id for direct RLS (Fix #2)
CREATE TABLE service_doctors (
    service_id      BIGINT NOT NULL REFERENCES services(id) ON DELETE CASCADE,
    doctor_id       BIGINT NOT NULL REFERENCES doctors(id) ON DELETE CASCADE,
    tenant_id       BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    PRIMARY KEY (service_id, doctor_id)
);

CREATE TABLE service_devices (
    service_id      BIGINT NOT NULL REFERENCES services(id) ON DELETE CASCADE,
    device_id       BIGINT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
    tenant_id       BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    PRIMARY KEY (service_id, device_id)
);

-- ============================================
-- SCHEDULING TABLES
-- ============================================

-- Working hours: NO UNIQUE constraint to allow split shifts (Fix #1)
CREATE TABLE working_hours (
    id              BIGSERIAL PRIMARY KEY,
    tenant_id       BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    doctor_id       BIGINT NOT NULL REFERENCES doctors(id) ON DELETE CASCADE,
    day_of_week     SMALLINT NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
    start_time      TIME NOT NULL,
    end_time        TIME NOT NULL,
    CHECK (start_time < end_time)
);

CREATE INDEX idx_working_hours_doctor_day ON working_hours(tenant_id, doctor_id, day_of_week);

CREATE TABLE breaks (
    id              BIGSERIAL PRIMARY KEY,
    tenant_id       BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    doctor_id       BIGINT NOT NULL REFERENCES doctors(id) ON DELETE CASCADE,
    start_time      TIMESTAMPTZ NOT NULL,
    end_time        TIMESTAMPTZ NOT NULL,
    reason          VARCHAR(255),
    CHECK (start_time < end_time)
);

CREATE INDEX idx_breaks_doctor ON breaks(doctor_id, start_time);

-- ============================================
-- APPOINTMENTS
-- ============================================

CREATE TABLE appointments (
    id              BIGSERIAL PRIMARY KEY,
    tenant_id       BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    doctor_id       BIGINT NOT NULL REFERENCES doctors(id),
    patient_id      BIGINT NOT NULL REFERENCES patients(id),
    service_id      BIGINT NOT NULL REFERENCES services(id),
    room_id         BIGINT REFERENCES rooms(id),  -- nullable (Fix #3)
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

-- Prevent room double-booking, only when room_id IS NOT NULL (Fix #3)
ALTER TABLE appointments ADD CONSTRAINT no_room_overlap
    EXCLUDE USING gist (
        tenant_id WITH =,
        room_id WITH =,
        tstzrange(starts_at - buffer_before, ends_at + buffer_after) WITH &&
    ) WHERE (status NOT IN ('cancelled') AND room_id IS NOT NULL);

-- ============================================
-- APPOINTMENT DEVICES (Device conflict detection)
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
-- AUDIT LOG
-- ============================================

CREATE TABLE appointment_audit_log (
    id              BIGSERIAL PRIMARY KEY,
    tenant_id       BIGINT NOT NULL,
    appointment_id  BIGINT NOT NULL,
    action          VARCHAR(20) NOT NULL,
    changes         JSONB,
    performed_by    VARCHAR(100),
    performed_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_appointment ON appointment_audit_log(appointment_id);
CREATE INDEX idx_audit_tenant_time ON appointment_audit_log(tenant_id, performed_at DESC);

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================

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

-- Policies using direct tenant_id column
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

-- Direct RLS on junction tables using tenant_id (Fix #2 — no slow EXISTS subquery)
CREATE POLICY tenant_isolation_service_doctors ON service_doctors
    USING (tenant_id = current_setting('app.current_tenant', true)::BIGINT);

CREATE POLICY tenant_isolation_service_devices ON service_devices
    USING (tenant_id = current_setting('app.current_tenant', true)::BIGINT);

-- ============================================
-- USERS (Staff authentication)
-- ============================================

CREATE TABLE users (
    id              BIGSERIAL PRIMARY KEY,
    tenant_id       BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    email           VARCHAR(255) NOT NULL UNIQUE,
    google_id       VARCHAR(255) UNIQUE,
    name            VARCHAR(255) NOT NULL,
    picture         VARCHAR(512),
    role            VARCHAR(50) NOT NULL DEFAULT 'staff',
    is_active       BOOLEAN NOT NULL DEFAULT true,
    last_login_at   TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_users_tenant ON users(tenant_id);
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_google_id ON users(google_id);

ALTER TABLE users ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_users ON users
    USING (tenant_id = current_setting('app.current_tenant', true)::BIGINT);
