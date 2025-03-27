import { HttpModule } from '@nestjs/axios';
import { CacheModule } from '@nestjs/cache-manager';
import { Module } from '@nestjs/common';
import * as config from 'config';
import * as _ from 'lodash';
import { ManifestConsumer } from './consumer/manifest.consumer';
import { AppController } from './controller/controller';
import { HealthModule } from './health';
import { Utils } from './helper/utils';
import { RedisFsModule } from './redis-fs';
import { StorageHttpService } from './service/http.fs.service';
import { AppService } from './service/service';
import { StorageFsService } from './service/storage.fs.service';

@Module({
  imports: _.compact([
    CacheModule.register({
      isGlobal: true,
      ttl: 60 * 1000, // 60 seconds
    }),
    HttpModule.register({
      timeout: 5000,
      maxRedirects: 5,
    }),
    HealthModule,
    _.get(config, 'redis') ? RedisFsModule : undefined,
  ]),
  controllers: [AppController],
  providers: _.compact([Utils, AppService, _.get(config, 'redis') ? ManifestConsumer : undefined, StorageFsService, StorageHttpService]),
})
export class AppModule {}
