export interface Appointment {
  id: number;
  tenantId: number;
  doctorId: number;
  patientId: number;
  serviceId: number;
  roomId: number | null;
  startsAt: string;
  endsAt: string;
  status: string;
  notes: string | null;
  patientName: string;
  serviceName: string;
  serviceColor: string | null;
  roomName: string | null;
  doctorName: string;
}

export interface Doctor {
  id: number;
  tenantId: number;
  name: string;
  email: string | null;
  specialty: string | null;
  isActive: boolean;
}

export interface Patient {
  id: number;
  tenantId: number;
  name: string;
  email: string | null;
  phone: string | null;
}

export interface Service {
  id: number;
  tenantId: number;
  name: string;
  durationMinutes: number;
  bufferBeforeMin: number;
  bufferAfterMin: number;
  requiresRoom: boolean;
  color: string | null;
  isActive: boolean;
  doctorIds: number[];
  deviceIds: number[];
}

export interface Room {
  id: number;
  tenantId: number;
  name: string;
  roomType: string | null;
  isActive: boolean;
}

export interface AvailableSlot {
  doctor_id: number;
  doctor_name: string;
  room_id: number | null;
  room_name: string | null;
  device_ids: number[];
  start: string;
  end: string;
}

export interface AvailabilityResponse {
  slots: AvailableSlot[];
  limit: number;
}

export interface CreateAppointmentRequest {
  doctor_id: number;
  patient_id: number;
  service_id: number;
  room_id: number | null;
  device_ids: number[];
  starts_at: string;
}

export interface ConflictError {
  error: string;
  message: string;
  conflicts: {
    resourceType: string;
    resourceId: number;
    resourceName: string;
  }[];
}
