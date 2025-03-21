import { InjectRedis } from '@liaoliaots/nestjs-redis';
import { Process, Processor } from '@nestjs/bull';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { Job } from 'bull';
import { Cache } from 'cache-manager';
import { Redis } from 'ioredis';
import { IHlsManifestUpdate } from '../interface/manifest.interface';
import { AppService } from '../service/service';

@Injectable()
@Processor('manifest')
export class ManifestConsumer {
  private readonly logger = new Logger(ManifestConsumer.name);

  constructor(@Inject(CACHE_MANAGER) private cacheManager: Cache, @InjectRedis() private readonly redisSub: Redis, private readonly appService: AppService) {
    this.redisSub.subscribe('manifest', (err) => {
      if (err) {
        this.logger.error('Failed to subscribe:', err);
        return;
      }
      this.logger.log('Subscribed to manifest channel');
    });

    this.redisSub.on('message', (channel, message) => {
      this.logger.debug(`Received message from ${channel}`);
      const data = JSON.parse(message) as IHlsManifestUpdate;
      this.cacheManager.set(`LLHLS-${data.path}`, { msn: data.msn, part: data.part }, 100);
      this.appService.manifestEvent.emit(data.path, data);
    });
  }

  @Process('llhls')
  async handleLLHLS(job: Job<IHlsManifestUpdate>) {
    try {
      const data = job.data;
      this.logger.debug(`Processing LLHLS job: ${JSON.stringify(data)}`);
      await this.cacheManager.set(`LLHLS-${data.path}`, { msn: data.msn, part: data.part }, 100);
    } catch (error) {
      this.logger.error('Error processing LLHLS job:', error);
    }
  }
}
