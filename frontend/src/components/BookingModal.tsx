import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format, addDays, startOfDay, isSameDay } from 'date-fns';
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
import { Combobox } from './ui/combobox.tsx';
import { Calendar } from './ui/calendar.tsx';
import { Clock, User, Stethoscope, MapPin } from 'lucide-react';
import type { AvailableSlot } from '../types/index.ts';

type Step = 'select' | 'slots' | 'confirm';

interface BookingModalProps {
  initialDate?: Date;
  onClose: () => void;
}

export function BookingModal({ initialDate, onClose }: BookingModalProps) {
  const queryClient = useQueryClient();
  const [step, setStep] = useState<Step>('select');
  const [selectedService, setSelectedService] = useState<string | null>(null);
  const [selectedDoctor, setSelectedDoctor] = useState<string | null>(null);
  const [selectedPatient, setSelectedPatient] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date>(
    initialDate ?? new Date(),
  );
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

  const fromDate = useMemo(() => startOfDay(new Date()), []);
  const { data: availability, isLoading: isLoadingSlots } = useQuery({
    queryKey: [
      'availability',
      selectedService,
      selectedDoctor,
      fromDate.getTime(),
    ],
    queryFn: () =>
      availabilityApi.search({
        service_id: Number(selectedService),
        from: fromDate.toISOString(),
        to: addDays(fromDate, 30).toISOString(),
        doctor_ids: selectedDoctor ?? undefined,
        limit: 100,
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
      patient_id: Number(selectedPatient),
      service_id: Number(selectedService),
      room_id: selectedSlot.room_id,
      device_ids: selectedSlot.device_ids,
      starts_at: selectedSlot.start,
    });
  };

  const selectedServiceData = servicesList?.find(
    (s) => s.id === Number(selectedService),
  );

  const serviceOptions = useMemo(
    () =>
      servicesList?.map((s) => ({
        value: String(s.id),
        label: s.name,
        description: `${s.durationMinutes} min`,
      })) ?? [],
    [servicesList],
  );

  const doctorOptions = useMemo(
    () =>
      doctorsList?.map((d) => ({
        value: String(d.id),
        label: d.name,
        description: d.specialty ?? undefined,
      })) ?? [],
    [doctorsList],
  );

  const patientOptions = useMemo(
    () =>
      patientsList?.map((p) => ({
        value: String(p.id),
        label: p.name,
        description: p.email ?? undefined,
      })) ?? [],
    [patientsList],
  );

  // Group slots by date for calendar highlighting
  const datesWithSlots = useMemo(() => {
    if (!availability?.slots) return new Set<string>();
    return new Set(
      availability.slots.map((s) =>
        format(new Date(s.start), 'yyyy-MM-dd'),
      ),
    );
  }, [availability]);

  // Filter slots for selected date
  const slotsForSelectedDate = useMemo(() => {
    if (!availability?.slots) return [];
    return availability.slots.filter((s) =>
      isSameDay(new Date(s.start), selectedDate),
    );
  }, [availability, selectedDate]);

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className={cn(
          'max-h-[90vh]',
          step === 'select' ? 'overflow-visible' : 'overflow-y-auto',
          step === 'slots' ? 'sm:max-w-2xl' : 'sm:max-w-md',
        )}
      >
        <DialogHeader>
          <DialogTitle>Book Appointment</DialogTitle>
        </DialogHeader>

        {step === 'select' && (
          <div className="space-y-4 overflow-visible">
            <div className="relative space-y-2">
              <label className="text-sm font-medium">Service</label>
              <Combobox
                options={serviceOptions}
                value={selectedService}
                onValueChange={setSelectedService}
                placeholder="Select a service"
                searchPlaceholder="Search services..."
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Doctor (optional)</label>
              <Combobox
                options={doctorOptions}
                value={selectedDoctor}
                onValueChange={setSelectedDoctor}
                placeholder="Any available doctor"
                searchPlaceholder="Search doctors..."
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Patient</label>
              <Combobox
                options={patientOptions}
                value={selectedPatient}
                onValueChange={setSelectedPatient}
                placeholder="Select a patient"
                searchPlaceholder="Search patients..."
              />
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
            {isLoadingSlots ? (
              <div className="flex items-center justify-center py-12">
                <div className="text-sm text-muted-foreground">
                  Finding available slots...
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-4 sm:flex-row">
                {/* Calendar */}
                <div className="shrink-0">
                  <Calendar
                    mode="single"
                    selected={selectedDate}
                    onSelect={(date) => date && setSelectedDate(date)}
                    disabled={(date) =>
                      date < startOfDay(new Date()) ||
                      !datesWithSlots.has(format(date, 'yyyy-MM-dd'))
                    }
                    modifiers={{
                      hasSlots: (date) =>
                        datesWithSlots.has(format(date, 'yyyy-MM-dd')),
                    }}
                    modifiersClassNames={{
                      hasSlots: 'bg-blue-100 text-blue-900 font-medium',
                    }}
                  />
                </div>

                {/* Time slots */}
                <div className="flex-1 border-t pt-4 sm:border-l sm:border-t-0 sm:pl-4 sm:pt-0">
                  <h4 className="mb-3 text-sm font-medium">
                    {format(selectedDate, 'EEEE, MMMM d')}
                  </h4>
                  {slotsForSelectedDate.length === 0 ? (
                    <p className="py-4 text-center text-sm text-muted-foreground">
                      No available slots for this date.
                      <br />
                      Select a highlighted date.
                    </p>
                  ) : (
                    <div className="grid max-h-64 grid-cols-2 gap-2 overflow-y-auto">
                      {slotsForSelectedDate.map((slot, idx) => (
                        <button
                          key={idx}
                          className={cn(
                            'rounded-md border px-3 py-2 text-left text-sm transition-colors hover:border-blue-500 hover:bg-blue-50',
                            selectedSlot === slot &&
                              'border-blue-500 bg-blue-50 ring-1 ring-blue-500',
                          )}
                          onClick={() => setSelectedSlot(slot)}
                        >
                          <div className="font-medium">
                            {format(new Date(slot.start), 'h:mm a')}
                          </div>
                          <div className="truncate text-xs text-muted-foreground">
                            Dr. {slot.doctor_name}
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className="flex gap-2 border-t pt-4">
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
              <CardContent className="space-y-3 p-4">
                <div className="flex items-center gap-3 text-sm">
                  <Stethoscope className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <div className="font-medium">{selectedServiceData?.name}</div>
                    <div className="text-muted-foreground">
                      {selectedServiceData?.durationMinutes} minutes
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3 text-sm">
                  <User className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <div className="font-medium">{selectedSlot.doctor_name}</div>
                    <div className="text-muted-foreground">Doctor</div>
                  </div>
                </div>
                <div className="flex items-center gap-3 text-sm">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <div className="font-medium">
                      {format(new Date(selectedSlot.start), 'EEEE, MMMM d, yyyy')}
                    </div>
                    <div className="text-muted-foreground">
                      {format(new Date(selectedSlot.start), 'h:mm a')} -{' '}
                      {format(new Date(selectedSlot.end), 'h:mm a')}
                    </div>
                  </div>
                </div>
                {selectedSlot.room_name && (
                  <div className="flex items-center gap-3 text-sm">
                    <MapPin className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <div className="font-medium">{selectedSlot.room_name}</div>
                      <div className="text-muted-foreground">Room</div>
                    </div>
                  </div>
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
