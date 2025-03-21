import { Module } from '@nestjs/common';
import { CacheModule } from '@nestjs/cache-manager';
import * as redisStore from 'cache-manager-ioredis';
import * as config from 'config';
import { RedisFsService } from './service';

@Module({
  imports: [
    CacheModule.register({
      store: redisStore,
      ...(config.get('redis') as Record<string, unknown>),
    }),
  ],
  providers: [RedisFsService],
  exports: [RedisFsService],
})
export class RedisFsModule {}
