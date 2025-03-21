import { Inject, Injectable, Logger } from '@nestjs/common';
import { IFsService } from '../interface/fs.interface';
import { RedisClientType } from '@redis/client';
import * as path from 'path';

@Injectable()
export class RedisFsService implements IFsService {
  private readonly logger = new Logger(RedisFsService.name);

  constructor(
    @Inject('REDIS_CLIENT')
    private readonly redisClient: RedisClientType,
  ) {}

  async read(filePath: string): Promise<string> {
    this.logger.debug(`Reading file: ${filePath}`);
    const data = await this.redisClient.get(filePath);
    if (data === null) {
      throw new Error(`File not found: ${filePath}`);
    }
    return data;
  }

  async write(filePath: string, data: string): Promise<void> {
    this.logger.debug(`Writing file: ${filePath}`);
    await this.redisClient.set(filePath, data);
    const dir = this.getDir(filePath);
    if (dir) {
      await this.redisClient.set(dir, data);
    }
  }

  async exists(filePath: string): Promise<boolean> {
    const result = await this.redisClient.exists(filePath);
    return result === 1;
  }

  async delete(filePath: string): Promise<void> {
    await this.redisClient.del(filePath);
  }

  private getDir(filePath: string): string {
    const dir = path.dirname(filePath);
    return dir === '.' ? '' : dir;
  }
}
