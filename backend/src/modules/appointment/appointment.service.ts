import {
  Injectable,
  Inject,
  ConflictException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { eq, and, ne, gte, lte, sql } from 'drizzle-orm';
import { addMinutes } from 'date-fns';
import {
  DATABASE_CONNECTION,
  type DatabaseConnection,
} from '../../database/database.module.js';
import {
  appointments,
  appointmentDevices,
  appointmentAuditLog,
  services,
  doctors,
  patients,
  rooms,
} from '../../database/schema/index.js';
import {
  ConflictCheckerService,
  type Conflict,
} from './services/conflict-checker.service.js';
import type { CreateAppointmentDto } from './dto/create-appointment.dto.js';
import type { RescheduleAppointmentDto } from './dto/reschedule-appointment.dto.js';

@Injectable()
export class AppointmentService {
  constructor(
    @Inject(DATABASE_CONNECTION) private readonly db: DatabaseConnection,
    private readonly conflictChecker: ConflictCheckerService,
  ) {}

  async create(tenantId: number, dto: CreateAppointmentDto) {
    const service = await this.getService(tenantId, dto.service_id);

    if (service.requiresRoom && !dto.room_id) {
      throw new BadRequestException(
        `Service "${service.name}" requires a room.`,
      );
    }

    const startsAt = new Date(dto.starts_at);
    const endsAt = addMinutes(startsAt, service.durationMinutes);

    const conflicts = await this.conflictChecker.findConflicts({
      tenantId,
      doctorId: dto.doctor_id,
      roomId: dto.room_id ?? null,
      deviceIds: dto.device_ids,
      startsAt,
      endsAt,
      bufferBefore: service.bufferBeforeMin,
      bufferAfter: service.bufferAfterMin,
    });

    if (conflicts.length > 0) {
      throw new ConflictException({
        error: 'scheduling_conflict',
        message: this.buildConflictMessage(conflicts),
        conflicts,
      });
    }

    try {
      const [appointment] = await this.db
        .insert(appointments)
        .values({
          tenantId,
          doctorId: dto.doctor_id,
          patientId: dto.patient_id,
          serviceId: dto.service_id,
          roomId: dto.room_id ?? null,
          startsAt,
          endsAt,
          bufferBefore: `${service.bufferBeforeMin} minutes`,
          bufferAfter: `${service.bufferAfterMin} minutes`,
          notes: dto.notes,
          idempotencyKey: dto.idempotency_key,
        })
        .returning();

      if (dto.device_ids.length > 0) {
        await this.db.insert(appointmentDevices).values(
          dto.device_ids.map((deviceId) => ({
            appointmentId: appointment.id,
            deviceId,
            tenantId,
            startsAt,
            endsAt,
          })),
        );
      }

      await this.db.insert(appointmentAuditLog).values({
        tenantId,
        appointmentId: appointment.id,
        action: 'created',
        changes: dto,
      });

      return appointment;
    } catch (error: unknown) {
      const dbError = error as { code?: string; constraint?: string };
      if (dbError.code === '23P01') {
        const freshConflicts = await this.conflictChecker.findConflicts({
          tenantId,
          doctorId: dto.doctor_id,
          roomId: dto.room_id ?? null,
          deviceIds: dto.device_ids,
          startsAt,
          endsAt,
          bufferBefore: service.bufferBeforeMin,
          bufferAfter: service.bufferAfterMin,
        });
        throw new ConflictException({
          error: 'scheduling_conflict',
          message: this.buildConflictMessage(freshConflicts),
          conflicts: freshConflicts,
        });
      }

      if (
        dbError.code === '23505' &&
        dbError.constraint?.includes('idempotency')
      ) {
        const [existing] = await this.db
          .select()
          .from(appointments)
          .where(eq(appointments.idempotencyKey, dto.idempotency_key!));
        return existing;
      }

      throw error;
    }
  }

  async cancel(tenantId: number, appointmentId: number) {
    const [updated] = await this.db
      .update(appointments)
      .set({ status: 'cancelled', updatedAt: new Date() })
      .where(
        and(
          eq(appointments.tenantId, tenantId),
          eq(appointments.id, appointmentId),
          ne(appointments.status, 'cancelled'),
        ),
      )
      .returning();

    if (!updated) {
      throw new NotFoundException(
        'Appointment not found or already cancelled',
      );
    }

    await this.db.insert(appointmentAuditLog).values({
      tenantId,
      appointmentId,
      action: 'cancelled',
    });

    return updated;
  }

  async reschedule(
    tenantId: number,
    appointmentId: number,
    dto: RescheduleAppointmentDto,
  ) {
    const [existing] = await this.db
      .select()
      .from(appointments)
      .where(
        and(
          eq(appointments.tenantId, tenantId),
          eq(appointments.id, appointmentId),
        ),
      );

    if (!existing) {
      throw new NotFoundException('Appointment not found');
    }

    if (existing.status === 'cancelled' || existing.status === 'completed') {
      throw new BadRequestException(
        `Cannot reschedule a ${existing.status} appointment`,
      );
    }

    const service = await this.getService(tenantId, existing.serviceId);
    const doctorId = dto.doctor_id ?? existing.doctorId;
    const roomId = dto.room_id !== undefined ? dto.room_id : existing.roomId;
    const deviceIds = dto.device_ids;

    if (service.requiresRoom && !roomId) {
      throw new BadRequestException(
        `Service "${service.name}" requires a room.`,
      );
    }

    const startsAt = new Date(dto.starts_at);
    const endsAt = addMinutes(startsAt, service.durationMinutes);

    const conflicts = await this.conflictChecker.findConflicts({
      tenantId,
      doctorId,
      roomId,
      deviceIds: deviceIds ?? [],
      startsAt,
      endsAt,
      bufferBefore: service.bufferBeforeMin,
      bufferAfter: service.bufferAfterMin,
      excludeAppointmentId: appointmentId,
    });

    if (conflicts.length > 0) {
      throw new ConflictException({
        error: 'scheduling_conflict',
        message: this.buildConflictMessage(conflicts),
        conflicts,
      });
    }

    try {
      const [updated] = await this.db
        .update(appointments)
        .set({
          doctorId,
          roomId,
          startsAt,
          endsAt,
          updatedAt: new Date(),
          version: sql`${appointments.version} + 1`,
        })
        .where(
          and(
            eq(appointments.tenantId, tenantId),
            eq(appointments.id, appointmentId),
          ),
        )
        .returning();

      if (deviceIds) {
        await this.db
          .delete(appointmentDevices)
          .where(eq(appointmentDevices.appointmentId, appointmentId));

        if (deviceIds.length > 0) {
          await this.db.insert(appointmentDevices).values(
            deviceIds.map((deviceId) => ({
              appointmentId,
              deviceId,
              tenantId,
              startsAt,
              endsAt,
            })),
          );
        }
      }

      await this.db.insert(appointmentAuditLog).values({
        tenantId,
        appointmentId,
        action: 'rescheduled',
        changes: dto,
      });

      return updated;
    } catch (error: unknown) {
      const dbError = error as { code?: string };
      if (dbError.code === '23P01') {
        const freshConflicts = await this.conflictChecker.findConflicts({
          tenantId,
          doctorId,
          roomId,
          deviceIds: deviceIds ?? [],
          startsAt,
          endsAt,
          bufferBefore: service.bufferBeforeMin,
          bufferAfter: service.bufferAfterMin,
          excludeAppointmentId: appointmentId,
        });
        throw new ConflictException({
          error: 'scheduling_conflict',
          message: this.buildConflictMessage(freshConflicts),
          conflicts: freshConflicts,
        });
      }
      throw error;
    }
  }

  async findOne(tenantId: number, appointmentId: number) {
    const [appointment] = await this.db
      .select()
      .from(appointments)
      .where(
        and(
          eq(appointments.tenantId, tenantId),
          eq(appointments.id, appointmentId),
        ),
      );

    if (!appointment) {
      throw new NotFoundException('Appointment not found');
    }
    return appointment;
  }

  async getDoctorSchedule(
    tenantId: number,
    doctorId: number,
    from: Date,
    to: Date,
  ) {
    return this.db
      .select({
        id: appointments.id,
        tenantId: appointments.tenantId,
        doctorId: appointments.doctorId,
        patientId: appointments.patientId,
        serviceId: appointments.serviceId,
        roomId: appointments.roomId,
        startsAt: appointments.startsAt,
        endsAt: appointments.endsAt,
        status: appointments.status,
        notes: appointments.notes,
        patientName: patients.name,
        serviceName: services.name,
        serviceColor: services.color,
        roomName: rooms.name,
        doctorName: doctors.name,
      })
      .from(appointments)
      .innerJoin(patients, eq(patients.id, appointments.patientId))
      .innerJoin(services, eq(services.id, appointments.serviceId))
      .innerJoin(doctors, eq(doctors.id, appointments.doctorId))
      .leftJoin(rooms, eq(rooms.id, appointments.roomId))
      .where(
        and(
          eq(appointments.tenantId, tenantId),
          eq(appointments.doctorId, doctorId),
          gte(appointments.startsAt, from),
          lte(appointments.startsAt, to),
          ne(appointments.status, 'cancelled'),
        ),
      )
      .orderBy(appointments.startsAt);
  }

  async getAllSchedule(tenantId: number, from: Date, to: Date) {
    return this.db
      .select({
        id: appointments.id,
        tenantId: appointments.tenantId,
        doctorId: appointments.doctorId,
        patientId: appointments.patientId,
        serviceId: appointments.serviceId,
        roomId: appointments.roomId,
        startsAt: appointments.startsAt,
        endsAt: appointments.endsAt,
        status: appointments.status,
        notes: appointments.notes,
        patientName: patients.name,
        serviceName: services.name,
        serviceColor: services.color,
        roomName: rooms.name,
        doctorName: doctors.name,
      })
      .from(appointments)
      .innerJoin(patients, eq(patients.id, appointments.patientId))
      .innerJoin(services, eq(services.id, appointments.serviceId))
      .innerJoin(doctors, eq(doctors.id, appointments.doctorId))
      .leftJoin(rooms, eq(rooms.id, appointments.roomId))
      .where(
        and(
          eq(appointments.tenantId, tenantId),
          gte(appointments.startsAt, from),
          lte(appointments.startsAt, to),
          ne(appointments.status, 'cancelled'),
        ),
      )
      .orderBy(appointments.startsAt);
  }

  private async getService(tenantId: number, serviceId: number) {
    const [service] = await this.db
      .select()
      .from(services)
      .where(
        and(eq(services.tenantId, tenantId), eq(services.id, serviceId)),
      );

    if (!service) {
      throw new NotFoundException('Service not found');
    }
    return service;
  }

  private buildConflictMessage(conflicts: Conflict[]): string {
    if (conflicts.length === 0) {
      return 'Scheduling conflict detected';
    }

    const resourceMessages = conflicts.map((c) => {
      const type =
        c.resourceType === 'doctor'
          ? 'Doctor'
          : c.resourceType === 'room'
            ? 'Room'
            : 'Device';
      return `${type} "${c.resourceName}"`;
    });

    const uniqueMessages = [...new Set(resourceMessages)];

    if (uniqueMessages.length === 1) {
      return `${uniqueMessages[0]} is unavailable at the requested time`;
    }

    const last = uniqueMessages.pop();
    return `${uniqueMessages.join(', ')} and ${last} are unavailable at the requested time`;
  }
}
