import { Module } from '@nestjs/common';
import {
  AppointmentController,
  DoctorScheduleController,
  ScheduleController,
} from './appointment.controller.js';
import { AppointmentService } from './appointment.service.js';
import { ConflictCheckerService } from './services/conflict-checker.service.js';

@Module({
  controllers: [
    AppointmentController,
    DoctorScheduleController,
    ScheduleController,
  ],
  providers: [AppointmentService, ConflictCheckerService],
  exports: [AppointmentService],
})
export class AppointmentModule {}
