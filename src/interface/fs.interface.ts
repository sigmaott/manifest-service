export interface IFsService {
  read(filePath: string): Promise<string>;
  write(filePath: string, data: string): Promise<void>;
  exist(filePath: string): Promise<boolean>;
}
