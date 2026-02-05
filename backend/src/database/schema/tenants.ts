import {
  pgTable,
  bigserial,
  varchar,
  timestamp,
} from 'drizzle-orm/pg-core';

export const tenants = pgTable('tenants', {
  id: bigserial({ mode: 'number' }).primaryKey(),
  name: varchar({ length: 255 }).notNull(),
  timezone: varchar({ length: 50 }).notNull().default('Europe/Berlin'),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});
