import { Injectable, Logger } from '@nestjs/common';
import * as config from 'config';
import * as fs from 'fs';
import * as _ from 'lodash';
import * as path from 'path';

@Injectable()
export class StorageFsService {
  private readonly logger: Logger = new Logger(StorageFsService.name);
  private readonly prefix: string;

  constructor() {
    this.prefix = _.get(config, 'fs.prefix', '/');
  }

  async read(inputPath: string): Promise<string> {
    const fullPath = path.join(this.prefix, inputPath);
    return new Promise((resolve, reject) => {
      fs.readFile(fullPath, 'utf8', (err, data) => {
        if (err) {
          return reject(err);
        }
        resolve(data);
      });
    });
  }
  async write(inputPath: string, data: string): Promise<void> {
    const fullPath = path.join(this.prefix, inputPath);
    return new Promise((resolve, reject) => {
      fs.writeFile(fullPath, data, 'utf8', (err) => {
        if (err) {
          return reject(err);
        }
        resolve();
      });
    });
  }

  async exist(inputPath: string): Promise<boolean> {
    const fullPath = path.join(this.prefix, inputPath);
    this.logger.debug(`Checking if ${fullPath} exists`);

    return new Promise((resolve) => {
      fs.access(fullPath, fs.constants.F_OK, (err) => {
        resolve(!err);
      });
    });
  }
}
