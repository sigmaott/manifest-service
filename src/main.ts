import { NestFactory } from '@nestjs/core';
import { AppModule } from './module';
import * as morgan from 'morgan';
import * as config from 'config';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { ExpressAdapter, NestExpressApplication } from '@nestjs/platform-express';
const port = config.server.port;
async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter());
  app.use(morgan('combined'));
  await app.listen(port, '0.0.0.0');
}
bootstrap();
