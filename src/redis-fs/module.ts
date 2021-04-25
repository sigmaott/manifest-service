import { Module, CacheModule } from '@nestjs/common';
import { RedisFsService } from './service';
import * as redisStore from 'cache-manager-ioredis';
import * as config from 'config';

@Module({
  imports: [
    CacheModule.register({
      store: redisStore,
      ...config.redis,
    }),
  ],
  providers: [RedisFsService],
  exports: [RedisFsService],
})
export class RedisFsModule {}
