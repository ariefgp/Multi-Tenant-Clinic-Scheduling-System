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

  // Check if tables exist by querying tenants table
  const tableCheck = await sql`
    SELECT EXISTS (
      SELECT FROM information_schema.tables
      WHERE table_schema = 'public'
      AND table_name = 'tenants'
    ) as exists
  `;

  if (tableCheck[0]?.exists) {
    console.log('Database schema already exists, skipping migration');
    return;
  }

  console.log('Creating database schema...');

  // Create all tables
  await sql`
    CREATE TABLE IF NOT EXISTS tenants (
      id BIGSERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      slug VARCHAR(100) NOT NULL UNIQUE,
      timezone VARCHAR(50) NOT NULL DEFAULT 'UTC',
      is_active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS doctors (
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

  await sql`
    CREATE TABLE IF NOT EXISTS patients (
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

  await sql`
    CREATE TABLE IF NOT EXISTS rooms (
      id BIGSERIAL PRIMARY KEY,
      tenant_id BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      name VARCHAR(100) NOT NULL,
      room_type VARCHAR(50),
      is_active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS devices (
      id BIGSERIAL PRIMARY KEY,
      tenant_id BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      name VARCHAR(100) NOT NULL,
      device_type VARCHAR(50),
      is_active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS services (
      id BIGSERIAL PRIMARY KEY,
      tenant_id BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      name VARCHAR(255) NOT NULL,
      duration_minutes INT NOT NULL DEFAULT 30,
      buffer_before_min INT NOT NULL DEFAULT 0,
      buffer_after_min INT NOT NULL DEFAULT 0,
      requires_room BOOLEAN NOT NULL DEFAULT false,
      color VARCHAR(7),
      is_active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS service_doctors (
      id BIGSERIAL PRIMARY KEY,
      service_id BIGINT NOT NULL REFERENCES services(id) ON DELETE CASCADE,
      doctor_id BIGINT NOT NULL REFERENCES doctors(id) ON DELETE CASCADE,
      UNIQUE(service_id, doctor_id)
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS service_devices (
      id BIGSERIAL PRIMARY KEY,
      service_id BIGINT NOT NULL REFERENCES services(id) ON DELETE CASCADE,
      device_id BIGINT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
      UNIQUE(service_id, device_id)
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS working_hours (
      id BIGSERIAL PRIMARY KEY,
      tenant_id BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      doctor_id BIGINT NOT NULL REFERENCES doctors(id) ON DELETE CASCADE,
      day_of_week SMALLINT NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
      start_time TIME NOT NULL,
      end_time TIME NOT NULL,
      UNIQUE(doctor_id, day_of_week, start_time)
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS breaks (
      id BIGSERIAL PRIMARY KEY,
      tenant_id BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      doctor_id BIGINT NOT NULL REFERENCES doctors(id) ON DELETE CASCADE,
      start_time TIMESTAMPTZ NOT NULL,
      end_time TIMESTAMPTZ NOT NULL,
      reason VARCHAR(255)
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS appointments (
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

  await sql`
    CREATE TABLE IF NOT EXISTS appointment_devices (
      id BIGSERIAL PRIMARY KEY,
      appointment_id BIGINT NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
      device_id BIGINT NOT NULL REFERENCES devices(id),
      tenant_id BIGINT NOT NULL,
      starts_at TIMESTAMPTZ NOT NULL,
      ends_at TIMESTAMPTZ NOT NULL,
      UNIQUE(appointment_id, device_id)
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS appointment_audit_log (
      id BIGSERIAL PRIMARY KEY,
      tenant_id BIGINT NOT NULL,
      appointment_id BIGINT NOT NULL,
      action VARCHAR(20) NOT NULL,
      changes JSONB,
      performed_by VARCHAR(100),
      performed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS users (
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

  // Create indexes
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

  console.log('Database schema created successfully');

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
      INSERT INTO service_doctors (service_id, doctor_id) VALUES
      (1, 1), (1, 2), (1, 3),
      (2, 1), (2, 2), (2, 3),
      (3, 1), (3, 2),
      (4, 1), (4, 3)
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
    console.log('Seed data already exists, skipping');
  }
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
