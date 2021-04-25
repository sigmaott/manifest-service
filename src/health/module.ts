import { Module } from '@nestjs/common';
import { RedisFsModule } from '../redis-fs';
import { HealthController } from './controller';
import { HealthService } from './service';

@Module({
  imports: [RedisFsModule],
  controllers: [HealthController],
  providers: [HealthService],
})
export class HealthModule {}
