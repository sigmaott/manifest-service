import { HttpService } from '@nestjs/axios';
import { Injectable, Logger } from '@nestjs/common';
import * as config from 'config';
import { firstValueFrom, map } from 'rxjs';
import { AxiosResponse } from 'axios';
import * as _ from 'lodash';

@Injectable()
export class StorageHttpService {
  private readonly logger = new Logger(StorageHttpService.name);
  private readonly apiUrl: string;

  constructor(private readonly httpService: HttpService) {
    this.apiUrl = _.get(config, 'storage.http.url');
  }

  async read(inputPath: string): Promise<string> {
    const url = `${this.apiUrl}${inputPath}`;
    this.logger.debug(`Reading file: ${url}`);
    try {
      const response = await firstValueFrom(this.httpService.get<string>(url).pipe(map((res) => res.data)));
      return response;
    } catch (err) {
      this.logger.error(`Error reading file: ${inputPath}`, err);
      throw err;
    }
  }

  async write(inputPath: string, data: string): Promise<void> {
    const url = `${this.apiUrl}${inputPath}`;
    this.logger.debug(`Writing file: ${url}`);
    const payload = { content: data };

    try {
      await firstValueFrom(this.httpService.post(url, payload).pipe(map(() => void 0)));
    } catch (err) {
      this.logger.error(`Error writing file: ${inputPath}`, err);
      throw err;
    }
  }

  async exist(inputPath: string): Promise<boolean> {
    const url = `${this.apiUrl}${inputPath}`;

    try {
      const response = await firstValueFrom(this.httpService.get<any>(url).pipe(map((res) => res as AxiosResponse)));
      return response.status === 200;
    } catch (err) {
      if (err.response?.status === 404) {
        this.logger.debug(`File does not exist: ${url}`);
        return false;
      }
      this.logger.error(`Error checking if file exists: ${url}`, err);
      return false;
    }
  }
}
