import { Injectable, Inject } from '@nestjs/common';
import { eq, and } from 'drizzle-orm';
import {
  DATABASE_CONNECTION,
  type DatabaseConnection,
} from '../../database/database.module.js';
import { devices } from '../../database/schema/index.js';

@Injectable()
export class DeviceService {
  constructor(
    @Inject(DATABASE_CONNECTION) private readonly db: DatabaseConnection,
  ) {}

  async findAll(tenantId: number) {
    return this.db
      .select()
      .from(devices)
      .where(
        and(eq(devices.tenantId, tenantId), eq(devices.isActive, true)),
      );
  }

  async findOne(tenantId: number, id: number) {
    const [device] = await this.db
      .select()
      .from(devices)
      .where(and(eq(devices.tenantId, tenantId), eq(devices.id, id)));
    return device ?? null;
  }
}
