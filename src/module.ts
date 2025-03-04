import { RedisModule } from '@liaoliaots/nestjs-redis';
import { CacheModule, HttpModule, Module } from '@nestjs/common';
import * as config from 'config';
import * as _ from 'lodash';
import { ManifestConsumer } from './consumer/manifest.consumer';
import { AppController } from './controller/controller';
import { HealthModule } from './health';
import { Consts } from './helper/consts';
import { Utils } from './helper/utils';
import { RedisFsModule } from './redis-fs';
import { StorageHttpService } from './service/http.fs.service';
import { AppService } from './service/service';
import { StorageFsService } from './service/storage.fs.service';

@Module({
  imports: _.compact([
    CacheModule.register(),
    HttpModule,
    HealthModule,
    _.get(config, 'redis') ? RedisFsModule : undefined,
    _.get(config, 'redis')
      ? RedisModule.forRoot({
          closeClient: true,
          readyLog: true,
          config: config.redis,
        })
      : undefined,
  ]),
  controllers: [AppController],
  providers: _.compact([Utils, AppService, Consts, _.get(config, 'redis') ? ManifestConsumer : undefined, StorageFsService, StorageHttpService]),
})
export class AppModule {}
