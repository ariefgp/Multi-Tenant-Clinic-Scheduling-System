import { Injectable, Inject } from '@nestjs/common';
import { eq, and, inArray } from 'drizzle-orm';
import {
  DATABASE_CONNECTION,
  type DatabaseConnection,
} from '../../database/database.module.js';
import { doctors, serviceDoctors } from '../../database/schema/index.js';

@Injectable()
export class DoctorService {
  constructor(
    @Inject(DATABASE_CONNECTION) private readonly db: DatabaseConnection,
  ) {}

  async findAll(tenantId: number, serviceId?: number) {
    if (serviceId) {
      return this.findByService(tenantId, serviceId);
    }
    return this.db
      .select()
      .from(doctors)
      .where(
        and(eq(doctors.tenantId, tenantId), eq(doctors.isActive, true)),
      );
  }

  private async findByService(tenantId: number, serviceId: number) {
    const rows = await this.db
      .select({ doctorId: serviceDoctors.doctorId })
      .from(serviceDoctors)
      .where(
        and(
          eq(serviceDoctors.tenantId, tenantId),
          eq(serviceDoctors.serviceId, serviceId),
        ),
      );

    const doctorIds = rows.map((r) => r.doctorId);
    if (doctorIds.length === 0) return [];

    return this.db
      .select()
      .from(doctors)
      .where(
        and(
          eq(doctors.tenantId, tenantId),
          eq(doctors.isActive, true),
          inArray(doctors.id, doctorIds),
        ),
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
