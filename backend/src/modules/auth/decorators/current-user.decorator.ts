import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export interface UserPayload {
  userId: number;
  tenantId: number;
  email: string;
  role: string;
}

export const CurrentUser = createParamDecorator(
  (data: keyof UserPayload | undefined, ctx: ExecutionContext): UserPayload | UserPayload[keyof UserPayload] => {
    const request = ctx.switchToHttp().getRequest();
    const user = request.user as UserPayload;
    return data ? user?.[data] : user;
  },
);
