import {
  pgTable,
  bigserial,
  bigint,
  smallint,
  time,
  index,
} from 'drizzle-orm/pg-core';
import { tenants } from './tenants.js';
import { doctors } from './doctors.js';

export const workingHours = pgTable(
  'working_hours',
  {
    id: bigserial({ mode: 'number' }).primaryKey(),
    tenantId: bigint('tenant_id', { mode: 'number' })
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    doctorId: bigint('doctor_id', { mode: 'number' })
      .notNull()
      .references(() => doctors.id, { onDelete: 'cascade' }),
    weekday: smallint().notNull(),
    startTime: time('start_time').notNull(),
    endTime: time('end_time').notNull(),
  },
  (table) => [
    index('idx_working_hours_doctor_day').on(
      table.tenantId,
      table.doctorId,
      table.weekday,
    ),
  ],
);
