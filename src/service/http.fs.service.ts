import { HttpService, Injectable, Logger } from '@nestjs/common';
import * as config from 'config';
import * as _ from 'lodash';
import { catchError, map } from 'rxjs/operators';

@Injectable()
export class StorageHttpService {
  private readonly logger: Logger = new Logger(StorageHttpService.name);
  private readonly apiUrl: string;

  constructor(private readonly httpService: HttpService) {
    this.apiUrl = _.get(config, 'storageApi.url', 'http://origin-live-sdrm.tv360.vn/');
  }

  // Đọc nội dung file
  async read(inputPath: string): Promise<string> {
    const url = `${this.apiUrl}${inputPath}`;
    this.logger.debug(`Reading file: ${url}`);
    return this.httpService
      .get(url)
      .pipe(
        map((response) => response.data),
        catchError((err) => {
          this.logger.error(`Error reading file: ${inputPath}`, err);
          throw err;
        }),
      )
      .toPromise();
  }

  // Ghi nội dung vào file
  async write(inputPath: string, data: string): Promise<void> {
    const url = `${this.apiUrl}${inputPath}`;
    this.logger.debug(`Writing file: ${url}`);
    const payload = { content: data };

    await this.httpService
      .post(url, payload)
      .pipe(
        catchError((err) => {
          this.logger.error(`Error writing file: ${inputPath}`, err);
          throw err;
        }),
      )
      .toPromise();
    return;
  }

  // Kiểm tra sự tồn tại của file (status code 200)
  async exist(inputPath: string): Promise<boolean> {
    const url = `${this.apiUrl}${inputPath}`;

    return this.httpService
      .get(url)
      .pipe(
        map(() => {
          this.logger.debug(`File exists: ${url}`);
          return true;
        }), // Nếu mã trạng thái là 200, trả về true
        catchError((err) => {
          if (err.response && err.response.status === 404) {
            this.logger.debug(`File does not exist: ${url}`);
            return [false]; // Nếu mã trạng thái là 404, trả về false
          }
          this.logger.error(`Error checking if file exists: ${url}`, err);
          return [false];
        }),
      )
      .toPromise();
  }
}
