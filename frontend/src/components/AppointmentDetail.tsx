import { useMutation, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { appointmentsApi } from '../api/index.ts';
import { Badge } from './ui/badge.tsx';
import { Button } from './ui/button.tsx';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from './ui/dialog.tsx';
import { Separator } from './ui/separator.tsx';
import type { Appointment } from '../types/index.ts';

interface AppointmentDetailProps {
  appointment: Appointment;
  onClose: () => void;
}

const statusVariantMap: Record<
  string,
  'default' | 'success' | 'warning' | 'destructive'
> = {
  scheduled: 'default',
  confirmed: 'success',
  cancelled: 'destructive',
  completed: 'success',
  'no-show': 'warning',
};

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
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Appointment Details</DialogTitle>
        </DialogHeader>

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

          <Separator />

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
            <div className="mt-1">
              <Badge variant={statusVariantMap[appointment.status] ?? 'default'}>
                {appointment.status}
              </Badge>
            </div>
          </div>
          {appointment.notes && (
            <div>
              <span className="text-gray-500">Notes</span>
              <p>{appointment.notes}</p>
            </div>
          )}
        </div>

        <div className="mt-2 flex gap-2">
          <Button variant="outline" className="flex-1" onClick={onClose}>
            Close
          </Button>
          <Button
            variant="destructive"
            className="flex-1"
            onClick={() => cancelMutation.mutate()}
            disabled={
              cancelMutation.isPending || appointment.status === 'cancelled'
            }
          >
            {cancelMutation.isPending ? 'Cancelling...' : 'Cancel Appointment'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
