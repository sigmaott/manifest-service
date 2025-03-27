import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import * as config from 'config';
import Redis from 'ioredis';
import * as _ from 'lodash';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private client: Redis;

  constructor() {
    this.client = new Redis(_.get(config, 'redis'));
  }

  async onModuleInit() {
    try {
      await this.client.ping();
      console.log('Redis connection is healthy');
    } catch (error) {
      console.error('Error connecting to Redis:', error);
      throw new Error('Failed to connect to Redis');
    }
    console.log('Connected to Redis');
  }

  async onModuleDestroy() {
    await this.client.quit();
    console.log('Disconnected from Redis');
  }

  getClient(): Redis {
    return this.client;
  }
}
