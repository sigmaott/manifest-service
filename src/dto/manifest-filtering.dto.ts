import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsNumber, IsOptional, Max, Min } from 'class-validator';
import { UploadFileDto } from './uploadFile.dto';

export class ManifestFilteringDto extends UploadFileDto {
  @Type(() => Boolean)
  @IsBoolean()
  @IsOptional()
  media: boolean;

  @IsOptional()
  manifestfilter: string;

  @Transform(function (value) {
    if (isNumeric(value.value)) {
      return parseInt(value.value);
    } else if (Array.isArray(value.value) && value.value.length > 0) {
      return parseInt(value.value[0]);
    }
    return '';
  })
  @IsNumber()
  @IsOptional()
  start: number;

  @Transform(function (value) {
    if (isNumeric(value.value)) {
      return parseInt(value.value);
    } else if (Array.isArray(value.value) && value.value.length > 0) {
      return parseInt(value.value[0]);
    }
    return '';
  })
  @IsNumber()
  @IsOptional()
  stop: number;

  @Transform(function (value) {
    if (isNumeric(value.value)) {
      return parseInt(value.value);
    } else if (Array.isArray(value.value) && value.value.length > 0) {
      return parseInt(value.value[0]);
    }
    return '';
  })
  @IsNumber()
  @Min(10)
  @Max(24 * 60 * 60)
  @IsOptional()
  timeshift: number;
}

function isNumeric(str) {
  if (typeof str != 'string') return false; // we only process strings!
  return !isNaN(parseFloat(str)); // ...and ensure strings of whitespace fail
}
