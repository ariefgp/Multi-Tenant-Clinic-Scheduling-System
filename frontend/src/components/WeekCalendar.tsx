import { useMemo } from 'react';
import {
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  format,
  isSameDay,
  isToday,
  differenceInMinutes,
  setHours,
  setMinutes,
} from 'date-fns';
import type { Appointment } from '../types/index.ts';

const HOUR_START = 7;
const HOUR_END = 19;
const HOUR_HEIGHT = 64;

interface WeekCalendarProps {
  currentDate: Date;
  appointments: Appointment[];
  onSlotClick: (date: Date) => void;
  onAppointmentClick: (appointment: Appointment) => void;
}

export function WeekCalendar({
  currentDate,
  appointments,
  onSlotClick,
  onAppointmentClick,
}: WeekCalendarProps) {
  const weekDays = useMemo(() => {
    const start = startOfWeek(currentDate, { weekStartsOn: 1 });
    const end = endOfWeek(currentDate, { weekStartsOn: 1 });
    return eachDayOfInterval({ start, end });
  }, [currentDate]);

  const hours = useMemo(
    () => Array.from({ length: HOUR_END - HOUR_START }, (_, i) => i + HOUR_START),
    [],
  );

  const getAppointmentsForDay = (day: Date) =>
    appointments.filter((apt) => isSameDay(new Date(apt.startsAt), day));

  const getAppointmentStyle = (apt: Appointment) => {
    const start = new Date(apt.startsAt);
    const end = new Date(apt.endsAt);
    const dayStart = setMinutes(setHours(start, HOUR_START), 0);
    const topMinutes = differenceInMinutes(start, dayStart);
    const durationMinutes = differenceInMinutes(end, start);

    return {
      top: `${(topMinutes / 60) * HOUR_HEIGHT}px`,
      height: `${Math.max((durationMinutes / 60) * HOUR_HEIGHT - 2, 20)}px`,
      backgroundColor: apt.serviceColor ?? '#3B82F6',
    };
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="grid grid-cols-[64px_repeat(7,1fr)] border-b bg-white sticky top-0 z-10">
        <div className="p-2" />
        {weekDays.map((day) => (
          <div
            key={day.toISOString()}
            className={`p-2 text-center border-l ${isToday(day) ? 'bg-blue-50' : ''}`}
          >
            <div className="text-xs text-gray-500 uppercase">
              {format(day, 'EEE')}
            </div>
            <div
              className={`text-lg font-semibold ${isToday(day) ? 'text-blue-600' : ''}`}
            >
              {format(day, 'd')}
            </div>
          </div>
        ))}
      </div>

      {/* Time grid */}
      <div className="flex-1 overflow-auto">
        <div className="grid grid-cols-[64px_repeat(7,1fr)] relative">
          {hours.map((hour) => (
            <div key={`row-${hour}`} className="contents">
              <div
                className="text-xs text-gray-400 text-right pr-2 pt-0 border-r"
                style={{ height: `${HOUR_HEIGHT}px` }}
              >
                {format(setHours(new Date(), hour), 'h a')}
              </div>
              {weekDays.map((day) => {
                const dayAppts =
                  hour === HOUR_START ? getAppointmentsForDay(day) : [];

                return (
                  <div
                    key={`${day.toISOString()}-${hour}`}
                    className="relative border-b border-l hover:bg-blue-50/50 cursor-pointer"
                    style={{ height: `${HOUR_HEIGHT}px` }}
                    onClick={() => {
                      const clickDate = setMinutes(setHours(new Date(day), hour), 0);
                      onSlotClick(clickDate);
                    }}
                  >
                    {hour === HOUR_START &&
                      dayAppts.map((apt) => (
                        <div
                          key={apt.id}
                          className="absolute inset-x-1 z-10 rounded px-1.5 py-0.5 text-white text-xs cursor-pointer overflow-hidden hover:opacity-90 transition-opacity"
                          style={getAppointmentStyle(apt)}
                          onClick={(e) => {
                            e.stopPropagation();
                            onAppointmentClick(apt);
                          }}
                        >
                          <div className="font-medium truncate">
                            {apt.patientName}
                          </div>
                          <div className="truncate opacity-80">
                            {apt.serviceName}
                          </div>
                        </div>
                      ))}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
