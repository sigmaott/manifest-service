import { CACHE_MANAGER, Inject, Injectable } from '@nestjs/common';
import { Cache } from 'cache-manager';
import { PassThrough } from 'stream';

@Injectable()
export class RedisFsService {
  constructor(@Inject(CACHE_MANAGER) private cacheManager: Cache) {}

  async isConnected(): Promise<boolean> {
    const store = this.cacheManager.store as any;
    const client = store.getClient();

    return client.status === 'ready';
  }

  readTextStream(stream: PassThrough): Promise<string> {
    return new Promise((resolve, reject) => {
      const data = [];
      stream.on('data', (buf) => data.push(buf));
      stream.on('end', () => resolve(Buffer.concat(data).toString()));
      stream.on('error', (err) => reject(err));
    });
  }

  async write(dir: string, data: string): Promise<void> {
    const infinity = 30 * 86400; // 1 month
    await this.cacheManager.set(dir, data, { ttl: infinity }); // {ttl : null} not work redis
  }

  async exist(dir: string): Promise<boolean> {
    const val = await this.cacheManager.get(dir);
    return !!val;
  }

  async read(dir: string): Promise<string | null> {
    return await this.cacheManager.get(dir);
  }

  async delete(dir: string): Promise<void> {
    await this.cacheManager.del(dir);
  }
}
