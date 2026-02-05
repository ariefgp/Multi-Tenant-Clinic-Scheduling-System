import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format, addDays } from 'date-fns';
import { X } from 'lucide-react';
import { servicesApi, doctorsApi, patientsApi, availabilityApi, appointmentsApi } from '../api/index.ts';
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
    queryKey: ['availability', selectedService, selectedDoctor, fromDate.toISOString()],
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
      setError(axiosErr.response?.data?.message ?? 'Failed to create appointment');
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

  const selectedServiceData = servicesList?.find((s) => s.id === selectedService);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6 relative max-h-[90vh] overflow-y-auto">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-600"
        >
          <X className="w-5 h-5" />
        </button>

        <h2 className="text-xl font-semibold mb-4">Book Appointment</h2>

        {step === 'select' && (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">Service</label>
              <select
                className="w-full border rounded-md p-2"
                value={selectedService ?? ''}
                onChange={(e) => setSelectedService(Number(e.target.value) || null)}
              >
                <option value="">Select a service</option>
                {servicesList?.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.durationMinutes} min)
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">
                Doctor (optional)
              </label>
              <select
                className="w-full border rounded-md p-2"
                value={selectedDoctor ?? ''}
                onChange={(e) => setSelectedDoctor(Number(e.target.value) || null)}
              >
                <option value="">Any available doctor</option>
                {doctorsList?.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Patient</label>
              <select
                className="w-full border rounded-md p-2"
                value={selectedPatient ?? ''}
                onChange={(e) => setSelectedPatient(Number(e.target.value) || null)}
              >
                <option value="">Select a patient</option>
                {patientsList?.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>

            <button
              className="w-full bg-blue-600 text-white py-2 rounded-md hover:bg-blue-700 disabled:opacity-50"
              disabled={!selectedService || !selectedPatient}
              onClick={() => setStep('slots')}
            >
              Find Available Slots
            </button>
          </div>
        )}

        {step === 'slots' && (
          <div className="space-y-4">
            <h3 className="font-medium">Available Slots</h3>

            {isLoadingSlots && (
              <p className="text-gray-500 text-sm">Searching...</p>
            )}

            {!isLoadingSlots && availability?.slots.length === 0 && (
              <p className="text-gray-500 text-sm">
                No available slots found in the next 7 days.
              </p>
            )}

            <div className="space-y-2 max-h-64 overflow-y-auto">
              {availability?.slots.map((slot, idx) => (
                <button
                  key={idx}
                  className={`w-full p-3 border rounded-md text-left hover:border-blue-500 transition-colors ${
                    selectedSlot === slot
                      ? 'border-blue-500 bg-blue-50'
                      : ''
                  }`}
                  onClick={() => setSelectedSlot(slot)}
                >
                  <div className="font-medium text-sm">
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
              <button
                className="flex-1 border py-2 rounded-md hover:bg-gray-50 text-sm"
                onClick={() => {
                  setSelectedSlot(null);
                  setStep('select');
                }}
              >
                Back
              </button>
              <button
                className="flex-1 bg-blue-600 text-white py-2 rounded-md hover:bg-blue-700 disabled:opacity-50 text-sm"
                disabled={!selectedSlot}
                onClick={() => setStep('confirm')}
              >
                Continue
              </button>
            </div>
          </div>
        )}

        {step === 'confirm' && selectedSlot && (
          <div className="space-y-4">
            <h3 className="font-medium">Confirm Booking</h3>

            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-md text-red-700 text-sm">
                {error}
              </div>
            )}

            <div className="p-4 bg-gray-50 rounded-md space-y-2 text-sm">
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
            </div>

            <div className="flex gap-2">
              <button
                className="flex-1 border py-2 rounded-md hover:bg-gray-50 text-sm"
                onClick={() => setStep('slots')}
              >
                Back
              </button>
              <button
                className="flex-1 bg-green-600 text-white py-2 rounded-md hover:bg-green-700 disabled:opacity-50 text-sm"
                disabled={createMutation.isPending}
                onClick={handleConfirm}
              >
                {createMutation.isPending ? 'Booking...' : 'Confirm Booking'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
