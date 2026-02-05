import { useMutation, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { X } from 'lucide-react';
import { appointmentsApi } from '../api/index.ts';
import type { Appointment } from '../types/index.ts';

interface AppointmentDetailProps {
  appointment: Appointment;
  onClose: () => void;
}

export function AppointmentDetail({
  appointment,
  onClose,
}: AppointmentDetailProps) {
  const queryClient = useQueryClient();

  const cancelMutation = useMutation({
    mutationFn: () => appointmentsApi.cancel(appointment.id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['appointments'] });
      onClose();
    },
  });

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-sm p-6 relative">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-600"
        >
          <X className="w-5 h-5" />
        </button>

        <h2 className="text-lg font-semibold mb-4">Appointment Details</h2>

        <div className="space-y-3 text-sm">
          <div>
            <span className="text-gray-500">Patient</span>
            <p className="font-medium">{appointment.patientName}</p>
          </div>
          <div>
            <span className="text-gray-500">Service</span>
            <p className="font-medium">{appointment.serviceName}</p>
          </div>
          <div>
            <span className="text-gray-500">Doctor</span>
            <p className="font-medium">{appointment.doctorName}</p>
          </div>
          <div>
            <span className="text-gray-500">Date & Time</span>
            <p className="font-medium">
              {format(new Date(appointment.startsAt), 'EEE, MMM d, yyyy')}
              {' \u2022 '}
              {format(new Date(appointment.startsAt), 'h:mm a')} -{' '}
              {format(new Date(appointment.endsAt), 'h:mm a')}
            </p>
          </div>
          {appointment.roomName && (
            <div>
              <span className="text-gray-500">Room</span>
              <p className="font-medium">{appointment.roomName}</p>
            </div>
          )}
          <div>
            <span className="text-gray-500">Status</span>
            <p className="font-medium capitalize">{appointment.status}</p>
          </div>
          {appointment.notes && (
            <div>
              <span className="text-gray-500">Notes</span>
              <p>{appointment.notes}</p>
            </div>
          )}
        </div>

        <div className="mt-6 flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 border py-2 rounded-md hover:bg-gray-50 text-sm"
          >
            Close
          </button>
          <button
            onClick={() => cancelMutation.mutate()}
            disabled={
              cancelMutation.isPending || appointment.status === 'cancelled'
            }
            className="flex-1 bg-red-600 text-white py-2 rounded-md hover:bg-red-700 disabled:opacity-50 text-sm"
          >
            {cancelMutation.isPending ? 'Cancelling...' : 'Cancel Appointment'}
          </button>
        </div>
      </div>
    </div>
  );
}
