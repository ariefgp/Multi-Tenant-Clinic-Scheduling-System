import { Injectable, Inject } from '@nestjs/common';
import { eq, and } from 'drizzle-orm';
import {
  DATABASE_CONNECTION,
  type DatabaseConnection,
} from '../../database/database.module.js';
import { doctors } from '../../database/schema/index.js';

@Injectable()
export class DoctorService {
  constructor(
    @Inject(DATABASE_CONNECTION) private readonly db: DatabaseConnection,
  ) {}

  async findAll(tenantId: number) {
    return this.db
      .select()
      .from(doctors)
      .where(
        and(eq(doctors.tenantId, tenantId), eq(doctors.isActive, true)),
      );
  }

  async findOne(tenantId: number, id: number) {
    const [doctor] = await this.db
      .select()
      .from(doctors)
      .where(and(eq(doctors.tenantId, tenantId), eq(doctors.id, id)));
    return doctor ?? null;
  }
}
