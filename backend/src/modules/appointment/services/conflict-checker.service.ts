import { Injectable, Inject } from '@nestjs/common';
import { eq, and, ne, sql } from 'drizzle-orm';
import {
  DATABASE_CONNECTION,
  type DatabaseConnection,
} from '../../../database/database.module.js';
import {
  appointments,
  appointmentDevices,
  doctors,
  rooms,
  devices,
} from '../../../database/schema/index.js';

export interface ConflictCheckParams {
  tenantId: number;
  doctorId: number;
  roomId: number | null;
  deviceIds: number[];
  startsAt: Date;
  endsAt: Date;
  bufferBefore: number;
  bufferAfter: number;
  excludeAppointmentId?: number;
}

export interface Conflict {
  resourceType: 'doctor' | 'room' | 'device';
  resourceId: number;
  resourceName: string;
  appointmentId: number;
  conflictingRange: { start: Date; end: Date };
}

@Injectable()
export class ConflictCheckerService {
  constructor(
    @Inject(DATABASE_CONNECTION) private readonly db: DatabaseConnection,
  ) {}

  async findConflicts(params: ConflictCheckParams): Promise<Conflict[]> {
    const conflicts: Conflict[] = [];

    const effectiveStart = new Date(
      params.startsAt.getTime() - params.bufferBefore * 60_000,
    );
    const effectiveEnd = new Date(
      params.endsAt.getTime() + params.bufferAfter * 60_000,
    );

    const excludeCondition = params.excludeAppointmentId
      ? ne(appointments.id, params.excludeAppointmentId)
      : undefined;

    const baseConditions = [
      eq(appointments.tenantId, params.tenantId),
      ne(appointments.status, 'cancelled'),
      sql`tstzrange(${effectiveStart.toISOString()}::timestamptz, ${effectiveEnd.toISOString()}::timestamptz) && tstzrange(${appointments.startsAt} - ${appointments.bufferBefore}, ${appointments.endsAt} + ${appointments.bufferAfter})`,
      ...(excludeCondition ? [excludeCondition] : []),
    ];

    // Doctor conflict
    const doctorConflicts = await this.db
      .select({
        id: appointments.id,
        startsAt: appointments.startsAt,
        endsAt: appointments.endsAt,
        doctorName: doctors.name,
      })
      .from(appointments)
      .innerJoin(doctors, eq(doctors.id, appointments.doctorId))
      .where(
        and(eq(appointments.doctorId, params.doctorId), ...baseConditions),
      )
      .limit(1);

    if (doctorConflicts.length > 0) {
      const c = doctorConflicts[0];
      conflicts.push({
        resourceType: 'doctor',
        resourceId: params.doctorId,
        resourceName: c.doctorName,
        appointmentId: c.id,
        conflictingRange: { start: c.startsAt, end: c.endsAt },
      });
    }

    // Room conflict (skip when roomId is null)
    if (params.roomId !== null) {
      const roomConflicts = await this.db
        .select({
          id: appointments.id,
          startsAt: appointments.startsAt,
          endsAt: appointments.endsAt,
          roomName: rooms.name,
        })
        .from(appointments)
        .innerJoin(rooms, eq(rooms.id, appointments.roomId))
        .where(
          and(eq(appointments.roomId, params.roomId), ...baseConditions),
        )
        .limit(1);

      if (roomConflicts.length > 0) {
        const c = roomConflicts[0];
        conflicts.push({
          resourceType: 'room',
          resourceId: params.roomId,
          resourceName: c.roomName,
          appointmentId: c.id,
          conflictingRange: { start: c.startsAt, end: c.endsAt },
        });
      }
    }

    // Device conflicts
    for (const deviceId of params.deviceIds) {
      const deviceConflicts = await this.db
        .select({
          appointmentId: appointmentDevices.appointmentId,
          startsAt: appointmentDevices.startsAt,
          endsAt: appointmentDevices.endsAt,
          deviceName: devices.name,
        })
        .from(appointmentDevices)
        .innerJoin(devices, eq(devices.id, appointmentDevices.deviceId))
        .where(
          and(
            eq(appointmentDevices.tenantId, params.tenantId),
            eq(appointmentDevices.deviceId, deviceId),
            sql`tstzrange(${effectiveStart.toISOString()}::timestamptz, ${effectiveEnd.toISOString()}::timestamptz) && tstzrange(${appointmentDevices.startsAt}, ${appointmentDevices.endsAt})`,
            ...(params.excludeAppointmentId
              ? [
                  ne(
                    appointmentDevices.appointmentId,
                    params.excludeAppointmentId,
                  ),
                ]
              : []),
          ),
        )
        .limit(1);

      if (deviceConflicts.length > 0) {
        const c = deviceConflicts[0];
        conflicts.push({
          resourceType: 'device',
          resourceId: deviceId,
          resourceName: c.deviceName,
          appointmentId: c.appointmentId,
          conflictingRange: { start: c.startsAt, end: c.endsAt },
        });
      }
    }

    return conflicts;
  }
}
