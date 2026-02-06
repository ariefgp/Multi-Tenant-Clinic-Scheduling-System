import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import { eq, and, ne, gte, lte, inArray } from 'drizzle-orm';
import { addMinutes, addDays, startOfDay, getDay } from 'date-fns';
import {
  DATABASE_CONNECTION,
  type DatabaseConnection,
} from '../../database/database.module.js';
import {
  appointments,
  appointmentDevices,
  services,
  serviceDoctors,
  serviceDevices,
  doctors,
  rooms,
  workingHours,
  breaks,
} from '../../database/schema/index.js';

export interface AvailabilityParams {
  tenantId: number;
  serviceId: number;
  doctorIds?: number[];
  from: Date;
  to: Date;
  limit?: number;
}

export interface AvailableSlot {
  doctorId: number;
  doctorName: string;
  roomId: number | null;
  roomName: string | null;
  deviceIds: number[];
  start: Date;
  end: Date;
}

interface TimeInterval {
  start: Date;
  end: Date;
}

@Injectable()
export class AvailabilityService {
  constructor(
    @Inject(DATABASE_CONNECTION) private readonly db: DatabaseConnection,
  ) {}

  async findSlots(params: AvailabilityParams): Promise<AvailableSlot[]> {
    const { tenantId, serviceId, from, to, limit = 3 } = params;

    const service = await this.getServiceWithRequirements(tenantId, serviceId);
    const slotDuration = service.durationMinutes;
    const bufferBefore = service.bufferBeforeMin;
    const bufferAfter = service.bufferAfterMin;
    const totalDuration = bufferBefore + slotDuration + bufferAfter;

    const doctorIds =
      params.doctorIds && params.doctorIds.length > 0
        ? params.doctorIds
        : service.doctorIds;

    if (doctorIds.length === 0) return [];

    // Parallel batch-load all data
    const [
      existingAppointments,
      workingHoursData,
      breaksData,
      roomsData,
      deviceAppointments,
      doctorNameMap,
    ] = await Promise.all([
      this.getAppointmentsInRange(tenantId, from, to, doctorIds),
      this.getWorkingHoursForDoctors(tenantId, doctorIds),
      this.getBreaks(tenantId, from, to),
      service.requiresRoom
        ? this.getActiveRooms(tenantId)
        : Promise.resolve([]),
      service.deviceIds.length > 0
        ? this.getDeviceAppointments(tenantId, from, to, service.deviceIds)
        : Promise.resolve([]),
      this.getDoctorNameMap(tenantId, doctorIds),
    ]);

    // Build busy intervals
    const doctorBusy = this.buildBusyIntervals(existingAppointments, 'doctorId');
    const roomBusy = this.buildBusyIntervals(existingAppointments, 'roomId');
    const deviceBusy = this.buildDeviceBusyIntervals(deviceAppointments);

    // Build working hours map: `${doctorId}-${weekday}` -> TimeInterval[]
    const whMap = new Map<string, { startTime: string; endTime: string }[]>();
    for (const wh of workingHoursData) {
      const key = `${wh.doctorId}-${wh.dayOfWeek}`;
      const existing = whMap.get(key) ?? [];
      existing.push({ startTime: wh.startTime, endTime: wh.endTime });
      whMap.set(key, existing);
    }

    const roomNameMap = new Map(roomsData.map((r) => [r.id, r.name]));

    const slots: AvailableSlot[] = [];

    for (
      let day = startOfDay(from);
      day <= to && slots.length < limit;
      day = addDays(day, 1)
    ) {
      const weekday = getDay(day);

      for (const doctorId of doctorIds) {
        if (slots.length >= limit) break;

        const shifts = whMap.get(`${doctorId}-${weekday}`);
        if (!shifts) continue;

        for (const shift of shifts) {
          if (slots.length >= limit) break;

          const dayStart = this.setTimeOnDate(day, shift.startTime);
          const dayEnd = this.setTimeOnDate(day, shift.endTime);

          let slotStart = dayStart;
          if (slotStart < from) slotStart = from;

          while (
            addMinutes(slotStart, totalDuration) <= dayEnd &&
            slots.length < limit
          ) {
            const slotEnd = addMinutes(slotStart, slotDuration);
            const effectiveStart = addMinutes(slotStart, -bufferBefore);
            const effectiveEnd = addMinutes(slotEnd, bufferAfter);

            if (slotEnd > to) break;

            // Check doctor availability
            const doctorOverlap = this.findOverlappingInterval(
              doctorBusy.get(doctorId),
              effectiveStart,
              effectiveEnd,
            );
            if (doctorOverlap) {
              // Skip ahead to end of busy interval (quantized to 15 min)
              slotStart = this.quantizeTo15Min(doctorOverlap.end);
              continue;
            }

            // Check doctor breaks
            if (
              this.hasBreakOverlap(
                breaksData,
                doctorId,
                effectiveStart,
                effectiveEnd,
              )
            ) {
              slotStart = addMinutes(slotStart, 15);
              continue;
            }

            // Find available room (skip if service doesn't require room)
            let availableRoomId: number | null = null;
            let availableRoomName: string | null = null;

            if (service.requiresRoom) {
              const room = roomsData.find(
                (r) =>
                  !this.findOverlappingInterval(
                    roomBusy.get(r.id),
                    effectiveStart,
                    effectiveEnd,
                  ),
              );
              if (!room) {
                slotStart = addMinutes(slotStart, 15);
                continue;
              }
              availableRoomId = room.id;
              availableRoomName = room.name;
            }

            // Check device availability
            let availableDevices: number[] = [];
            if (service.deviceIds.length > 0) {
              availableDevices = service.deviceIds.filter(
                (deviceId) =>
                  !this.findOverlappingInterval(
                    deviceBusy.get(deviceId),
                    effectiveStart,
                    effectiveEnd,
                  ),
              );
              if (availableDevices.length < service.deviceIds.length) {
                slotStart = addMinutes(slotStart, 15);
                continue;
              }
            }

            slots.push({
              doctorId,
              doctorName: doctorNameMap.get(doctorId) ?? 'Unknown',
              roomId: availableRoomId,
              roomName: availableRoomName,
              deviceIds: availableDevices,
              start: slotStart,
              end: slotEnd,
            });

            slotStart = addMinutes(slotStart, 15);
          }
        }
      }
    }

    return slots;
  }

  private async getServiceWithRequirements(
    tenantId: number,
    serviceId: number,
  ) {
    const [service] = await this.db
      .select()
      .from(services)
      .where(
        and(eq(services.tenantId, tenantId), eq(services.id, serviceId)),
      );

    if (!service) throw new NotFoundException('Service not found');

    const [doctorRows, deviceRows] = await Promise.all([
      this.db
        .select({ doctorId: serviceDoctors.doctorId })
        .from(serviceDoctors)
        .where(eq(serviceDoctors.serviceId, serviceId)),
      this.db
        .select({ deviceId: serviceDevices.deviceId })
        .from(serviceDevices)
        .where(eq(serviceDevices.serviceId, serviceId)),
    ]);

    return {
      ...service,
      doctorIds: doctorRows.map((r) => r.doctorId),
      deviceIds: deviceRows.map((r) => r.deviceId),
    };
  }

  private async getAppointmentsInRange(
    tenantId: number,
    from: Date,
    to: Date,
    doctorIds: number[],
  ) {
    if (doctorIds.length === 0) return [];
    return this.db
      .select({
        id: appointments.id,
        doctorId: appointments.doctorId,
        roomId: appointments.roomId,
        startsAt: appointments.startsAt,
        endsAt: appointments.endsAt,
        bufferBefore: appointments.bufferBefore,
        bufferAfter: appointments.bufferAfter,
      })
      .from(appointments)
      .where(
        and(
          eq(appointments.tenantId, tenantId),
          inArray(appointments.doctorId, doctorIds),
          gte(appointments.startsAt, from),
          lte(appointments.startsAt, to),
          ne(appointments.status, 'cancelled'),
        ),
      );
  }

  private async getWorkingHoursForDoctors(
    tenantId: number,
    doctorIds: number[],
  ) {
    if (doctorIds.length === 0) return [];
    return this.db
      .select()
      .from(workingHours)
      .where(
        and(
          eq(workingHours.tenantId, tenantId),
          inArray(workingHours.doctorId, doctorIds),
        ),
      );
  }

  private async getBreaks(tenantId: number, from: Date, to: Date) {
    return this.db
      .select()
      .from(breaks)
      .where(
        and(
          eq(breaks.tenantId, tenantId),
          lte(breaks.startTime, to),
          gte(breaks.endTime, from),
        ),
      );
  }

  private async getActiveRooms(tenantId: number) {
    return this.db
      .select()
      .from(rooms)
      .where(and(eq(rooms.tenantId, tenantId), eq(rooms.isActive, true)));
  }

  private async getDeviceAppointments(
    tenantId: number,
    from: Date,
    to: Date,
    deviceIds: number[],
  ) {
    if (deviceIds.length === 0) return [];
    return this.db
      .select()
      .from(appointmentDevices)
      .where(
        and(
          eq(appointmentDevices.tenantId, tenantId),
          inArray(appointmentDevices.deviceId, deviceIds),
          lte(appointmentDevices.startsAt, to),
          gte(appointmentDevices.endsAt, from),
        ),
      );
  }

  private async getDoctorNameMap(
    tenantId: number,
    doctorIds: number[],
  ): Promise<Map<number, string>> {
    if (doctorIds.length === 0) return new Map();
    const rows = await this.db
      .select({ id: doctors.id, name: doctors.name })
      .from(doctors)
      .where(
        and(eq(doctors.tenantId, tenantId), inArray(doctors.id, doctorIds)),
      );
    return new Map(rows.map((r) => [r.id, r.name]));
  }

  private buildBusyIntervals(
    appts: { doctorId: number; roomId: number | null; startsAt: Date; endsAt: Date; bufferBefore: string | null; bufferAfter: string | null }[],
    key: 'doctorId' | 'roomId',
  ): Map<number, TimeInterval[]> {
    const busyMap = new Map<number, TimeInterval[]>();

    for (const appt of appts) {
      const resourceId = appt[key];
      if (resourceId === null) continue;

      const beforeMin = this.parseIntervalMinutes(appt.bufferBefore);
      const afterMin = this.parseIntervalMinutes(appt.bufferAfter);

      const interval: TimeInterval = {
        start: addMinutes(appt.startsAt, -beforeMin),
        end: addMinutes(appt.endsAt, afterMin),
      };

      const existing = busyMap.get(resourceId) ?? [];
      existing.push(interval);
      busyMap.set(resourceId, existing);
    }

    for (const [, intervals] of busyMap) {
      intervals.sort((a, b) => a.start.getTime() - b.start.getTime());
    }

    return busyMap;
  }

  private buildDeviceBusyIntervals(
    deviceAppts: { deviceId: number; startsAt: Date; endsAt: Date }[],
  ): Map<number, TimeInterval[]> {
    const busyMap = new Map<number, TimeInterval[]>();

    for (const da of deviceAppts) {
      const existing = busyMap.get(da.deviceId) ?? [];
      existing.push({ start: da.startsAt, end: da.endsAt });
      busyMap.set(da.deviceId, existing);
    }

    for (const [, intervals] of busyMap) {
      intervals.sort((a, b) => a.start.getTime() - b.start.getTime());
    }

    return busyMap;
  }

  private findOverlappingInterval(
    intervals: TimeInterval[] | undefined,
    start: Date,
    end: Date,
  ): TimeInterval | null {
    if (!intervals || intervals.length === 0) return null;

    let left = 0;
    let right = intervals.length - 1;

    while (left <= right) {
      const mid = Math.floor((left + right) / 2);
      const interval = intervals[mid];

      if (interval.end.getTime() <= start.getTime()) {
        left = mid + 1;
      } else if (interval.start.getTime() >= end.getTime()) {
        right = mid - 1;
      } else {
        return interval;
      }
    }

    return null;
  }

  private hasBreakOverlap(
    allBreaks: { doctorId: number; startTime: Date; endTime: Date }[],
    doctorId: number,
    start: Date,
    end: Date,
  ): boolean {
    return allBreaks.some(
      (b) =>
        b.doctorId === doctorId &&
        b.startTime.getTime() < end.getTime() &&
        b.endTime.getTime() > start.getTime(),
    );
  }

  private setTimeOnDate(date: Date, timeStr: string): Date {
    const [hours, minutes] = timeStr.split(':').map(Number);
    const result = new Date(date);
    result.setHours(hours, minutes, 0, 0);
    return result;
  }

  private quantizeTo15Min(date: Date): Date {
    const result = new Date(date);
    const minutes = result.getMinutes();
    const nextSlot = Math.ceil(minutes / 15) * 15;
    result.setMinutes(nextSlot, 0, 0);
    return result;
  }

  private parseIntervalMinutes(interval: string | null): number {
    if (!interval) return 0;
    const match = interval.match(/(\d+)/);
    return match ? parseInt(match[1], 10) : 0;
  }
}
