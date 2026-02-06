import {
  pgTable,
  bigserial,
  varchar,
  timestamp,
  boolean,
} from 'drizzle-orm/pg-core';

export const tenants = pgTable('tenants', {
  id: bigserial({ mode: 'number' }).primaryKey(),
  name: varchar({ length: 255 }).notNull(),
  slug: varchar({ length: 100 }).notNull().unique(),
  timezone: varchar({ length: 50 }).notNull().default('UTC'),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});
