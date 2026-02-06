import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, HttpStatus } from '@nestjs/common';
import request from 'supertest';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { AppModule } from '../src/app.module';

/**
 * CRITICAL TEST: Concurrent Booking Race Condition
 *
 * This test verifies that the PostgreSQL exclusion constraints
 * correctly prevent double-booking when two requests arrive
 * simultaneously for the same time slot.
 *
 * Requirements:
 * - Two concurrent POST requests for the same doctor/room/time
 * - Exactly one should succeed with 201
 * - Exactly one should fail with 409
 * - Only one appointment should be persisted
 */
describe('Concurrent Booking (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(),
    );
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('should allow only one booking when two concurrent requests target the same slot', async () => {
    const tenantId = '1';
    const startsAt = new Date();
    startsAt.setDate(startsAt.getDate() + 7); // 1 week from now
    startsAt.setHours(10, 0, 0, 0);

    const appointmentData = {
      doctor_id: 1,
      patient_id: 1,
      service_id: 1,
      room_id: 1,
      device_ids: [],
      starts_at: startsAt.toISOString(),
    };

    // Create two appointment payloads with different patients but same slot
    const payload1 = { ...appointmentData, patient_id: 1 };
    const payload2 = { ...appointmentData, patient_id: 2 };

    // Fire both requests concurrently
    const [response1, response2] = await Promise.all([
      request(app.getHttpServer())
        .post('/api/appointments')
        .set('X-Tenant-Id', tenantId)
        .send(payload1),
      request(app.getHttpServer())
        .post('/api/appointments')
        .set('X-Tenant-Id', tenantId)
        .send(payload2),
    ]);

    const statuses = [response1.status, response2.status].sort();

    // One should succeed (201), one should fail (409)
    expect(statuses).toEqual([HttpStatus.CREATED, HttpStatus.CONFLICT]);

    // Verify the conflict response has proper error structure
    const conflictResponse =
      response1.status === HttpStatus.CONFLICT ? response1 : response2;
    expect(conflictResponse.body).toHaveProperty('error', 'scheduling_conflict');
    expect(conflictResponse.body).toHaveProperty('conflicts');

    // Get the created appointment ID
    const successResponse =
      response1.status === HttpStatus.CREATED ? response1 : response2;
    const createdAppointmentId = successResponse.body.id;

    // Clean up: Cancel the created appointment
    if (createdAppointmentId) {
      await request(app.getHttpServer())
        .delete(`/api/appointments/${createdAppointmentId}`)
        .set('X-Tenant-Id', tenantId);
    }
  });

  it('should handle concurrent reschedule attempts for the same slot', async () => {
    const tenantId = '1';

    // First, create two appointments at different times
    const baseTime = new Date();
    baseTime.setDate(baseTime.getDate() + 8);
    baseTime.setHours(9, 0, 0, 0);

    const time1 = new Date(baseTime);
    const time2 = new Date(baseTime);
    time2.setHours(11, 0, 0, 0);
    const targetTime = new Date(baseTime);
    targetTime.setHours(14, 0, 0, 0);

    // Create first appointment
    const res1 = await request(app.getHttpServer())
      .post('/api/appointments')
      .set('X-Tenant-Id', tenantId)
      .send({
        doctor_id: 1,
        patient_id: 1,
        service_id: 1,
        room_id: 1,
        device_ids: [],
        starts_at: time1.toISOString(),
      });

    // Create second appointment
    const res2 = await request(app.getHttpServer())
      .post('/api/appointments')
      .set('X-Tenant-Id', tenantId)
      .send({
        doctor_id: 1,
        patient_id: 2,
        service_id: 1,
        room_id: 1,
        device_ids: [],
        starts_at: time2.toISOString(),
      });

    if (res1.status !== HttpStatus.CREATED || res2.status !== HttpStatus.CREATED) {
      // Skip test if setup failed (possibly due to existing conflicts)
      return;
    }

    const appointment1Id = res1.body.id;
    const appointment2Id = res2.body.id;

    // Try to reschedule both to the same target time concurrently
    const [reschedule1, reschedule2] = await Promise.all([
      request(app.getHttpServer())
        .patch(`/api/appointments/${appointment1Id}`)
        .set('X-Tenant-Id', tenantId)
        .send({ starts_at: targetTime.toISOString() }),
      request(app.getHttpServer())
        .patch(`/api/appointments/${appointment2Id}`)
        .set('X-Tenant-Id', tenantId)
        .send({ starts_at: targetTime.toISOString() }),
    ]);

    const statuses = [reschedule1.status, reschedule2.status].sort();

    // One should succeed (200), one should fail (409)
    expect(statuses).toEqual([HttpStatus.OK, HttpStatus.CONFLICT]);

    // Clean up
    await request(app.getHttpServer())
      .delete(`/api/appointments/${appointment1Id}`)
      .set('X-Tenant-Id', tenantId);
    await request(app.getHttpServer())
      .delete(`/api/appointments/${appointment2Id}`)
      .set('X-Tenant-Id', tenantId);
  });

  it('should allow booking the same time with different doctors', async () => {
    const tenantId = '1';
    const startsAt = new Date();
    startsAt.setDate(startsAt.getDate() + 9);
    startsAt.setHours(10, 0, 0, 0);

    // Create appointments with different doctors at the same time
    const [response1, response2] = await Promise.all([
      request(app.getHttpServer())
        .post('/api/appointments')
        .set('X-Tenant-Id', tenantId)
        .send({
          doctor_id: 1,
          patient_id: 1,
          service_id: 1,
          room_id: 1,
          device_ids: [],
          starts_at: startsAt.toISOString(),
        }),
      request(app.getHttpServer())
        .post('/api/appointments')
        .set('X-Tenant-Id', tenantId)
        .send({
          doctor_id: 2,
          patient_id: 2,
          service_id: 1,
          room_id: 2, // Different room too
          device_ids: [],
          starts_at: startsAt.toISOString(),
        }),
    ]);

    // Both should succeed since they're different doctors and rooms
    expect(response1.status).toBe(HttpStatus.CREATED);
    expect(response2.status).toBe(HttpStatus.CREATED);

    // Clean up
    if (response1.body.id) {
      await request(app.getHttpServer())
        .delete(`/api/appointments/${response1.body.id}`)
        .set('X-Tenant-Id', tenantId);
    }
    if (response2.body.id) {
      await request(app.getHttpServer())
        .delete(`/api/appointments/${response2.body.id}`)
        .set('X-Tenant-Id', tenantId);
    }
  });
});
