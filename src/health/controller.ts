import { Controller, Get } from '@nestjs/common';
import { HealthService } from './service';

@Controller('health')
export class HealthController {
  constructor(private healthService: HealthService) {}

  @Get()
  async health() {
    const ok = await this.healthService.check();
    const resp = { message: ['success'], data: ok, statusCode: 200 };
    return resp;
  }
}
