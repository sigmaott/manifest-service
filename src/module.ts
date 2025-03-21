import { RedisModule } from '@liaoliaots/nestjs-redis';
import { CacheModule } from '@nestjs/cache-manager';
import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
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
    CacheModule.register({
      isGlobal: true,
      ttl: 60, // default cache TTL in seconds
    }),
    HttpModule.register({
      timeout: 5000,
      maxRedirects: 5,
    }),
    HealthModule,
    _.get(config, 'redis') ? RedisFsModule : undefined,
    _.get(config, 'redis')
      ? RedisModule.forRoot({
          closeClient: true,
          readyLog: true,
          config: config.get('redis'),
        })
      : undefined,
  ]),
  controllers: [AppController],
  providers: _.compact([Utils, AppService, Consts, _.get(config, 'redis') ? ManifestConsumer : undefined, StorageFsService, StorageHttpService]),
})
export class AppModule {}
