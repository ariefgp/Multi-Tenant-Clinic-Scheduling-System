import { Injectable, Inject } from '@nestjs/common';
import { eq, and } from 'drizzle-orm';
import {
  DATABASE_CONNECTION,
  type DatabaseConnection,
} from '../../database/database.module.js';
import {
  services,
  serviceDoctors,
  serviceDevices,
} from '../../database/schema/index.js';

@Injectable()
export class ServiceService {
  constructor(
    @Inject(DATABASE_CONNECTION) private readonly db: DatabaseConnection,
  ) {}

  async findAll(tenantId: number) {
    const rows = await this.db
      .select()
      .from(services)
      .where(
        and(eq(services.tenantId, tenantId), eq(services.isActive, true)),
      );

    return Promise.all(
      rows.map(async (service) => {
        const [doctorIds, deviceIds] = await Promise.all([
          this.getDoctorIds(service.id),
          this.getDeviceIds(service.id),
        ]);
        return { ...service, doctorIds, deviceIds };
      }),
    );
  }

  async findOne(tenantId: number, id: number) {
    const [service] = await this.db
      .select()
      .from(services)
      .where(and(eq(services.tenantId, tenantId), eq(services.id, id)));

    if (!service) return null;

    const [doctorIds, deviceIds] = await Promise.all([
      this.getDoctorIds(id),
      this.getDeviceIds(id),
    ]);

    return { ...service, doctorIds, deviceIds };
  }

  private async getDoctorIds(serviceId: number): Promise<number[]> {
    const rows = await this.db
      .select({ doctorId: serviceDoctors.doctorId })
      .from(serviceDoctors)
      .where(eq(serviceDoctors.serviceId, serviceId));
    return rows.map((r) => r.doctorId);
  }

  private async getDeviceIds(serviceId: number): Promise<number[]> {
    const rows = await this.db
      .select({ deviceId: serviceDevices.deviceId })
      .from(serviceDevices)
      .where(eq(serviceDevices.serviceId, serviceId));
    return rows.map((r) => r.deviceId);
  }
}
