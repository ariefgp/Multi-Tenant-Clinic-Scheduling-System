import { Test, TestingModule } from '@nestjs/testing';
import {
  ConflictException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { AppointmentService } from './appointment.service';
import { ConflictCheckerService } from './services/conflict-checker.service';
import { DATABASE_CONNECTION } from '../../database/database.module';

describe('AppointmentService', () => {
  let service: AppointmentService;
  let conflictChecker: jest.Mocked<ConflictCheckerService>;
  let mockDb: {
    select: jest.Mock;
    insert: jest.Mock;
    update: jest.Mock;
    delete: jest.Mock;
  };

  const mockService = {
    id: 1,
    tenantId: 1,
    name: 'General Consultation',
    durationMinutes: 30,
    bufferBeforeMin: 5,
    bufferAfterMin: 5,
    requiresRoom: true,
    isActive: true,
    color: '#3B82F6',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockAppointment = {
    id: 1,
    tenantId: 1,
    doctorId: 101,
    patientId: 501,
    serviceId: 1,
    roomId: 11,
    startsAt: new Date('2026-02-10T10:00:00Z'),
    endsAt: new Date('2026-02-10T10:30:00Z'),
    status: 'scheduled',
    bufferBefore: '5 minutes',
    bufferAfter: '5 minutes',
    notes: null,
    idempotencyKey: null,
    version: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const createMockQuery = (results: unknown[] = []) => {
    return {
      from: jest.fn().mockReturnThis(),
      innerJoin: jest.fn().mockReturnThis(),
      leftJoin: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      values: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      returning: jest.fn().mockResolvedValue(results),
    };
  };

  beforeEach(async () => {
    mockDb = {
      select: jest.fn(),
      insert: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AppointmentService,
        {
          provide: ConflictCheckerService,
          useValue: {
            findConflicts: jest.fn(),
          },
        },
        {
          provide: DATABASE_CONNECTION,
          useValue: mockDb,
        },
      ],
    }).compile();

    service = module.get<AppointmentService>(AppointmentService);
    conflictChecker = module.get(ConflictCheckerService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    const createDto = {
      doctor_id: 101,
      patient_id: 501,
      service_id: 1,
      room_id: 11,
      device_ids: [] as number[],
      starts_at: '2026-02-10T10:00:00Z',
    };

    it('should create an appointment when no conflicts exist', async () => {
      // Mock service lookup
      mockDb.select.mockReturnValueOnce(createMockQuery([mockService]));

      // Mock no conflicts
      conflictChecker.findConflicts.mockResolvedValueOnce([]);

      // Mock appointment insert
      mockDb.insert.mockReturnValueOnce(createMockQuery([mockAppointment]));

      // Mock audit log insert
      mockDb.insert.mockReturnValueOnce(createMockQuery([]));

      const result = await service.create(1, createDto);

      expect(result).toEqual(mockAppointment);
      expect(conflictChecker.findConflicts).toHaveBeenCalled();
    });

    it('should throw ConflictException when conflicts exist', async () => {
      // Mock service lookup
      mockDb.select.mockReturnValueOnce(createMockQuery([mockService]));

      // Mock conflicts found
      conflictChecker.findConflicts.mockResolvedValueOnce([
        {
          resourceType: 'doctor',
          resourceId: 101,
          resourceName: 'Dr. Smith',
          appointmentId: 999,
          conflictingRange: {
            start: new Date('2026-02-10T10:00:00Z'),
            end: new Date('2026-02-10T10:30:00Z'),
          },
        },
      ]);

      await expect(service.create(1, createDto)).rejects.toThrow(
        ConflictException,
      );
    });

    it('should throw BadRequestException when service requires room but none provided', async () => {
      // Mock service lookup
      mockDb.select.mockReturnValueOnce(createMockQuery([mockService]));

      const dtoWithoutRoom = {
        ...createDto,
        room_id: undefined,
      };

      await expect(service.create(1, dtoWithoutRoom)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw NotFoundException when service not found', async () => {
      // Mock service not found
      mockDb.select.mockReturnValueOnce(createMockQuery([]));

      await expect(service.create(1, createDto)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should handle database exclusion constraint violation (race condition)', async () => {
      // Mock service lookup
      mockDb.select.mockReturnValueOnce(createMockQuery([mockService]));

      // Mock no conflicts on first check
      conflictChecker.findConflicts.mockResolvedValueOnce([]);

      // Mock database exclusion constraint error
      const exclusionError = { code: '23P01', constraint: 'no_doctor_overlap' };
      mockDb.insert.mockReturnValueOnce({
        values: jest.fn().mockReturnThis(),
        returning: jest.fn().mockRejectedValueOnce(exclusionError),
      });

      // Mock conflict check after race condition
      conflictChecker.findConflicts.mockResolvedValueOnce([
        {
          resourceType: 'doctor',
          resourceId: 101,
          resourceName: 'Dr. Smith',
          appointmentId: 999,
          conflictingRange: {
            start: new Date('2026-02-10T10:00:00Z'),
            end: new Date('2026-02-10T10:30:00Z'),
          },
        },
      ]);

      await expect(service.create(1, createDto)).rejects.toThrow(
        ConflictException,
      );
    });
  });

  describe('cancel', () => {
    it('should cancel an existing appointment', async () => {
      const cancelledAppointment = {
        ...mockAppointment,
        status: 'cancelled',
      };

      // Mock update
      mockDb.update.mockReturnValueOnce(createMockQuery([cancelledAppointment]));

      // Mock audit log
      mockDb.insert.mockReturnValueOnce(createMockQuery([]));

      const result = await service.cancel(1, 1);

      expect(result.status).toBe('cancelled');
    });

    it('should throw NotFoundException when appointment not found', async () => {
      // Mock update returns nothing
      mockDb.update.mockReturnValueOnce(createMockQuery([]));

      await expect(service.cancel(1, 999)).rejects.toThrow(NotFoundException);
    });
  });

  describe('reschedule', () => {
    const rescheduleDto = {
      starts_at: '2026-02-10T14:00:00Z',
    };

    it('should reschedule an existing appointment', async () => {
      // Mock existing appointment lookup
      mockDb.select.mockReturnValueOnce(createMockQuery([mockAppointment]));

      // Mock service lookup
      mockDb.select.mockReturnValueOnce(createMockQuery([mockService]));

      // Mock no conflicts
      conflictChecker.findConflicts.mockResolvedValueOnce([]);

      const rescheduledAppointment = {
        ...mockAppointment,
        startsAt: new Date('2026-02-10T14:00:00Z'),
        endsAt: new Date('2026-02-10T14:30:00Z'),
      };

      // Mock update
      mockDb.update.mockReturnValueOnce(
        createMockQuery([rescheduledAppointment]),
      );

      // Mock audit log
      mockDb.insert.mockReturnValueOnce(createMockQuery([]));

      const result = await service.reschedule(1, 1, rescheduleDto);

      expect(result.startsAt).toEqual(new Date('2026-02-10T14:00:00Z'));
    });

    it('should throw NotFoundException when appointment not found', async () => {
      mockDb.select.mockReturnValueOnce(createMockQuery([]));

      await expect(service.reschedule(1, 999, rescheduleDto)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw BadRequestException when trying to reschedule cancelled appointment', async () => {
      const cancelledAppointment = {
        ...mockAppointment,
        status: 'cancelled',
      };

      mockDb.select.mockReturnValueOnce(createMockQuery([cancelledAppointment]));

      await expect(service.reschedule(1, 1, rescheduleDto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw ConflictException when new time has conflicts', async () => {
      // Mock existing appointment lookup
      mockDb.select.mockReturnValueOnce(createMockQuery([mockAppointment]));

      // Mock service lookup
      mockDb.select.mockReturnValueOnce(createMockQuery([mockService]));

      // Mock conflicts found
      conflictChecker.findConflicts.mockResolvedValueOnce([
        {
          resourceType: 'doctor',
          resourceId: 101,
          resourceName: 'Dr. Smith',
          appointmentId: 888,
          conflictingRange: {
            start: new Date('2026-02-10T14:00:00Z'),
            end: new Date('2026-02-10T14:30:00Z'),
          },
        },
      ]);

      await expect(service.reschedule(1, 1, rescheduleDto)).rejects.toThrow(
        ConflictException,
      );
    });
  });

  describe('findOne', () => {
    it('should return an appointment by id', async () => {
      mockDb.select.mockReturnValueOnce(createMockQuery([mockAppointment]));

      const result = await service.findOne(1, 1);

      expect(result).toEqual(mockAppointment);
    });

    it('should throw NotFoundException when appointment not found', async () => {
      mockDb.select.mockReturnValueOnce(createMockQuery([]));

      await expect(service.findOne(1, 999)).rejects.toThrow(NotFoundException);
    });
  });
});
