import { z } from 'zod';

export const RescheduleAppointmentSchema = z.object({
  starts_at: z.string().datetime({ offset: true }),
  doctor_id: z.number().int().positive().optional(),
  room_id: z.number().int().positive().nullable().optional(),
  device_ids: z.array(z.number().int().positive()).optional(),
});

export type RescheduleAppointmentDto = z.infer<
  typeof RescheduleAppointmentSchema
>;
