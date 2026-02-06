import {
  pgTable,
  bigserial,
  bigint,
  varchar,
  timestamp,
  index,
} from 'drizzle-orm/pg-core';
import { tenants } from './tenants.js';
import { doctors } from './doctors.js';

export const breaks = pgTable(
  'breaks',
  {
    id: bigserial({ mode: 'number' }).primaryKey(),
    tenantId: bigint('tenant_id', { mode: 'number' })
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    doctorId: bigint('doctor_id', { mode: 'number' })
      .notNull()
      .references(() => doctors.id, { onDelete: 'cascade' }),
    startTime: timestamp('start_time', { withTimezone: true }).notNull(),
    endTime: timestamp('end_time', { withTimezone: true }).notNull(),
    reason: varchar({ length: 255 }),
  },
  (table) => [
    index('idx_breaks_doctor').on(table.doctorId, table.startTime),
  ],
);
