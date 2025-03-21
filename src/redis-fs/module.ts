import { Module } from '@nestjs/common';
import * as config from 'config';
import { createClient } from '@redis/client';
import { RedisFsService } from './service';

const REDIS_PROVIDER = {
  provide: 'REDIS_CLIENT',
  useFactory: async () => {
    const client = createClient({
      url: `redis://${config.get('redis.host')}:${config.get('redis.port')}`,
    });
    await client.connect();
    return client;
  },
};

@Module({
  providers: [REDIS_PROVIDER, RedisFsService],
  exports: [RedisFsService, REDIS_PROVIDER],
})
export class RedisFsModule {}
