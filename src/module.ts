import { CacheModule, Module } from '@nestjs/common';
import { Utils } from './helper/utils';
import { Consts } from './helper/consts';
import { RedisFsModule } from './redis-fs';
import { HealthModule } from './health';
import { AppService } from './service/service';
import { AppController } from './controller/controller';
import { ManifestConsumer } from './consumer/manifest.consumer';
import { RedisModule } from '@liaoliaots/nestjs-redis';
import * as config from 'config';

@Module({
  imports: [
    CacheModule.register(),
    RedisFsModule,
    HealthModule,
    RedisModule.forRoot({
      closeClient: true,
      readyLog: true,
      config: config.redis,
    }),
  ],
  controllers: [AppController],
  providers: [Utils, AppService, Consts, ManifestConsumer],
})
export class AppModule {}
