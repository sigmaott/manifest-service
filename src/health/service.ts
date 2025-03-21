import { Inject, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { RedisFsService } from '../redis-fs';

@Injectable()
export class HealthService {
  constructor(private redisFs: RedisFsService, @Inject(CACHE_MANAGER) private cacheManager: Cache) {}

  async check() {
    try {
      await this.cacheManager.get('health-check');
    } catch (error) {
      throw new ServiceUnavailableException(['Redis is not connected']);
    }
    return 'ok';
  }
}
