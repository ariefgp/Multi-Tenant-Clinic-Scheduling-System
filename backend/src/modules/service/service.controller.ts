import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
  NotFoundException,
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { TenantId } from '../../common/decorators/tenant-id.decorator.js';
import { ServiceService } from './service.service.js';

@ApiTags('Services')
@Controller('services')
export class ServiceController {
  constructor(private readonly serviceService: ServiceService) {}

  @Get()
  @ApiOperation({ summary: 'List all active services with doctor/device requirements' })
  async findAll(@TenantId() tenantId: number) {
    return this.serviceService.findAll(tenantId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get service by ID with requirements' })
  async findOne(
    @TenantId() tenantId: number,
    @Param('id', ParseIntPipe) id: number,
  ) {
    const service = await this.serviceService.findOne(tenantId, id);
    if (!service) throw new NotFoundException('Service not found');
    return service;
  }
}
