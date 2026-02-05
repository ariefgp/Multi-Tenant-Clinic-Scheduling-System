import {
  pgTable,
  bigserial,
  bigint,
  varchar,
  timestamp,
  index,
} from 'drizzle-orm/pg-core';
import { tenants } from './tenants.js';

export const breaks = pgTable(
  'breaks',
  {
    id: bigserial({ mode: 'number' }).primaryKey(),
    tenantId: bigint('tenant_id', { mode: 'number' })
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    resourceType: varchar('resource_type', { length: 20 }).notNull(),
    resourceId: bigint('resource_id', { mode: 'number' }).notNull(),
    startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
    endsAt: timestamp('ends_at', { withTimezone: true }).notNull(),
    reason: varchar({ length: 255 }),
  },
  (table) => [
    index('idx_breaks_resource').on(
      table.tenantId,
      table.resourceType,
      table.resourceId,
      table.startsAt,
    ),
  ],
);
