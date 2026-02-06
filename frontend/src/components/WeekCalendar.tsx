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
import { cn } from '../lib/utils.ts';
import { Badge } from './ui/badge.tsx';
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

const statusVariantMap: Record<string, 'default' | 'success' | 'warning' | 'destructive'> = {
  scheduled: 'default',
  confirmed: 'success',
  cancelled: 'destructive',
  completed: 'success',
  'no-show': 'warning',
};

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
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="sticky top-0 z-10 grid grid-cols-[64px_repeat(7,1fr)] border-b bg-white">
        <div className="p-2" />
        {weekDays.map((day) => (
          <div
            key={day.toISOString()}
            className={cn(
              'border-l p-2 text-center',
              isToday(day) && 'bg-blue-50',
            )}
          >
            <div className="text-xs uppercase text-gray-500">
              {format(day, 'EEE')}
            </div>
            <div
              className={cn(
                'text-lg font-semibold',
                isToday(day) && 'text-blue-600',
              )}
            >
              {format(day, 'd')}
            </div>
          </div>
        ))}
      </div>

      {/* Time grid */}
      <div className="flex-1 overflow-auto">
        <div className="relative grid grid-cols-[64px_repeat(7,1fr)]">
          {hours.map((hour) => (
            <div key={`row-${hour}`} className="contents">
              <div
                className="border-r pr-2 pt-0 text-right text-xs text-gray-400"
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
                    className="relative cursor-pointer border-b border-l hover:bg-blue-50/50"
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
                          className="absolute inset-x-1 z-10 cursor-pointer overflow-hidden rounded px-1.5 py-0.5 text-xs text-white transition-opacity hover:opacity-90"
                          style={getAppointmentStyle(apt)}
                          onClick={(e) => {
                            e.stopPropagation();
                            onAppointmentClick(apt);
                          }}
                        >
                          <div className="flex items-center justify-between gap-1">
                            <span className="truncate font-medium">
                              {apt.patientName}
                            </span>
                            <Badge
                              variant={statusVariantMap[apt.status] ?? 'default'}
                              className="h-4 shrink-0 px-1 text-[10px]"
                            >
                              {apt.status}
                            </Badge>
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
