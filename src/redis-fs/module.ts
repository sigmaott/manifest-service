import { Module } from '@nestjs/common';
import { RedisService } from './redis.provider';
import { RedisFsService } from './service';

// const REDIS_PROVIDER = {
//   provide: 'REDIS_CLIENT',
//   useFactory: async () => {
//     const client = createClient({
//       url: `redis://${config.get('redis.host')}:${config.get('redis.port')}`,
//     });
//     await client.connect();
//     return client;
//   },
// };

@Module({
  providers: [RedisFsService, RedisService],
  exports: [RedisFsService, RedisService],
})
export class RedisFsModule {}
