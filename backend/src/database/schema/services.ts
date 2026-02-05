import {
  pgTable,
  bigserial,
  bigint,
  varchar,
  integer,
  boolean,
  timestamp,
  index,
  primaryKey,
} from 'drizzle-orm/pg-core';
import { tenants } from './tenants.js';
import { doctors } from './doctors.js';
import { devices } from './devices.js';

export const services = pgTable(
  'services',
  {
    id: bigserial({ mode: 'number' }).primaryKey(),
    tenantId: bigint('tenant_id', { mode: 'number' })
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    name: varchar({ length: 255 }).notNull(),
    durationMinutes: integer('duration_minutes').notNull(),
    bufferBeforeMin: integer('buffer_before_min').notNull().default(0),
    bufferAfterMin: integer('buffer_after_min').notNull().default(0),
    requiresRoom: boolean('requires_room').notNull().default(true),
    color: varchar({ length: 7 }),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index('idx_services_tenant').on(table.tenantId)],
);

export const serviceDoctors = pgTable(
  'service_doctors',
  {
    serviceId: bigint('service_id', { mode: 'number' })
      .notNull()
      .references(() => services.id, { onDelete: 'cascade' }),
    doctorId: bigint('doctor_id', { mode: 'number' })
      .notNull()
      .references(() => doctors.id, { onDelete: 'cascade' }),
    tenantId: bigint('tenant_id', { mode: 'number' })
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
  },
  (table) => [
    primaryKey({ columns: [table.serviceId, table.doctorId] }),
  ],
);

export const serviceDevices = pgTable(
  'service_devices',
  {
    serviceId: bigint('service_id', { mode: 'number' })
      .notNull()
      .references(() => services.id, { onDelete: 'cascade' }),
    deviceId: bigint('device_id', { mode: 'number' })
      .notNull()
      .references(() => devices.id, { onDelete: 'cascade' }),
    tenantId: bigint('tenant_id', { mode: 'number' })
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
  },
  (table) => [
    primaryKey({ columns: [table.serviceId, table.deviceId] }),
  ],
);
