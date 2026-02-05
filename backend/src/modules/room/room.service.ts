import { Injectable, Inject } from '@nestjs/common';
import { eq, and } from 'drizzle-orm';
import {
  DATABASE_CONNECTION,
  type DatabaseConnection,
} from '../../database/database.module.js';
import { rooms } from '../../database/schema/index.js';

@Injectable()
export class RoomService {
  constructor(
    @Inject(DATABASE_CONNECTION) private readonly db: DatabaseConnection,
  ) {}

  async findAll(tenantId: number) {
    return this.db
      .select()
      .from(rooms)
      .where(and(eq(rooms.tenantId, tenantId), eq(rooms.isActive, true)));
  }

  async findOne(tenantId: number, id: number) {
    const [room] = await this.db
      .select()
      .from(rooms)
      .where(and(eq(rooms.tenantId, tenantId), eq(rooms.id, id)));
    return room ?? null;
  }
}
