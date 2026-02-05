import { Module, Global } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { neon } from '@neondatabase/serverless';
import { drizzle, NeonHttpDatabase } from 'drizzle-orm/neon-http';
import * as schema from './schema/index.js';

export const DATABASE_CONNECTION = 'DATABASE_CONNECTION';

export type DatabaseConnection = NeonHttpDatabase<typeof schema>;

@Global()
@Module({
  providers: [
    {
      provide: DATABASE_CONNECTION,
      useFactory: (config: ConfigService): DatabaseConnection => {
        const databaseUrl = config.getOrThrow<string>('DATABASE_URL');
        const sql = neon(databaseUrl);
        return drizzle({ client: sql, schema });
      },
      inject: [ConfigService],
    },
  ],
  exports: [DATABASE_CONNECTION],
})
export class DatabaseModule {}
