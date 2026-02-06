import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format, addDays } from 'date-fns';
import {
  servicesApi,
  doctorsApi,
  patientsApi,
  availabilityApi,
  appointmentsApi,
} from '../api/index.ts';
import { cn } from '../lib/utils.ts';
import { Button } from './ui/button.tsx';
import { Card, CardContent } from './ui/card.tsx';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from './ui/dialog.tsx';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select.tsx';
import type { AvailableSlot } from '../types/index.ts';

type Step = 'select' | 'slots' | 'confirm';

interface BookingModalProps {
  initialDate?: Date;
  onClose: () => void;
}

export function BookingModal({ initialDate, onClose }: BookingModalProps) {
  const queryClient = useQueryClient();
  const [step, setStep] = useState<Step>('select');
  const [selectedService, setSelectedService] = useState<number | null>(null);
  const [selectedDoctor, setSelectedDoctor] = useState<number | null>(null);
  const [selectedPatient, setSelectedPatient] = useState<number | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<AvailableSlot | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data: servicesList } = useQuery({
    queryKey: ['services'],
    queryFn: servicesApi.list,
  });

  const { data: doctorsList } = useQuery({
    queryKey: ['doctors'],
    queryFn: doctorsApi.list,
  });

  const { data: patientsList } = useQuery({
    queryKey: ['patients'],
    queryFn: patientsApi.list,
  });

  const fromDate = initialDate ?? new Date();
  const { data: availability, isLoading: isLoadingSlots } = useQuery({
    queryKey: [
      'availability',
      selectedService,
      selectedDoctor,
      fromDate.toISOString(),
    ],
    queryFn: () =>
      availabilityApi.search({
        service_id: selectedService!,
        from: fromDate.toISOString(),
        to: addDays(fromDate, 7).toISOString(),
        doctor_ids: selectedDoctor ? String(selectedDoctor) : undefined,
        limit: 10,
      }),
    enabled: !!selectedService && step === 'slots',
  });

  const createMutation = useMutation({
    mutationFn: appointmentsApi.create,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['appointments'] });
      onClose();
    },
    onError: (err: unknown) => {
      const axiosErr = err as { response?: { data?: { message?: string } } };
      setError(
        axiosErr.response?.data?.message ?? 'Failed to create appointment',
      );
    },
  });

  const handleConfirm = () => {
    if (!selectedSlot || !selectedPatient || !selectedService) return;
    createMutation.mutate({
      doctor_id: selectedSlot.doctor_id,
      patient_id: selectedPatient,
      service_id: selectedService,
      room_id: selectedSlot.room_id,
      device_ids: selectedSlot.device_ids,
      starts_at: selectedSlot.start,
    });
  };

  const selectedServiceData = servicesList?.find(
    (s) => s.id === selectedService,
  );

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Book Appointment</DialogTitle>
        </DialogHeader>

        {step === 'select' && (
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Service</label>
              <Select
                value={selectedService?.toString() ?? ''}
                onValueChange={(val) => setSelectedService(Number(val) || null)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a service" />
                </SelectTrigger>
                <SelectContent>
                  {servicesList?.map((s) => (
                    <SelectItem key={s.id} value={s.id.toString()}>
                      {s.name} ({s.durationMinutes} min)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Doctor (optional)</label>
              <Select
                value={selectedDoctor?.toString() ?? ''}
                onValueChange={(val) => setSelectedDoctor(Number(val) || null)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Any available doctor" />
                </SelectTrigger>
                <SelectContent>
                  {doctorsList?.map((d) => (
                    <SelectItem key={d.id} value={d.id.toString()}>
                      {d.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Patient</label>
              <Select
                value={selectedPatient?.toString() ?? ''}
                onValueChange={(val) => setSelectedPatient(Number(val) || null)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a patient" />
                </SelectTrigger>
                <SelectContent>
                  {patientsList?.map((p) => (
                    <SelectItem key={p.id} value={p.id.toString()}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Button
              className="w-full"
              disabled={!selectedService || !selectedPatient}
              onClick={() => setStep('slots')}
            >
              Find Available Slots
            </Button>
          </div>
        )}

        {step === 'slots' && (
          <div className="space-y-4">
            <h3 className="font-medium">Available Slots</h3>

            {isLoadingSlots && (
              <p className="text-sm text-gray-500">Searching...</p>
            )}

            {!isLoadingSlots && availability?.slots.length === 0 && (
              <p className="text-sm text-gray-500">
                No available slots found in the next 7 days.
              </p>
            )}

            <div className="max-h-64 space-y-2 overflow-y-auto">
              {availability?.slots.map((slot, idx) => (
                <button
                  key={idx}
                  className={cn(
                    'w-full rounded-md border p-3 text-left transition-colors hover:border-blue-500',
                    selectedSlot === slot && 'border-blue-500 bg-blue-50',
                  )}
                  onClick={() => setSelectedSlot(slot)}
                >
                  <div className="text-sm font-medium">
                    {format(new Date(slot.start), 'EEE, MMM d')} at{' '}
                    {format(new Date(slot.start), 'h:mm a')}
                  </div>
                  <div className="text-xs text-gray-500">
                    Dr. {slot.doctor_name}
                    {slot.room_name ? ` \u2022 ${slot.room_name}` : ''}
                  </div>
                </button>
              ))}
            </div>

            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => {
                  setSelectedSlot(null);
                  setStep('select');
                }}
              >
                Back
              </Button>
              <Button
                className="flex-1"
                disabled={!selectedSlot}
                onClick={() => setStep('confirm')}
              >
                Continue
              </Button>
            </div>
          </div>
        )}

        {step === 'confirm' && selectedSlot && (
          <div className="space-y-4">
            <h3 className="font-medium">Confirm Booking</h3>

            {error && (
              <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                {error}
              </div>
            )}

            <Card>
              <CardContent className="space-y-2 p-4 text-sm">
                <p>
                  <span className="font-medium">Service:</span>{' '}
                  {selectedServiceData?.name}
                </p>
                <p>
                  <span className="font-medium">Doctor:</span>{' '}
                  {selectedSlot.doctor_name}
                </p>
                <p>
                  <span className="font-medium">Date:</span>{' '}
                  {format(new Date(selectedSlot.start), 'EEEE, MMMM d, yyyy')}
                </p>
                <p>
                  <span className="font-medium">Time:</span>{' '}
                  {format(new Date(selectedSlot.start), 'h:mm a')} -{' '}
                  {format(new Date(selectedSlot.end), 'h:mm a')}
                </p>
                {selectedSlot.room_name && (
                  <p>
                    <span className="font-medium">Room:</span>{' '}
                    {selectedSlot.room_name}
                  </p>
                )}
              </CardContent>
            </Card>

            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setStep('slots')}
              >
                Back
              </Button>
              <Button
                className="flex-1 bg-green-600 hover:bg-green-700"
                disabled={createMutation.isPending}
                onClick={handleConfirm}
              >
                {createMutation.isPending ? 'Booking...' : 'Confirm Booking'}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
