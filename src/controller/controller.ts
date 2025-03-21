import { Controller, Get, HttpCode, Query, Req, Res } from '@nestjs/common';
import * as config from 'config';
import { Request, Response } from 'express';
import * as status from 'http-status';
import { ManifestFilteringDto } from 'src/dto/manifest-filtering.dto';
import { AppService } from '../service/service';

@Controller()
export class AppController {
  constructor(private appService: AppService) {}
  @Get(`${config.get('server.prefix')}/*`)
  @HttpCode(status.OK)
  async getStreams(@Query() manifestDto: ManifestFilteringDto, @Req() request: Request, @Res() response: Response) {
    const requestPath = request.path || request.url;
    const filePath = 'manifest' + '/' + requestPath.split(`/${config.get('server.prefix')}/`)[1];
    const { manifest, contentType } = await this.appService.manifestFiltering(filePath, manifestDto);
    response.setHeader('Content-Type', contentType);
    return response.send(manifest);
  }
}
