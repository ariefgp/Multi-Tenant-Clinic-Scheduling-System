import {
  pgTable,
  bigserial,
  bigint,
  varchar,
  text,
  integer,
  timestamp,
  interval,
  index,
  unique,
  jsonb,
} from 'drizzle-orm/pg-core';
import { tenants } from './tenants.js';
import { doctors } from './doctors.js';
import { patients } from './patients.js';
import { services } from './services.js';
import { rooms } from './rooms.js';
import { devices } from './devices.js';

export const appointments = pgTable(
  'appointments',
  {
    id: bigserial({ mode: 'number' }).primaryKey(),
    tenantId: bigint('tenant_id', { mode: 'number' })
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    doctorId: bigint('doctor_id', { mode: 'number' })
      .notNull()
      .references(() => doctors.id),
    patientId: bigint('patient_id', { mode: 'number' })
      .notNull()
      .references(() => patients.id),
    serviceId: bigint('service_id', { mode: 'number' })
      .notNull()
      .references(() => services.id),
    roomId: bigint('room_id', { mode: 'number' }).references(() => rooms.id),
    startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
    endsAt: timestamp('ends_at', { withTimezone: true }).notNull(),
    bufferBefore: interval('buffer_before').notNull().default('0 minutes'),
    bufferAfter: interval('buffer_after').notNull().default('0 minutes'),
    status: varchar({ length: 20 }).notNull().default('scheduled'),
    notes: text(),
    version: integer().notNull().default(1),
    idempotencyKey: varchar('idempotency_key', { length: 64 }).unique(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('idx_appt_tenant_doctor_time').on(
      table.tenantId,
      table.doctorId,
      table.startsAt,
    ),
    index('idx_appt_tenant_room_time').on(
      table.tenantId,
      table.roomId,
      table.startsAt,
    ),
    index('idx_appt_tenant_patient').on(table.tenantId, table.patientId),
  ],
);

export const appointmentDevices = pgTable(
  'appointment_devices',
  {
    id: bigserial({ mode: 'number' }).primaryKey(),
    appointmentId: bigint('appointment_id', { mode: 'number' })
      .notNull()
      .references(() => appointments.id, { onDelete: 'cascade' }),
    deviceId: bigint('device_id', { mode: 'number' })
      .notNull()
      .references(() => devices.id),
    tenantId: bigint('tenant_id', { mode: 'number' }).notNull(),
    startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
    endsAt: timestamp('ends_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    unique().on(table.appointmentId, table.deviceId),
    index('idx_appt_devices_device').on(
      table.tenantId,
      table.deviceId,
      table.startsAt,
    ),
  ],
);

export const appointmentAuditLog = pgTable(
  'appointment_audit_log',
  {
    id: bigserial({ mode: 'number' }).primaryKey(),
    tenantId: bigint('tenant_id', { mode: 'number' }).notNull(),
    appointmentId: bigint('appointment_id', { mode: 'number' }).notNull(),
    action: varchar({ length: 20 }).notNull(),
    changes: jsonb(),
    performedBy: varchar('performed_by', { length: 100 }),
    performedAt: timestamp('performed_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('idx_audit_appointment').on(table.appointmentId),
    index('idx_audit_tenant_time').on(table.tenantId, table.performedAt),
  ],
);
