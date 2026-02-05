import { useState } from 'react';
import { startOfWeek, endOfWeek, addWeeks, subWeeks, format } from 'date-fns';
import { WeekCalendar } from './components/WeekCalendar.tsx';
import { BookingModal } from './components/BookingModal.tsx';
import { AppointmentDetail } from './components/AppointmentDetail.tsx';
import { useAppointments } from './hooks/useAppointments.ts';
import type { Appointment } from './types/index.ts';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';

export function App() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [bookingOpen, setBookingOpen] = useState(false);
  const [bookingDate, setBookingDate] = useState<Date | undefined>();
  const [selectedAppointment, setSelectedAppointment] = useState<Appointment | null>(null);

  const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(currentDate, { weekStartsOn: 1 });

  const { data: appointments = [], isLoading } = useAppointments(weekStart, weekEnd);

  const handleSlotClick = (date: Date) => {
    setBookingDate(date);
    setBookingOpen(true);
  };

  const handleAppointmentClick = (appointment: Appointment) => {
    setSelectedAppointment(appointment);
  };

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      <header className="bg-white border-b px-6 py-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-900">
          Clinic Scheduler
        </h1>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setCurrentDate(subWeeks(currentDate, 1))}
              className="p-2 hover:bg-gray-100 rounded-md"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <span className="text-sm font-medium min-w-[200px] text-center">
              {format(weekStart, 'MMM d')} - {format(weekEnd, 'MMM d, yyyy')}
            </span>
            <button
              onClick={() => setCurrentDate(addWeeks(currentDate, 1))}
              className="p-2 hover:bg-gray-100 rounded-md"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
          <button
            onClick={() => setCurrentDate(new Date())}
            className="px-3 py-1.5 text-sm border rounded-md hover:bg-gray-50"
          >
            Today
          </button>
          <button
            onClick={() => {
              setBookingDate(undefined);
              setBookingOpen(true);
            }}
            className="flex items-center gap-1 px-4 py-2 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700"
          >
            <Plus className="w-4 h-4" />
            Book
          </button>
        </div>
      </header>

      <main className="flex-1 overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center h-full text-gray-500">
            Loading schedule...
          </div>
        ) : (
          <WeekCalendar
            currentDate={currentDate}
            appointments={appointments}
            onSlotClick={handleSlotClick}
            onAppointmentClick={handleAppointmentClick}
          />
        )}
      </main>

      {bookingOpen && (
        <BookingModal
          initialDate={bookingDate}
          onClose={() => setBookingOpen(false)}
        />
      )}

      {selectedAppointment && (
        <AppointmentDetail
          appointment={selectedAppointment}
          onClose={() => setSelectedAppointment(null)}
        />
      )}
    </div>
  );
}
