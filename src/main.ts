import { INestApplication, Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import * as config from 'config';
import * as morgan from 'morgan';
import { AllExceptionsFilter } from './helper/http-exception.filter';
import { AppModule } from './module';

const port = Number(config.get('server.port'));

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter());

  // Security middleware
  // await app.register(fastifyHelmet);

  app.useGlobalFilters(new AllExceptionsFilter());
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
  enableLogRequest(app);
  app.enableShutdownHooks();
  await app.listen(port, '0.0.0.0');
}

function enableLogRequest(app: INestApplication) {
  if (process.env.NODE_ENV === 'production') {
    return;
  }
  const logger = new Logger('HTTPRequest');
  const format = ':remote-addr - :remote-user ":method :url HTTP/:http-version" :status :res[content-length] ":referrer" ":user-agent" ":response-time ms"';

  app.use(
    morgan(format, {
      stream: { write: (s) => logger.verbose(s) },
      skip: (req) => req.url.includes('/health'),
    }),
  );
}

bootstrap();
