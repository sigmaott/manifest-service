import { CacheModule, Module } from '@nestjs/common';
import { AppController } from './controller';
import { AppService } from './service';
import { Utils } from './utils';
import { Consts } from './consts';
import { RedisFsModule } from './redis-fs';
import { HealthModule } from './health';

@Module({
  imports: [CacheModule.register(), RedisFsModule, HealthModule],
  controllers: [AppController],
  providers: [Utils, AppService, Consts],
})
export class AppModule {}
