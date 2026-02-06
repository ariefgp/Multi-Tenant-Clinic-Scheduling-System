import api from './client.ts';
import type {
  Appointment,
  Doctor,
  Patient,
  Service,
  Room,
  AvailabilityResponse,
  CreateAppointmentRequest,
} from '../types/index.ts';

export const doctorsApi = {
  list: (params?: { service_id?: number }) =>
    api.get<Doctor[]>('/doctors', { params }).then((r) => r.data),
};

export const patientsApi = {
  list: () => api.get<Patient[]>('/patients').then((r) => r.data),
};

export const servicesApi = {
  list: () => api.get<Service[]>('/services').then((r) => r.data),
};

export const roomsApi = {
  list: () => api.get<Room[]>('/rooms').then((r) => r.data),
};

export const appointmentsApi = {
  create: (data: CreateAppointmentRequest) =>
    api.post<Appointment>('/appointments', data).then((r) => r.data),

  cancel: (id: number) => api.delete(`/appointments/${id}`),

  reschedule: (id: number, data: { starts_at: string; doctor_id?: number; room_id?: number | null }) =>
    api.patch<Appointment>(`/appointments/${id}`, data).then((r) => r.data),

  getSchedule: (from: string, to: string) =>
    api.get<Appointment[]>('/schedule', { params: { from, to } }).then((r) => r.data),

  getDoctorSchedule: (doctorId: number, from: string, to: string) =>
    api
      .get<Appointment[]>(`/doctors/${doctorId}/schedule`, { params: { from, to } })
      .then((r) => r.data),
};

export const availabilityApi = {
  search: (params: {
    service_id: number;
    from: string;
    to: string;
    doctor_ids?: string;
    limit?: number;
  }) =>
    api
      .get<AvailabilityResponse>('/availability', { params })
      .then((r) => r.data),
};
