import { useRef, useEffect } from 'react';
import FullCalendar from '@fullcalendar/react';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import type { EventClickArg } from '@fullcalendar/core';
import type { DateClickArg } from '@fullcalendar/interaction';
import type { Appointment } from '../types/index.ts';

interface WeekCalendarProps {
  currentDate: Date;
  appointments: Appointment[];
  onSlotClick: (date: Date) => void;
  onAppointmentClick: (appointment: Appointment) => void;
}

const statusColorMap: Record<string, string> = {
  scheduled: '#6B7280',
  confirmed: '#10B981',
  cancelled: '#EF4444',
  completed: '#22C55E',
  'no-show': '#F59E0B',
};

export function WeekCalendar({
  currentDate,
  appointments,
  onSlotClick,
  onAppointmentClick,
}: WeekCalendarProps) {
  const calendarRef = useRef<FullCalendar>(null);

  useEffect(() => {
    if (calendarRef.current) {
      calendarRef.current.getApi().gotoDate(currentDate);
    }
  }, [currentDate]);

  const events = appointments.map((apt) => ({
    id: String(apt.id),
    title: `${apt.patientName} - ${apt.serviceName}`,
    start: apt.startsAt,
    end: apt.endsAt,
    backgroundColor: apt.serviceColor ?? '#3B82F6',
    borderColor: statusColorMap[apt.status] ?? '#6B7280',
    extendedProps: { appointment: apt },
  }));

  const handleEventClick = (info: EventClickArg) => {
    const apt = info.event.extendedProps.appointment as Appointment;
    onAppointmentClick(apt);
  };

  const handleDateClick = (info: DateClickArg) => {
    onSlotClick(info.date);
  };

  return (
    <div className="h-full [&_.fc]:h-full [&_.fc-timegrid-slot]:h-20 [&_.fc-col-header-cell]:py-3 [&_.fc-timegrid-axis]:w-20 [&_.fc-scrollgrid]:border-0 [&_.fc-theme-standard_td]:border-gray-200 [&_.fc-theme-standard_th]:border-gray-200 [&_.fc-day-today]:bg-blue-50/50 [&_.fc-timegrid-event]:rounded [&_.fc-timegrid-event]:px-2 [&_.fc-event-title]:text-sm [&_.fc-event-title]:font-medium [&_.fc-toolbar]:hidden [&_.fc-timegrid-slot-label]:text-sm">
      <FullCalendar
        ref={calendarRef}
        plugins={[timeGridPlugin, interactionPlugin]}
        initialView="timeGridWeek"
        initialDate={currentDate}
        headerToolbar={false}
        slotMinTime="07:00:00"
        slotMaxTime="19:00:00"
        slotDuration="01:00:00"
        allDaySlot={false}
        weekends={true}
        firstDay={1}
        events={events}
        eventClick={handleEventClick}
        dateClick={handleDateClick}
        height="100%"
        nowIndicator={true}
        dayHeaderFormat={{ weekday: 'short', day: 'numeric' }}
        slotLabelFormat={{ hour: 'numeric', meridiem: 'short' }}
      />
    </div>
  );
}
