import { Module } from '@nestjs/common';
import { ServiceController } from './service.controller.js';
import { ServiceService } from './service.service.js';

@Module({
  controllers: [ServiceController],
  providers: [ServiceService],
  exports: [ServiceService],
})
export class ServiceModule {}
