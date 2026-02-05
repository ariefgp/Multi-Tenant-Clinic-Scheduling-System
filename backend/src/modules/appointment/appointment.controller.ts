import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  ParseIntPipe,
  BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { TenantId } from '../../common/decorators/tenant-id.decorator.js';
import { AppointmentService } from './appointment.service.js';
import { CreateAppointmentSchema } from './dto/create-appointment.dto.js';
import { RescheduleAppointmentSchema } from './dto/reschedule-appointment.dto.js';

@ApiTags('Appointments')
@Controller('appointments')
export class AppointmentController {
  constructor(private readonly appointmentService: AppointmentService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new appointment' })
  async create(@TenantId() tenantId: number, @Body() body: unknown) {
    const parsed = CreateAppointmentSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }
    return this.appointmentService.create(tenantId, parsed.data);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get appointment by ID' })
  async findOne(
    @TenantId() tenantId: number,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.appointmentService.findOne(tenantId, id);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Cancel an appointment' })
  async cancel(
    @TenantId() tenantId: number,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.appointmentService.cancel(tenantId, id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Reschedule an appointment' })
  async reschedule(
    @TenantId() tenantId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: unknown,
  ) {
    const parsed = RescheduleAppointmentSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }
    return this.appointmentService.reschedule(tenantId, id, parsed.data);
  }
}

@ApiTags('Doctors')
@Controller('doctors')
export class DoctorScheduleController {
  constructor(private readonly appointmentService: AppointmentService) {}

  @Get(':id/schedule')
  @ApiOperation({ summary: "Get a doctor's schedule for a date range" })
  @ApiQuery({ name: 'from', type: String, required: true })
  @ApiQuery({ name: 'to', type: String, required: true })
  async getDoctorSchedule(
    @TenantId() tenantId: number,
    @Param('id', ParseIntPipe) doctorId: number,
    @Query('from') from: string,
    @Query('to') to: string,
  ) {
    return this.appointmentService.getDoctorSchedule(
      tenantId,
      doctorId,
      new Date(from),
      new Date(to),
    );
  }
}

@ApiTags('Appointments')
@Controller('schedule')
export class ScheduleController {
  constructor(private readonly appointmentService: AppointmentService) {}

  @Get()
  @ApiOperation({ summary: 'Get all appointments for a date range' })
  @ApiQuery({ name: 'from', type: String, required: true })
  @ApiQuery({ name: 'to', type: String, required: true })
  async getAllSchedule(
    @TenantId() tenantId: number,
    @Query('from') from: string,
    @Query('to') to: string,
  ) {
    return this.appointmentService.getAllSchedule(
      tenantId,
      new Date(from),
      new Date(to),
    );
  }
}
