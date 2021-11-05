import { InjectRedis } from '@liaoliaots/nestjs-redis';
import { CACHE_MANAGER, Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { Cache } from 'cache-manager';
import { Redis } from 'ioredis';
import { IHlsManifestUpdate } from 'src/helper/interface/hls.interface';
import { AppService } from 'src/service/service';

@Injectable()
export class ManifestConsumer implements OnModuleInit {
  constructor(@InjectRedis() private readonly redisSub: Redis, @Inject(CACHE_MANAGER) private cacheManager: Cache, private appService: AppService) {}

  onModuleInit() {
    this.redisSub.subscribe('manifest-upload', (err, count) => {
      if (err) {
        // Just like other commands, subscribe() can fail for some reasons,
        // ex network issues.
        console.error('Failed to subscribe: %s', err.message);
      } else {
        // `count` represents the number of channels this client are currently subscribed to.
        console.log(`Subscribed successfully! This client is currently subscribed to ${count} channels.`);
      }
    });

    this.redisSub.on('message', (channel, message) => {
      console.log(`Received ${message} from ${channel}`);
      const data = JSON.parse(message) as IHlsManifestUpdate;
      this.cacheManager.set(`LLHLS-${data.path}`, { msn: data.msn, part: data.part }, { ttl: 100 });
      this.appService.manifestEvent.emit(data.path, data);
    });
  }
}
