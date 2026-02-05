import { Module, MiddlewareConsumer, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from './database/database.module.js';
import { TenantMiddleware } from './common/middleware/tenant.middleware.js';
import { TenantModule } from './modules/tenant/tenant.module.js';
import { DoctorModule } from './modules/doctor/doctor.module.js';
import { PatientModule } from './modules/patient/patient.module.js';
import { ServiceModule } from './modules/service/service.module.js';
import { RoomModule } from './modules/room/room.module.js';
import { DeviceModule } from './modules/device/device.module.js';
import { AppointmentModule } from './modules/appointment/appointment.module.js';
import { AvailabilityModule } from './modules/availability/availability.module.js';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '../.env.local', '.env', '../.env'],
    }),
    DatabaseModule,
    TenantModule,
    DoctorModule,
    PatientModule,
    ServiceModule,
    RoomModule,
    DeviceModule,
    AppointmentModule,
    AvailabilityModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(TenantMiddleware)
      .exclude('health', 'docs', 'docs/(.*)')
      .forRoutes('*');
  }
}
