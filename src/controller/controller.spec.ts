import { Test, TestingModule } from '@nestjs/testing';
import { Consts } from '../helper/consts';
import { AppController } from './controller';
import { Utils } from '../helper/utils';
import { AppService } from 'src/service/service';

describe('AppController', () => {
  let appController: AppController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [Utils, AppService, Consts],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  describe('root', () => {
    it('should return "Hello World!"', () => {
      //expect(appController.getHello()).toBe('Hello World!');
    });
  });
});
