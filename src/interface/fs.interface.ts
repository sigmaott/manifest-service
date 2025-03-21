export interface IFsService {
  read(filePath: string): Promise<string>;
  write(filePath: string, data: string): Promise<void>;
  exists(filePath: string): Promise<boolean>;
  delete(filePath: string): Promise<void>;
}
