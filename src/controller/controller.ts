import { Controller, Get, HttpCode, Query, Req, Res } from '@nestjs/common';
import { Request, Response } from 'express';
import * as status from 'http-status';
import * as config from 'config';
import { AppService } from '../service/service';
import { ManifestFilteringDto } from 'src/dto/manifest-filtering.dto';

@Controller()
export class AppController {
  constructor(private appService: AppService) {}
  @Get(`${config.prefix}/*`)
  @HttpCode(status.OK)
  async getStreams(@Query() manifestDto: ManifestFilteringDto, @Req() request: Request, @Res() response: Response) {
    const requestPath = request.path || request.url;
    const filePath = 'manifest' + '/' + requestPath.split(`/${config.prefix}/`)[1];
    const { manifest, contentType } = await this.appService.manifestFiltering(filePath, manifestDto);
    response.setHeader('Content-Type', contentType);
    return response.send(manifest);
  }
}
