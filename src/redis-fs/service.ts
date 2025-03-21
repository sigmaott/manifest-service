import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cache } from 'cache-manager';
import { IFsService } from '../interface/fs.interface';

@Injectable()
export class RedisFsService implements IFsService {
  private readonly logger = new Logger(RedisFsService.name);

  constructor(@Inject(CACHE_MANAGER) private cacheManager: Cache) {}

  async read(filePath: string): Promise<string> {
    this.logger.debug(`Reading file: ${filePath}`);
    const data = await this.cacheManager.get<string>(filePath);
    if (!data) {
      throw new Error(`File not found: ${filePath}`);
    }
    return data;
  }

  async write(filePath: string, data: string): Promise<void> {
    this.logger.debug(`Writing file: ${filePath}`);
    await this.cacheManager.set(filePath, data, 0);
    
    const dir = this.getDir(filePath);
    if (dir) {
      await this.cacheManager.set(dir, data, 0);
    }
  }

  async exist(filePath: string): Promise<boolean> {
    const data = await this.cacheManager.get(filePath);
    return data !== undefined && data !== null;
  }

  async delete(filePath: string): Promise<void> {
    await this.cacheManager.del(filePath);
  }

  private getDir(filePath: string): string {
    const lastSlash = filePath.lastIndexOf('/');
    return lastSlash > 0 ? filePath.substring(0, lastSlash) : '';
  }
}
