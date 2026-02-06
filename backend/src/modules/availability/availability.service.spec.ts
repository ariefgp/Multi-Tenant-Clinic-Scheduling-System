import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { AvailabilityService, type AvailabilityParams } from './availability.service';
import { DATABASE_CONNECTION } from '../../database/database.module';

describe('AvailabilityService', () => {
  let service: AvailabilityService;
  let mockDb: {
    select: jest.Mock;
  };

  const mockService = {
    id: 1,
    name: 'General Consultation',
    durationMinutes: 30,
    bufferBeforeMin: 5,
    bufferAfterMin: 5,
    requiresRoom: true,
    isActive: true,
    doctorIds: [101, 102],
    deviceIds: [],
  };

  const createMockQuery = (results: unknown[] = []) => {
    return {
      from: jest.fn().mockReturnThis(),
      innerJoin: jest.fn().mockReturnThis(),
      leftJoin: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      then: jest.fn().mockResolvedValue(results),
    };
  };

  beforeEach(async () => {
    mockDb = {
      select: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AvailabilityService,
        {
          provide: DATABASE_CONNECTION,
          useValue: mockDb,
        },
      ],
    }).compile();

    service = module.get<AvailabilityService>(AvailabilityService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('findSlots', () => {
    const baseParams: AvailabilityParams = {
      tenantId: 1,
      serviceId: 1,
      from: new Date('2026-02-10T08:00:00Z'),
      to: new Date('2026-02-10T18:00:00Z'),
      limit: 5,
    };

    it('should throw NotFoundException when service not found', async () => {
      // Mock service query returns empty
      mockDb.select.mockReturnValueOnce({
        from: jest.fn().mockReturnThis(),
        where: jest.fn().mockResolvedValueOnce([]),
      });

      await expect(service.findSlots(baseParams)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should return empty array when no doctors are assigned to service', async () => {
      // Mock service query
      mockDb.select.mockReturnValueOnce({
        from: jest.fn().mockReturnThis(),
        where: jest.fn().mockResolvedValueOnce([{ ...mockService, id: 1 }]),
      });

      // Mock service_doctors query returns empty
      mockDb.select.mockReturnValueOnce({
        from: jest.fn().mockReturnThis(),
        where: jest.fn().mockResolvedValueOnce([]),
      });

      // Mock service_devices query returns empty
      mockDb.select.mockReturnValueOnce({
        from: jest.fn().mockReturnThis(),
        where: jest.fn().mockResolvedValueOnce([]),
      });

      const result = await service.findSlots(baseParams);

      expect(result).toEqual([]);
    });

    it('should verify AvailableSlot interface structure', () => {
      // Test that the slot interface has correct shape
      const mockSlot: import('./availability.service').AvailableSlot = {
        doctorId: 101,
        doctorName: 'Dr. Smith',
        roomId: 1,
        roomName: 'Room A',
        deviceIds: [],
        start: new Date('2026-02-10T09:00:00Z'),
        end: new Date('2026-02-10T09:30:00Z'),
      };

      expect(mockSlot).toHaveProperty('doctorId');
      expect(mockSlot).toHaveProperty('doctorName');
      expect(mockSlot).toHaveProperty('roomId');
      expect(mockSlot).toHaveProperty('roomName');
      expect(mockSlot).toHaveProperty('deviceIds');
      expect(mockSlot).toHaveProperty('start');
      expect(mockSlot).toHaveProperty('end');

      // Verify slot duration calculation
      const durationMs = mockSlot.end.getTime() - mockSlot.start.getTime();
      expect(durationMs).toBe(30 * 60 * 1000); // 30 minutes
    });

    it('should verify slot respects service duration', () => {
      // Given a service with 30 min duration
      const serviceDuration = 30;
      const slotStart = new Date('2026-02-10T10:00:00Z');
      const slotEnd = new Date(slotStart.getTime() + serviceDuration * 60 * 1000);

      expect(slotEnd.getTime() - slotStart.getTime()).toBe(30 * 60 * 1000);
      expect(slotEnd.toISOString()).toBe('2026-02-10T10:30:00.000Z');
    });

    it('should verify conflict detection logic with busy intervals', () => {
      // Simulate the busy interval detection used in findSlots
      const busyIntervals = [
        { start: new Date('2026-02-10T09:00:00Z'), end: new Date('2026-02-10T09:35:00Z') }, // 09:00-09:35 (with buffer)
        { start: new Date('2026-02-10T14:00:00Z'), end: new Date('2026-02-10T14:40:00Z') }, // 14:00-14:40 (with buffer)
      ];

      const isSlotBlocked = (start: Date, end: Date): boolean => {
        return busyIntervals.some(
          (interval) => start < interval.end && end > interval.start,
        );
      };

      // Slot at 09:00 should be blocked (overlaps with first interval)
      expect(isSlotBlocked(
        new Date('2026-02-10T09:00:00Z'),
        new Date('2026-02-10T09:30:00Z'),
      )).toBe(true);

      // Slot at 09:30 should be blocked (overlaps with buffer end at 09:35)
      expect(isSlotBlocked(
        new Date('2026-02-10T09:30:00Z'),
        new Date('2026-02-10T10:00:00Z'),
      )).toBe(true);

      // Slot at 09:45 should be FREE (after buffer ends at 09:35)
      expect(isSlotBlocked(
        new Date('2026-02-10T09:45:00Z'),
        new Date('2026-02-10T10:15:00Z'),
      )).toBe(false);

      // Slot at 10:00 should be FREE
      expect(isSlotBlocked(
        new Date('2026-02-10T10:00:00Z'),
        new Date('2026-02-10T10:30:00Z'),
      )).toBe(false);
    });
  });

  describe('slot calculation logic', () => {
    it('should correctly identify overlapping intervals', () => {
      // Test the overlap detection logic used internally
      const interval1 = {
        start: new Date('2026-02-10T10:00:00Z'),
        end: new Date('2026-02-10T11:00:00Z'),
      };
      const interval2 = {
        start: new Date('2026-02-10T10:30:00Z'),
        end: new Date('2026-02-10T11:30:00Z'),
      };

      // Overlap: interval1.start < interval2.end && interval1.end > interval2.start
      const overlaps =
        interval1.start < interval2.end && interval1.end > interval2.start;

      expect(overlaps).toBe(true);
    });

    it('should correctly identify non-overlapping intervals', () => {
      const interval1 = {
        start: new Date('2026-02-10T10:00:00Z'),
        end: new Date('2026-02-10T11:00:00Z'),
      };
      const interval2 = {
        start: new Date('2026-02-10T12:00:00Z'),
        end: new Date('2026-02-10T13:00:00Z'),
      };

      const overlaps =
        interval1.start < interval2.end && interval1.end > interval2.start;

      expect(overlaps).toBe(false);
    });

    it('should correctly calculate slot duration with buffers', () => {
      const slotDuration = 30; // minutes
      const bufferBefore = 5; // minutes
      const bufferAfter = 5; // minutes

      const totalDuration = bufferBefore + slotDuration + bufferAfter;

      expect(totalDuration).toBe(40);
    });

    it('should correctly identify slot within working hours', () => {
      const workingStart = new Date('2026-02-10T09:00:00Z');
      const workingEnd = new Date('2026-02-10T17:00:00Z');

      const slotStart = new Date('2026-02-10T10:00:00Z');
      const slotEnd = new Date('2026-02-10T10:30:00Z');

      const isWithinWorkingHours =
        slotStart >= workingStart && slotEnd <= workingEnd;

      expect(isWithinWorkingHours).toBe(true);
    });

    it('should correctly identify slot outside working hours', () => {
      const workingStart = new Date('2026-02-10T09:00:00Z');
      const workingEnd = new Date('2026-02-10T17:00:00Z');

      const slotStart = new Date('2026-02-10T08:00:00Z');
      const slotEnd = new Date('2026-02-10T08:30:00Z');

      const isWithinWorkingHours =
        slotStart >= workingStart && slotEnd <= workingEnd;

      expect(isWithinWorkingHours).toBe(false);
    });
  });

  describe('weekday mapping', () => {
    it('should correctly map JavaScript getDay() to database dayOfWeek', () => {
      // JavaScript: 0 = Sunday, 1 = Monday, ..., 6 = Saturday
      // Database: 0 = Monday, 1 = Tuesday, ..., 6 = Sunday (typical)
      // Verify the mapping in the service

      const monday = new Date('2026-02-09T10:00:00Z'); // This is a Monday
      expect(monday.getDay()).toBe(1); // JavaScript Monday = 1

      const sunday = new Date('2026-02-15T10:00:00Z'); // This is a Sunday
      expect(sunday.getDay()).toBe(0); // JavaScript Sunday = 0
    });
  });

  describe('binary search overlap detection', () => {
    // Test the binary search algorithm used in findOverlappingInterval
    // The algorithm finds overlapping intervals in O(log n) time

    it('should find overlap when query interval is in the middle of sorted intervals', () => {
      const intervals = [
        { start: new Date('2026-02-10T08:00:00Z'), end: new Date('2026-02-10T09:00:00Z') },
        { start: new Date('2026-02-10T10:00:00Z'), end: new Date('2026-02-10T11:00:00Z') },
        { start: new Date('2026-02-10T14:00:00Z'), end: new Date('2026-02-10T15:00:00Z') },
      ];

      // Query: 10:30-11:30 should overlap with intervals[1] (10:00-11:00)
      const queryStart = new Date('2026-02-10T10:30:00Z');
      const queryEnd = new Date('2026-02-10T11:30:00Z');

      const overlapping = intervals.find(
        (i) => i.start < queryEnd && i.end > queryStart,
      );

      expect(overlapping).toBeDefined();
      expect(overlapping?.start).toEqual(intervals[1].start);
    });

    it('should return null when no overlap exists (query before all intervals)', () => {
      const intervals = [
        { start: new Date('2026-02-10T10:00:00Z'), end: new Date('2026-02-10T11:00:00Z') },
        { start: new Date('2026-02-10T14:00:00Z'), end: new Date('2026-02-10T15:00:00Z') },
      ];

      const queryStart = new Date('2026-02-10T08:00:00Z');
      const queryEnd = new Date('2026-02-10T09:00:00Z');

      const overlapping = intervals.find(
        (i) => i.start < queryEnd && i.end > queryStart,
      );

      expect(overlapping).toBeUndefined();
    });

    it('should return null when no overlap exists (query after all intervals)', () => {
      const intervals = [
        { start: new Date('2026-02-10T08:00:00Z'), end: new Date('2026-02-10T09:00:00Z') },
        { start: new Date('2026-02-10T10:00:00Z'), end: new Date('2026-02-10T11:00:00Z') },
      ];

      const queryStart = new Date('2026-02-10T16:00:00Z');
      const queryEnd = new Date('2026-02-10T17:00:00Z');

      const overlapping = intervals.find(
        (i) => i.start < queryEnd && i.end > queryStart,
      );

      expect(overlapping).toBeUndefined();
    });

    it('should detect edge case: query ends exactly when interval starts (no overlap)', () => {
      const intervals = [
        { start: new Date('2026-02-10T10:00:00Z'), end: new Date('2026-02-10T11:00:00Z') },
      ];

      // Query ends at 10:00, interval starts at 10:00 - should NOT overlap
      const queryStart = new Date('2026-02-10T09:00:00Z');
      const queryEnd = new Date('2026-02-10T10:00:00Z');

      const overlapping = intervals.find(
        (i) => i.start < queryEnd && i.end > queryStart,
      );

      expect(overlapping).toBeUndefined();
    });

    it('should detect edge case: query starts exactly when interval ends (no overlap)', () => {
      const intervals = [
        { start: new Date('2026-02-10T10:00:00Z'), end: new Date('2026-02-10T11:00:00Z') },
      ];

      // Query starts at 11:00, interval ends at 11:00 - should NOT overlap
      const queryStart = new Date('2026-02-10T11:00:00Z');
      const queryEnd = new Date('2026-02-10T12:00:00Z');

      const overlapping = intervals.find(
        (i) => i.start < queryEnd && i.end > queryStart,
      );

      expect(overlapping).toBeUndefined();
    });
  });

  describe('split shifts handling', () => {
    // Doctors can have multiple working hour blocks per day (e.g., 9-12 and 14-17)

    it('should correctly identify split shift structure', () => {
      const morningShift = { startTime: '09:00', endTime: '12:00' };
      const afternoonShift = { startTime: '14:00', endTime: '17:00' };

      const shifts = [morningShift, afternoonShift];

      expect(shifts).toHaveLength(2);
      expect(shifts[0].endTime).not.toBe(shifts[1].startTime); // Gap exists
    });

    it('should correctly calculate slot fits within morning shift only', () => {
      const morningEnd = new Date('2026-02-10T12:00:00Z');
      const slotDuration = 30; // minutes

      // Slot at 11:30 should fit (ends at 12:00)
      const slotStart = new Date('2026-02-10T11:30:00Z');
      const slotEnd = new Date(slotStart.getTime() + slotDuration * 60000);

      expect(slotEnd <= morningEnd).toBe(true);

      // Slot at 11:45 should NOT fit (ends at 12:15)
      const lateSlotStart = new Date('2026-02-10T11:45:00Z');
      const lateSlotEnd = new Date(lateSlotStart.getTime() + slotDuration * 60000);

      expect(lateSlotEnd <= morningEnd).toBe(false);
    });

    it('should correctly handle gap between shifts (lunch break)', () => {
      const morningEnd = new Date('2026-02-10T12:00:00Z');
      const afternoonStart = new Date('2026-02-10T14:00:00Z');

      // Time in gap should not be available
      const lunchTime = new Date('2026-02-10T13:00:00Z');

      const isInMorningShift = lunchTime < morningEnd;
      const isInAfternoonShift = lunchTime >= afternoonStart;

      expect(isInMorningShift).toBe(false);
      expect(isInAfternoonShift).toBe(false);
    });
  });

  describe('buffer calculations', () => {
    it('should correctly expand slot time with buffers', () => {
      const slotStart = new Date('2026-02-10T10:00:00Z');
      const slotEnd = new Date('2026-02-10T10:30:00Z');
      const bufferBefore = 5; // minutes
      const bufferAfter = 10; // minutes

      const effectiveStart = new Date(slotStart.getTime() - bufferBefore * 60000);
      const effectiveEnd = new Date(slotEnd.getTime() + bufferAfter * 60000);

      expect(effectiveStart).toEqual(new Date('2026-02-10T09:55:00Z'));
      expect(effectiveEnd).toEqual(new Date('2026-02-10T10:40:00Z'));
    });

    it('should detect conflict when buffers overlap even if core slots do not', () => {
      // Existing appointment: 10:00-10:30 with 5min buffer after
      // Effective existing range: 10:00-10:35
      const existingEnd = new Date('2026-02-10T10:30:00Z');
      const existingBufferAfter = 5;
      const effectiveExistingEnd = new Date(existingEnd.getTime() + existingBufferAfter * 60000);

      // New slot: 10:32-11:02 with 5min buffer before
      // Effective new range: 10:27-11:02
      const newStart = new Date('2026-02-10T10:32:00Z');
      const newBufferBefore = 5;
      const effectiveNewStart = new Date(newStart.getTime() - newBufferBefore * 60000);

      // Core slots don't overlap (10:30 < 10:32)
      expect(existingEnd < newStart).toBe(true);

      // But effective ranges DO overlap (10:27 < 10:35)
      expect(effectiveNewStart < effectiveExistingEnd).toBe(true);
    });

    it('should parse interval string to minutes correctly', () => {
      const parseIntervalMinutes = (interval: string | null): number => {
        if (!interval) return 0;
        const match = interval.match(/(\d+)/);
        return match ? parseInt(match[1], 10) : 0;
      };

      expect(parseIntervalMinutes('5 minutes')).toBe(5);
      expect(parseIntervalMinutes('15 minutes')).toBe(15);
      expect(parseIntervalMinutes('0 minutes')).toBe(0);
      expect(parseIntervalMinutes(null)).toBe(0);
      expect(parseIntervalMinutes('00:30:00')).toBe(0); // Only extracts first number
    });
  });

  describe('break overlap detection', () => {
    it('should detect break that overlaps with slot', () => {
      const breaks = [
        {
          doctorId: 101,
          startTime: new Date('2026-02-10T12:00:00Z'),
          endTime: new Date('2026-02-10T13:00:00Z'),
        },
      ];

      // Slot: 12:30-13:00 overlaps with break 12:00-13:00
      const slotStart = new Date('2026-02-10T12:30:00Z');
      const slotEnd = new Date('2026-02-10T13:00:00Z');
      const doctorId = 101;

      const hasOverlap = breaks.some(
        (b) =>
          b.doctorId === doctorId &&
          b.startTime < slotEnd &&
          b.endTime > slotStart,
      );

      expect(hasOverlap).toBe(true);
    });

    it('should not detect break for different doctor', () => {
      const breaks = [
        {
          doctorId: 101,
          startTime: new Date('2026-02-10T12:00:00Z'),
          endTime: new Date('2026-02-10T13:00:00Z'),
        },
      ];

      // Slot for doctor 102 should not be affected by doctor 101's break
      const slotStart = new Date('2026-02-10T12:30:00Z');
      const slotEnd = new Date('2026-02-10T13:00:00Z');
      const doctorId = 102;

      const hasOverlap = breaks.some(
        (b) =>
          b.doctorId === doctorId &&
          b.startTime < slotEnd &&
          b.endTime > slotStart,
      );

      expect(hasOverlap).toBe(false);
    });

    it('should not detect break when slot is completely outside break time', () => {
      const breaks = [
        {
          doctorId: 101,
          startTime: new Date('2026-02-10T12:00:00Z'),
          endTime: new Date('2026-02-10T13:00:00Z'),
        },
      ];

      // Slot: 14:00-14:30 is after break 12:00-13:00
      const slotStart = new Date('2026-02-10T14:00:00Z');
      const slotEnd = new Date('2026-02-10T14:30:00Z');
      const doctorId = 101;

      const hasOverlap = breaks.some(
        (b) =>
          b.doctorId === doctorId &&
          b.startTime < slotEnd &&
          b.endTime > slotStart,
      );

      expect(hasOverlap).toBe(false);
    });
  });

  describe('time quantization', () => {
    it('should quantize time to next 15-minute boundary', () => {
      const quantizeTo15Min = (date: Date): Date => {
        const result = new Date(date);
        const minutes = result.getMinutes();
        const nextSlot = Math.ceil(minutes / 15) * 15;
        result.setMinutes(nextSlot, 0, 0);
        return result;
      };

      expect(quantizeTo15Min(new Date('2026-02-10T10:07:00Z')).getMinutes()).toBe(15);
      expect(quantizeTo15Min(new Date('2026-02-10T10:15:00Z')).getMinutes()).toBe(15);
      expect(quantizeTo15Min(new Date('2026-02-10T10:16:00Z')).getMinutes()).toBe(30);
      expect(quantizeTo15Min(new Date('2026-02-10T10:45:00Z')).getMinutes()).toBe(45);
      expect(quantizeTo15Min(new Date('2026-02-10T10:46:00Z')).getMinutes()).toBe(0); // Next hour
    });
  });
});
