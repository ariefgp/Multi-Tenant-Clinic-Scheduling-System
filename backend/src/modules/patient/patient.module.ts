import { Module } from '@nestjs/common';
import { PatientController } from './patient.controller.js';
import { PatientService } from './patient.service.js';

@Module({
  controllers: [PatientController],
  providers: [PatientService],
  exports: [PatientService],
})
export class PatientModule {}
