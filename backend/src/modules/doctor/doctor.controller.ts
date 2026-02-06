import {
  Controller,
  Get,
  Param,
  Query,
  ParseIntPipe,
  NotFoundException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { TenantId } from '../../common/decorators/tenant-id.decorator.js';
import { DoctorService } from './doctor.service.js';

@ApiTags('Doctors')
@Controller('doctors')
export class DoctorController {
  constructor(private readonly doctorService: DoctorService) {}

  @Get()
  @ApiOperation({ summary: 'List active doctors, optionally filtered by service' })
  @ApiQuery({ name: 'service_id', required: false, type: Number })
  async findAll(
    @TenantId() tenantId: number,
    @Query('service_id') serviceIdParam?: string,
  ) {
    const serviceId = serviceIdParam ? Number(serviceIdParam) : undefined;
    return this.doctorService.findAll(tenantId, serviceId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get doctor by ID' })
  async findOne(
    @TenantId() tenantId: number,
    @Param('id', ParseIntPipe) id: number,
  ) {
    const doctor = await this.doctorService.findOne(tenantId, id);
    if (!doctor) throw new NotFoundException('Doctor not found');
    return doctor;
  }
}
