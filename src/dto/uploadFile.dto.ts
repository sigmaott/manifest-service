import { Type } from 'class-transformer';
import { IsOptional, Max, Min } from 'class-validator';

export class UploadFileDto {
  @Type(() => Number)
  @Min(0)
  @IsOptional()
  _HLS_msn: number;

  @Type(() => Number)
  @Min(0)
  @Max(20)
  @IsOptional()
  _HLS_part: number;
}
