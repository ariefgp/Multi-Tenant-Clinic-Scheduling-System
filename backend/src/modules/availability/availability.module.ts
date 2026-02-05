import { Module } from '@nestjs/common';
import { AvailabilityController } from './availability.controller.js';
import { AvailabilityService } from './availability.service.js';

@Module({
  controllers: [AvailabilityController],
  providers: [AvailabilityService],
})
export class AvailabilityModule {}
