import { Type } from 'class-transformer';
import { IsBoolean, IsNumber, IsOptional, Max, Min } from 'class-validator';
import { UploadFileDto } from './uploadFile.dto';

export class ManifestFilteringDto extends UploadFileDto {
  @Type(() => Boolean)
  @IsBoolean()
  @IsOptional()
  media: boolean;

  @IsOptional()
  manifestfilter: string;

  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  start: number;

  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  stop: number;

  @Type(() => Number)
  @Min(30)
  @Max(12 * 60 * 60)
  @IsOptional()
  timeshift: number;
}
