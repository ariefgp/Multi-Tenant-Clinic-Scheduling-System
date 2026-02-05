import { Injectable, Inject } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import {
  DATABASE_CONNECTION,
  type DatabaseConnection,
} from '../../database/database.module.js';
import { tenants } from '../../database/schema/index.js';

@Injectable()
export class TenantService {
  constructor(
    @Inject(DATABASE_CONNECTION) private readonly db: DatabaseConnection,
  ) {}

  async findAll() {
    return this.db.select().from(tenants);
  }

  async findOne(id: number) {
    const [tenant] = await this.db
      .select()
      .from(tenants)
      .where(eq(tenants.id, id));
    return tenant ?? null;
  }
}
