import { NestFactory } from '@nestjs/core';
import { AppModule } from './module';
import * as morgan from 'morgan';
import * as config from 'config';
import * as helmet from 'helmet';
import { ExpressAdapter, NestExpressApplication } from '@nestjs/platform-express';
import { INestApplication, Logger } from '@nestjs/common';
import { AllExceptionsFilter } from './http-exception.filter';
const port = config.server.port;
async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, new ExpressAdapter());
  // app.enable('trust proxy');
  app.use(helmet());
  // app.use(morgan('combined'));
  app.useGlobalFilters(new AllExceptionsFilter());
  enableLogRequest(app);
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
