import {
  Controller,
  Get,
  Query,
  ParseIntPipe,
  BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { TenantId } from '../../common/decorators/tenant-id.decorator.js';
import { AvailabilityService } from './availability.service.js';

@ApiTags('Availability')
@Controller('availability')
export class AvailabilityController {
  constructor(
    private readonly availabilityService: AvailabilityService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Find available appointment slots' })
  @ApiQuery({ name: 'service_id', type: Number, required: true })
  @ApiQuery({ name: 'from', type: String, required: true, description: 'ISO8601 datetime' })
  @ApiQuery({ name: 'to', type: String, required: true, description: 'ISO8601 datetime' })
  @ApiQuery({ name: 'doctor_ids', type: String, required: false, description: 'Comma-separated doctor IDs' })
  @ApiQuery({ name: 'limit', type: Number, required: false, description: 'Max slots to return (default 3)' })
  async findSlots(
    @TenantId() tenantId: number,
    @Query('service_id', ParseIntPipe) serviceId: number,
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('doctor_ids') doctorIdsParam?: string,
    @Query('limit') limitParam?: string,
  ) {
    if (!from || !to) {
      throw new BadRequestException('from and to query params are required');
    }

    const doctorIds = doctorIdsParam
      ? doctorIdsParam.split(',').map((id) => parseInt(id.trim(), 10))
      : undefined;

    const limit = limitParam ? parseInt(limitParam, 10) : 3;

    const slots = await this.availabilityService.findSlots({
      tenantId,
      serviceId,
      doctorIds,
      from: new Date(from),
      to: new Date(to),
      limit,
    });

    return {
      slots: slots.map((slot) => ({
        doctor_id: slot.doctorId,
        doctor_name: slot.doctorName,
        room_id: slot.roomId,
        room_name: slot.roomName,
        device_ids: slot.deviceIds,
        start: slot.start.toISOString(),
        end: slot.end.toISOString(),
      })),
      limit,
    };
  }
}
