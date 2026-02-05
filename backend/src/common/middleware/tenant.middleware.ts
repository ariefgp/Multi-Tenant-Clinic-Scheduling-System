import { Injectable, NestMiddleware, UnauthorizedException } from '@nestjs/common';
import { FastifyRequest, FastifyReply } from 'fastify';

@Injectable()
export class TenantMiddleware implements NestMiddleware {
  use(
    req: FastifyRequest['raw'],
    res: FastifyReply['raw'],
    next: () => void,
  ) {
    const tenantId = (req as unknown as FastifyRequest).headers['x-tenant-id'];

    if (!tenantId) {
      throw new UnauthorizedException('X-Tenant-Id header is required');
    }

    const parsed = parseInt(tenantId as string, 10);
    if (isNaN(parsed) || parsed <= 0) {
      throw new UnauthorizedException('X-Tenant-Id must be a positive integer');
    }

    (req as unknown as Record<string, unknown>)['tenantId'] = parsed;
    next();
  }
}
