import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
  NotFoundException,
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { TenantId } from '../../common/decorators/tenant-id.decorator.js';
import { DoctorService } from './doctor.service.js';

@ApiTags('Doctors')
@Controller('doctors')
export class DoctorController {
  constructor(private readonly doctorService: DoctorService) {}

  @Get()
  @ApiOperation({ summary: 'List all active doctors' })
  async findAll(@TenantId() tenantId: number) {
    return this.doctorService.findAll(tenantId);
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
