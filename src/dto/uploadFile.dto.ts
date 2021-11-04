import { Type } from 'class-transformer';
import { Max, Min } from 'class-validator';

export class UploadFileDto {
  @Type(() => Number)
  @Min(1)
  _HLS_msn: number;

  @Type(() => Number)
  @Min(1)
  @Max(20)
  _HLS_part: number;
}
