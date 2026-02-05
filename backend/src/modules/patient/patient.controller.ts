import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
  NotFoundException,
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { TenantId } from '../../common/decorators/tenant-id.decorator.js';
import { PatientService } from './patient.service.js';

@ApiTags('Patients')
@Controller('patients')
export class PatientController {
  constructor(private readonly patientService: PatientService) {}

  @Get()
  @ApiOperation({ summary: 'List all patients' })
  async findAll(@TenantId() tenantId: number) {
    return this.patientService.findAll(tenantId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get patient by ID' })
  async findOne(
    @TenantId() tenantId: number,
    @Param('id', ParseIntPipe) id: number,
  ) {
    const patient = await this.patientService.findOne(tenantId, id);
    if (!patient) throw new NotFoundException('Patient not found');
    return patient;
  }
}
