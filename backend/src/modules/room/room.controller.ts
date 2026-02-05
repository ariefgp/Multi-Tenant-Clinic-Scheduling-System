import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
  NotFoundException,
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { TenantId } from '../../common/decorators/tenant-id.decorator.js';
import { RoomService } from './room.service.js';

@ApiTags('Rooms')
@Controller('rooms')
export class RoomController {
  constructor(private readonly roomService: RoomService) {}

  @Get()
  @ApiOperation({ summary: 'List all active rooms' })
  async findAll(@TenantId() tenantId: number) {
    return this.roomService.findAll(tenantId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get room by ID' })
  async findOne(
    @TenantId() tenantId: number,
    @Param('id', ParseIntPipe) id: number,
  ) {
    const room = await this.roomService.findOne(tenantId, id);
    if (!room) throw new NotFoundException('Room not found');
    return room;
  }
}
