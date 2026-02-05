import { Injectable, Inject } from '@nestjs/common';
import { eq, and } from 'drizzle-orm';
import {
  DATABASE_CONNECTION,
  type DatabaseConnection,
} from '../../database/database.module.js';
import { patients } from '../../database/schema/index.js';

@Injectable()
export class PatientService {
  constructor(
    @Inject(DATABASE_CONNECTION) private readonly db: DatabaseConnection,
  ) {}

  async findAll(tenantId: number) {
    return this.db
      .select()
      .from(patients)
      .where(eq(patients.tenantId, tenantId));
  }

  async findOne(tenantId: number, id: number) {
    const [patient] = await this.db
      .select()
      .from(patients)
      .where(and(eq(patients.tenantId, tenantId), eq(patients.id, id)));
    return patient ?? null;
  }
}
