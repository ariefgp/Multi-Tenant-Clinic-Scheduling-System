import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
  NotFoundException,
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { TenantId } from '../../common/decorators/tenant-id.decorator.js';
import { DeviceService } from './device.service.js';

@ApiTags('Devices')
@Controller('devices')
export class DeviceController {
  constructor(private readonly deviceService: DeviceService) {}

  @Get()
  @ApiOperation({ summary: 'List all active devices' })
  async findAll(@TenantId() tenantId: number) {
    return this.deviceService.findAll(tenantId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get device by ID' })
  async findOne(
    @TenantId() tenantId: number,
    @Param('id', ParseIntPipe) id: number,
  ) {
    const device = await this.deviceService.findOne(tenantId, id);
    if (!device) throw new NotFoundException('Device not found');
    return device;
  }
}
