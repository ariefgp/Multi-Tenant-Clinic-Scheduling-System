import { z } from 'zod';

export const CreateAppointmentSchema = z.object({
  doctor_id: z.number().int().positive(),
  patient_id: z.number().int().positive(),
  service_id: z.number().int().positive(),
  room_id: z.number().int().positive().nullable().optional(),
  device_ids: z.array(z.number().int().positive()).optional().default([]),
  starts_at: z.string().datetime({ offset: true }),
  notes: z.string().max(1000).optional(),
  idempotency_key: z.string().max(64).optional(),
});

export type CreateAppointmentDto = z.infer<typeof CreateAppointmentSchema>;
