import { Process, Processor } from '@nestjs/bull';
import { Logger, OnModuleInit } from '@nestjs/common';
import { Job } from 'bull';
import { RedisService } from 'src/redis-fs';
import { IHlsManifestUpdate } from '../helper/interface/hls.interface';

@Processor('manifest')
export class ManifestConsumer implements OnModuleInit {
  private readonly logger = new Logger(ManifestConsumer.name);
  private redisClient;

  constructor(private readonly redisService: RedisService) {
    this.redisClient = redisService.getClient();
  }

  onModuleInit() {
    // this.redisClient.subscribe('manifest', (err) => {
    //   if (err) {
    //     this.logger.error('Failed to subscribe:', err);
    //     return;
    //   }
    //   this.logger.log('Subscribed to manifest channel');
    // });
    // this.redisClient.on('message', (channel, message) => {
    //   this.logger.debug(`Received message from ${channel}`);
    //   const data = JSON.parse(message) as IHlsManifestUpdate;
    //   this.redisClient.set(`LLHLS-${data.path}`, JSON.stringify({ msn: data.msn, part: data.part }));
    // });
  }

  @Process('llhls')
  async handleLLHLS(job: Job<IHlsManifestUpdate>) {
    try {
      const data = job.data;
      this.logger.debug(`Processing LLHLS job: ${JSON.stringify(data)}`);
      await this.redisClient.set(`LLHLS-${data.path}`, JSON.stringify({ msn: data.msn, part: data.part }));
    } catch (error) {
      this.logger.error('Error processing LLHLS job:', error);
    }
  }
}
