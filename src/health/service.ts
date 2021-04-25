import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { RedisFsService } from '../redis-fs';

@Injectable()
export class HealthService {
  constructor(private redisFs: RedisFsService) {}

  async check() {
    const redisOk = await this.redisFs.isConnected();
    if (!redisOk) throw new ServiceUnavailableException(['redis is not connected']);

    return 'ok';
  }
}
