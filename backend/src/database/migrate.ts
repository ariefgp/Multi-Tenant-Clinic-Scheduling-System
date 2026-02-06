import { neon } from '@neondatabase/serverless';
import * as dotenv from 'dotenv';

// Load env files
dotenv.config({ path: '.env.local' });
dotenv.config({ path: '../.env.local' });
dotenv.config({ path: '.env' });

export async function runMigrations(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    console.error('DATABASE_URL not found');
    throw new Error('DATABASE_URL environment variable is required');
  }

  console.log('Checking database schema...');

  const sql = neon(databaseUrl);

  // Helper to check if a table exists
  const tableExists = async (tableName: string): Promise<boolean> => {
    const result = await sql`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_name = ${tableName}
      ) as exists
    `;
    return result[0]?.exists === true;
  };

  console.log('Checking/creating database schema...');

  // Enable btree_gist extension for exclusion constraints
  await sql`CREATE EXTENSION IF NOT EXISTS btree_gist`;

  // Create tables incrementally (only if they don't exist)
  if (!(await tableExists('tenants'))) {
    console.log('Creating tenants table...');
    await sql`
      CREATE TABLE tenants (
        id BIGSERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        slug VARCHAR(100) NOT NULL UNIQUE,
        timezone VARCHAR(50) NOT NULL DEFAULT 'UTC',
        is_active BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `;
  }

  // Legacy migration: ensure tenants table has new columns
  await sql`
    ALTER TABLE tenants
    ADD COLUMN IF NOT EXISTS slug VARCHAR(100),
    ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true
  `;
  // Add unique constraint on slug if not exists
  await sql`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'tenants_slug_unique'
      ) THEN
        -- Update existing rows to have unique slugs
        UPDATE tenants SET slug = 'tenant-' || id WHERE slug IS NULL;
        -- Add unique constraint
        ALTER TABLE tenants ADD CONSTRAINT tenants_slug_unique UNIQUE (slug);
      END IF;
    END $$
  `;

  if (!(await tableExists('doctors'))) {
    console.log('Creating doctors table...');
    await sql`
      CREATE TABLE doctors (
        id BIGSERIAL PRIMARY KEY,
        tenant_id BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255),
        phone VARCHAR(50),
        specialty VARCHAR(100),
        is_active BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `;
  } else {
    // Legacy migration: add phone column if not exists
    await sql`ALTER TABLE doctors ADD COLUMN IF NOT EXISTS phone VARCHAR(50)`;
  }

  if (!(await tableExists('patients'))) {
    console.log('Creating patients table...');
    await sql`
      CREATE TABLE patients (
        id BIGSERIAL PRIMARY KEY,
        tenant_id BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255),
        phone VARCHAR(50),
        date_of_birth DATE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `;
  }

  if (!(await tableExists('rooms'))) {
    console.log('Creating rooms table...');
    await sql`
      CREATE TABLE rooms (
        id BIGSERIAL PRIMARY KEY,
        tenant_id BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        name VARCHAR(100) NOT NULL,
        room_type VARCHAR(50),
        is_active BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `;
  }

  if (!(await tableExists('devices'))) {
    console.log('Creating devices table...');
    await sql`
      CREATE TABLE devices (
        id BIGSERIAL PRIMARY KEY,
        tenant_id BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        name VARCHAR(100) NOT NULL,
        device_type VARCHAR(50),
        is_active BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `;
  }

  if (!(await tableExists('services'))) {
    console.log('Creating services table...');
    await sql`
      CREATE TABLE services (
        id BIGSERIAL PRIMARY KEY,
        tenant_id BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        duration_minutes INT NOT NULL DEFAULT 30,
        buffer_before_min INT NOT NULL DEFAULT 0,
        buffer_after_min INT NOT NULL DEFAULT 0,
        requires_room BOOLEAN NOT NULL DEFAULT true,
        color VARCHAR(7),
        is_active BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `;
  }

  if (!(await tableExists('service_doctors'))) {
    console.log('Creating service_doctors table...');
    await sql`
      CREATE TABLE service_doctors (
        service_id BIGINT NOT NULL REFERENCES services(id) ON DELETE CASCADE,
        doctor_id BIGINT NOT NULL REFERENCES doctors(id) ON DELETE CASCADE,
        tenant_id BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        PRIMARY KEY (service_id, doctor_id)
      )
    `;
  }

  if (!(await tableExists('service_devices'))) {
    console.log('Creating service_devices table...');
    await sql`
      CREATE TABLE service_devices (
        service_id BIGINT NOT NULL REFERENCES services(id) ON DELETE CASCADE,
        device_id BIGINT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
        tenant_id BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        PRIMARY KEY (service_id, device_id)
      )
    `;
  }

  if (!(await tableExists('working_hours'))) {
    console.log('Creating working_hours table...');
    await sql`
      CREATE TABLE working_hours (
        id BIGSERIAL PRIMARY KEY,
        tenant_id BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        doctor_id BIGINT NOT NULL REFERENCES doctors(id) ON DELETE CASCADE,
        day_of_week SMALLINT NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
        start_time TIME NOT NULL,
        end_time TIME NOT NULL,
        UNIQUE(doctor_id, day_of_week, start_time)
      )
    `;
  }

  if (!(await tableExists('breaks'))) {
    console.log('Creating breaks table...');
    await sql`
      CREATE TABLE breaks (
        id BIGSERIAL PRIMARY KEY,
        tenant_id BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        doctor_id BIGINT NOT NULL REFERENCES doctors(id) ON DELETE CASCADE,
        start_time TIMESTAMPTZ NOT NULL,
        end_time TIMESTAMPTZ NOT NULL,
        reason VARCHAR(255)
      )
    `;
  }

  if (!(await tableExists('appointments'))) {
    console.log('Creating appointments table...');
    await sql`
      CREATE TABLE appointments (
        id BIGSERIAL PRIMARY KEY,
        tenant_id BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        doctor_id BIGINT NOT NULL REFERENCES doctors(id),
        patient_id BIGINT NOT NULL REFERENCES patients(id),
        service_id BIGINT NOT NULL REFERENCES services(id),
        room_id BIGINT REFERENCES rooms(id),
        starts_at TIMESTAMPTZ NOT NULL,
        ends_at TIMESTAMPTZ NOT NULL,
        buffer_before INTERVAL NOT NULL DEFAULT '0 minutes',
        buffer_after INTERVAL NOT NULL DEFAULT '0 minutes',
        status VARCHAR(20) NOT NULL DEFAULT 'scheduled',
        notes TEXT,
        version INT NOT NULL DEFAULT 1,
        idempotency_key VARCHAR(64) UNIQUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `;
  }

  if (!(await tableExists('appointment_devices'))) {
    console.log('Creating appointment_devices table...');
    await sql`
      CREATE TABLE appointment_devices (
        id BIGSERIAL PRIMARY KEY,
        appointment_id BIGINT NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
        device_id BIGINT NOT NULL REFERENCES devices(id),
        tenant_id BIGINT NOT NULL,
        starts_at TIMESTAMPTZ NOT NULL,
        ends_at TIMESTAMPTZ NOT NULL,
        UNIQUE(appointment_id, device_id)
      )
    `;
  }

  if (!(await tableExists('appointment_audit_log'))) {
    console.log('Creating appointment_audit_log table...');
    await sql`
      CREATE TABLE appointment_audit_log (
        id BIGSERIAL PRIMARY KEY,
        tenant_id BIGINT NOT NULL,
        appointment_id BIGINT NOT NULL,
        action VARCHAR(20) NOT NULL,
        changes JSONB,
        performed_by VARCHAR(100),
        performed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `;
  }

  if (!(await tableExists('users'))) {
    console.log('Creating users table...');
    await sql`
      CREATE TABLE users (
        id BIGSERIAL PRIMARY KEY,
        tenant_id BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        email VARCHAR(255) NOT NULL UNIQUE,
        google_id VARCHAR(255) UNIQUE,
        name VARCHAR(255) NOT NULL,
        picture VARCHAR(512),
        role VARCHAR(50) NOT NULL DEFAULT 'staff',
        is_active BOOLEAN NOT NULL DEFAULT true,
        last_login_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `;
  }

  console.log('All tables created/verified');

  // Create indexes (IF NOT EXISTS handles idempotency)
  console.log('Creating indexes...');
  await sql`CREATE INDEX IF NOT EXISTS idx_doctors_tenant ON doctors(tenant_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_patients_tenant ON patients(tenant_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_rooms_tenant ON rooms(tenant_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_devices_tenant ON devices(tenant_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_services_tenant ON services(tenant_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_working_hours_doctor ON working_hours(doctor_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_breaks_doctor ON breaks(doctor_id, start_time)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_appt_tenant_doctor_time ON appointments(tenant_id, doctor_id, starts_at)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_appt_tenant_room_time ON appointments(tenant_id, room_id, starts_at)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_appt_tenant_patient ON appointments(tenant_id, patient_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_appt_devices_device ON appointment_devices(tenant_id, device_id, starts_at)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_users_tenant ON users(tenant_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_users_google_id ON users(google_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_audit_appointment ON appointment_audit_log(appointment_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_audit_tenant_time ON appointment_audit_log(tenant_id, performed_at DESC)`;

  // Create exclusion constraints for race condition prevention
  console.log('Creating exclusion constraints...');

  // Prevent doctor double-booking (with buffers)
  await sql`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'no_doctor_overlap'
      ) THEN
        ALTER TABLE appointments ADD CONSTRAINT no_doctor_overlap
        EXCLUDE USING gist (
          tenant_id WITH =,
          doctor_id WITH =,
          tstzrange(starts_at - buffer_before, ends_at + buffer_after) WITH &&
        ) WHERE (status NOT IN ('cancelled'));
      END IF;
    END $$
  `;

  // Prevent room double-booking (only when room_id is not null)
  await sql`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'no_room_overlap'
      ) THEN
        ALTER TABLE appointments ADD CONSTRAINT no_room_overlap
        EXCLUDE USING gist (
          tenant_id WITH =,
          room_id WITH =,
          tstzrange(starts_at - buffer_before, ends_at + buffer_after) WITH &&
        ) WHERE (status NOT IN ('cancelled') AND room_id IS NOT NULL);
      END IF;
    END $$
  `;

  // Prevent device double-booking
  await sql`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'no_device_overlap'
      ) THEN
        ALTER TABLE appointment_devices ADD CONSTRAINT no_device_overlap
        EXCLUDE USING gist (
          tenant_id WITH =,
          device_id WITH =,
          tstzrange(starts_at, ends_at) WITH &&
        );
      END IF;
    END $$
  `;

  console.log('Exclusion constraints created');

  // Enable Row Level Security
  console.log('Enabling Row Level Security...');

  await sql`ALTER TABLE doctors ENABLE ROW LEVEL SECURITY`;
  await sql`ALTER TABLE patients ENABLE ROW LEVEL SECURITY`;
  await sql`ALTER TABLE rooms ENABLE ROW LEVEL SECURITY`;
  await sql`ALTER TABLE devices ENABLE ROW LEVEL SECURITY`;
  await sql`ALTER TABLE services ENABLE ROW LEVEL SECURITY`;
  await sql`ALTER TABLE service_doctors ENABLE ROW LEVEL SECURITY`;
  await sql`ALTER TABLE service_devices ENABLE ROW LEVEL SECURITY`;
  await sql`ALTER TABLE working_hours ENABLE ROW LEVEL SECURITY`;
  await sql`ALTER TABLE breaks ENABLE ROW LEVEL SECURITY`;
  await sql`ALTER TABLE appointments ENABLE ROW LEVEL SECURITY`;
  await sql`ALTER TABLE appointment_devices ENABLE ROW LEVEL SECURITY`;
  await sql`ALTER TABLE appointment_audit_log ENABLE ROW LEVEL SECURITY`;
  await sql`ALTER TABLE users ENABLE ROW LEVEL SECURITY`;

  // Create RLS policies using tenant_id column
  // Note: These policies use current_setting('app.current_tenant') which must be set per-request
  await sql`
    CREATE POLICY IF NOT EXISTS tenant_isolation_doctors ON doctors
    USING (tenant_id = current_setting('app.current_tenant', true)::BIGINT)
  `;
  await sql`
    CREATE POLICY IF NOT EXISTS tenant_isolation_patients ON patients
    USING (tenant_id = current_setting('app.current_tenant', true)::BIGINT)
  `;
  await sql`
    CREATE POLICY IF NOT EXISTS tenant_isolation_rooms ON rooms
    USING (tenant_id = current_setting('app.current_tenant', true)::BIGINT)
  `;
  await sql`
    CREATE POLICY IF NOT EXISTS tenant_isolation_devices ON devices
    USING (tenant_id = current_setting('app.current_tenant', true)::BIGINT)
  `;
  await sql`
    CREATE POLICY IF NOT EXISTS tenant_isolation_services ON services
    USING (tenant_id = current_setting('app.current_tenant', true)::BIGINT)
  `;
  await sql`
    CREATE POLICY IF NOT EXISTS tenant_isolation_service_doctors ON service_doctors
    USING (tenant_id = current_setting('app.current_tenant', true)::BIGINT)
  `;
  await sql`
    CREATE POLICY IF NOT EXISTS tenant_isolation_service_devices ON service_devices
    USING (tenant_id = current_setting('app.current_tenant', true)::BIGINT)
  `;
  await sql`
    CREATE POLICY IF NOT EXISTS tenant_isolation_working_hours ON working_hours
    USING (tenant_id = current_setting('app.current_tenant', true)::BIGINT)
  `;
  await sql`
    CREATE POLICY IF NOT EXISTS tenant_isolation_breaks ON breaks
    USING (tenant_id = current_setting('app.current_tenant', true)::BIGINT)
  `;
  await sql`
    CREATE POLICY IF NOT EXISTS tenant_isolation_appointments ON appointments
    USING (tenant_id = current_setting('app.current_tenant', true)::BIGINT)
  `;
  await sql`
    CREATE POLICY IF NOT EXISTS tenant_isolation_appointment_devices ON appointment_devices
    USING (tenant_id = current_setting('app.current_tenant', true)::BIGINT)
  `;
  await sql`
    CREATE POLICY IF NOT EXISTS tenant_isolation_audit ON appointment_audit_log
    USING (tenant_id = current_setting('app.current_tenant', true)::BIGINT)
  `;
  await sql`
    CREATE POLICY IF NOT EXISTS tenant_isolation_users ON users
    USING (tenant_id = current_setting('app.current_tenant', true)::BIGINT)
  `;

  console.log('Row Level Security enabled');

  // Insert seed data
  console.log('Inserting seed data...');

  // Check if seed data exists
  const tenantCheck = await sql`SELECT id FROM tenants WHERE slug = 'demo-clinic' LIMIT 1`;

  if (tenantCheck.length === 0) {
    await sql`
      INSERT INTO tenants (name, slug, timezone)
      VALUES ('Demo Clinic', 'demo-clinic', 'Asia/Jakarta')
    `;

    await sql`
      INSERT INTO doctors (tenant_id, name, email, specialty) VALUES
      (1, 'Dr. Sarah Johnson', 'sarah@demo.clinic', 'General Practice'),
      (1, 'Dr. Michael Chen', 'michael@demo.clinic', 'Pediatrics'),
      (1, 'Dr. Emily Brown', 'emily@demo.clinic', 'Dermatology')
    `;

    await sql`
      INSERT INTO patients (tenant_id, name, email, phone) VALUES
      (1, 'John Smith', 'john@example.com', '+62812345678'),
      (1, 'Jane Doe', 'jane@example.com', '+62812345679'),
      (1, 'Bob Wilson', 'bob@example.com', '+62812345680')
    `;

    await sql`
      INSERT INTO rooms (tenant_id, name, room_type) VALUES
      (1, 'Room A', 'examination'),
      (1, 'Room B', 'examination'),
      (1, 'Room C', 'procedure')
    `;

    await sql`
      INSERT INTO devices (tenant_id, name, device_type) VALUES
      (1, 'ECG Machine', 'diagnostic'),
      (1, 'Ultrasound', 'imaging'),
      (1, 'X-Ray', 'imaging')
    `;

    await sql`
      INSERT INTO services (tenant_id, name, duration_minutes, requires_room, color) VALUES
      (1, 'General Consultation', 30, true, '#3B82F6'),
      (1, 'Follow-up Visit', 15, true, '#10B981'),
      (1, 'Phone Consultation', 20, false, '#8B5CF6'),
      (1, 'Health Checkup', 60, true, '#F59E0B')
    `;

    await sql`
      INSERT INTO service_doctors (service_id, doctor_id, tenant_id) VALUES
      (1, 1, 1), (1, 2, 1), (1, 3, 1),
      (2, 1, 1), (2, 2, 1), (2, 3, 1),
      (3, 1, 1), (3, 2, 1),
      (4, 1, 1), (4, 3, 1)
    `;

    await sql`
      INSERT INTO working_hours (tenant_id, doctor_id, day_of_week, start_time, end_time) VALUES
      (1, 1, 1, '09:00', '12:00'), (1, 1, 1, '14:00', '17:00'),
      (1, 1, 2, '09:00', '12:00'), (1, 1, 2, '14:00', '17:00'),
      (1, 1, 3, '09:00', '12:00'), (1, 1, 3, '14:00', '17:00'),
      (1, 1, 4, '09:00', '12:00'), (1, 1, 4, '14:00', '17:00'),
      (1, 1, 5, '09:00', '12:00'),
      (1, 2, 1, '08:00', '15:00'),
      (1, 2, 2, '08:00', '15:00'),
      (1, 2, 3, '08:00', '15:00'),
      (1, 2, 4, '08:00', '15:00'),
      (1, 2, 5, '08:00', '15:00'),
      (1, 3, 1, '10:00', '18:00'),
      (1, 3, 3, '10:00', '18:00'),
      (1, 3, 5, '10:00', '18:00')
    `;

    console.log('Seed data inserted successfully');
  } else {
    console.log('Seed data already exists, checking for missing data...');

    // Check if service_doctors has data for tenant 1 (could be missing if table was just created)
    const serviceDoctorsCheck = await sql`SELECT COUNT(*) as count FROM service_doctors WHERE tenant_id = 1`;
    if (Number(serviceDoctorsCheck[0]?.count) === 0) {
      console.log('Inserting service_doctors seed data...');
      await sql`
        INSERT INTO service_doctors (service_id, doctor_id, tenant_id) VALUES
        (1, 1, 1), (1, 2, 1), (1, 3, 1),
        (2, 1, 1), (2, 2, 1), (2, 3, 1),
        (3, 1, 1), (3, 2, 1),
        (4, 1, 1), (4, 3, 1)
        ON CONFLICT DO NOTHING
      `;
    }

    // Check if working_hours has data for tenant 1 (could be missing if table was just created)
    const workingHoursCheck = await sql`SELECT COUNT(*) as count FROM working_hours WHERE tenant_id = 1`;
    if (Number(workingHoursCheck[0]?.count) === 0) {
      console.log('Inserting working_hours seed data...');
      await sql`
        INSERT INTO working_hours (tenant_id, doctor_id, day_of_week, start_time, end_time) VALUES
        (1, 1, 1, '09:00', '12:00'), (1, 1, 1, '14:00', '17:00'),
        (1, 1, 2, '09:00', '12:00'), (1, 1, 2, '14:00', '17:00'),
        (1, 1, 3, '09:00', '12:00'), (1, 1, 3, '14:00', '17:00'),
        (1, 1, 4, '09:00', '12:00'), (1, 1, 4, '14:00', '17:00'),
        (1, 1, 5, '09:00', '12:00'),
        (1, 2, 1, '08:00', '15:00'),
        (1, 2, 2, '08:00', '15:00'),
        (1, 2, 3, '08:00', '15:00'),
        (1, 2, 4, '08:00', '15:00'),
        (1, 2, 5, '08:00', '15:00'),
        (1, 3, 1, '10:00', '18:00'),
        (1, 3, 3, '10:00', '18:00'),
        (1, 3, 5, '10:00', '18:00')
        ON CONFLICT DO NOTHING
      `;
    }
  }

  console.log('Migration completed successfully');
}

// Run directly if called as script
const isMainModule = process.argv[1]?.includes('migrate');
if (isMainModule) {
  runMigrations()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
