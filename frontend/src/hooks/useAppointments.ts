import { useQuery } from '@tanstack/react-query';
import { appointmentsApi } from '../api/index.ts';

export function useAppointments(from: Date, to: Date) {
  return useQuery({
    queryKey: ['appointments', from.toISOString(), to.toISOString()],
    queryFn: () =>
      appointmentsApi.getSchedule(from.toISOString(), to.toISOString()),
  });
}
