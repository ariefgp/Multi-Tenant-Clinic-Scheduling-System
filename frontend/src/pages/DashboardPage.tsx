import { useState } from 'react';
import { startOfWeek, endOfWeek, addWeeks, subWeeks, format } from 'date-fns';
import { WeekCalendar } from '../components/WeekCalendar.tsx';
import { BookingModal } from '../components/BookingModal.tsx';
import { AppointmentDetail } from '../components/AppointmentDetail.tsx';
import { useAppointments } from '../hooks/useAppointments.ts';
import { DashboardLayout } from '../components/layout/DashboardLayout.tsx';
import { Button } from '../components/ui/button.tsx';
import type { Appointment } from '../types/index.ts';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';

export function DashboardPage() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [bookingOpen, setBookingOpen] = useState(false);
  const [bookingDate, setBookingDate] = useState<Date | undefined>();
  const [selectedAppointment, setSelectedAppointment] =
    useState<Appointment | null>(null);

  const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(currentDate, { weekStartsOn: 1 });

  const { data: appointments = [], isLoading } = useAppointments(
    weekStart,
    weekEnd,
  );

  const handleSlotClick = (date: Date) => {
    setBookingDate(date);
    setBookingOpen(true);
  };

  const handleAppointmentClick = (appointment: Appointment) => {
    setSelectedAppointment(appointment);
  };

  return (
    <DashboardLayout>
      <div className="flex h-full flex-col">
        <header className="flex items-center justify-between border-b bg-white px-6 py-4">
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setCurrentDate(subWeeks(currentDate, 1))}
            >
              <ChevronLeft className="h-5 w-5" />
            </Button>
            <span className="min-w-[200px] text-center text-sm font-medium">
              {format(weekStart, 'MMM d')} - {format(weekEnd, 'MMM d, yyyy')}
            </span>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setCurrentDate(addWeeks(currentDate, 1))}
            >
              <ChevronRight className="h-5 w-5" />
            </Button>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => setCurrentDate(new Date())}>
              Today
            </Button>
            <Button
              onClick={() => {
                setBookingDate(undefined);
                setBookingOpen(true);
              }}
            >
              <Plus className="mr-1 h-4 w-4" />
              Book
            </Button>
          </div>
        </header>

        <main className="flex-1 overflow-hidden">
          {isLoading ? (
            <div className="flex h-full items-center justify-center text-gray-500">
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
    </DashboardLayout>
  );
}
