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
    <div className="week-calendar-wrapper h-full overflow-auto">
      <style>{`
        .week-calendar-wrapper .fc {
          height: auto !important;
        }
        .week-calendar-wrapper .fc-timegrid-slot {
          height: 4rem !important;
          min-height: 4rem !important;
        }
        .week-calendar-wrapper .fc-timegrid-slot-lane {
          height: 4rem !important;
        }
        .week-calendar-wrapper .fc-col-header-cell {
          padding: 0.75rem 0;
        }
        .week-calendar-wrapper .fc-scrollgrid {
          border: 0;
        }
        .week-calendar-wrapper .fc-theme-standard td,
        .week-calendar-wrapper .fc-theme-standard th {
          border-color: #e5e7eb;
        }
        .week-calendar-wrapper .fc-day-today {
          background-color: rgba(239, 246, 255, 0.5) !important;
        }
        .week-calendar-wrapper .fc-timegrid-event {
          border-radius: 0.25rem;
          padding: 0.25rem 0.5rem;
        }
        .week-calendar-wrapper .fc-event-title {
          font-size: 0.875rem;
          font-weight: 500;
        }
        .week-calendar-wrapper .fc-toolbar {
          display: none;
        }
        .week-calendar-wrapper .fc-timegrid-axis {
          width: 5rem;
        }
      `}</style>
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
        height="auto"
        expandRows={false}
        nowIndicator={true}
        dayHeaderFormat={{ weekday: 'short', day: 'numeric' }}
        slotLabelFormat={{ hour: 'numeric', meridiem: 'short' }}
      />
    </div>
  );
}
