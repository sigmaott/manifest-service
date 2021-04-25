import { Controller, DefaultValuePipe, Get, ParseBoolPipe, ParseIntPipe, Query, Req, Res } from '@nestjs/common';
import { Request, Response } from 'express';
import { AppService } from './service';
import * as status from 'http-status';
import * as config from 'config';

@Controller()
export class AppController {
  constructor(private appService: AppService) {}
  @Get(`${config.prefix}/*`)
  async getStreams(
    @Query('media', new DefaultValuePipe(false), ParseBoolPipe) isMedia: boolean,
    @Query('manifestfilter') manifestfilter: string,
    @Query('start', new DefaultValuePipe(0), new ParseIntPipe()) startTime: number,
    @Query('stop', new DefaultValuePipe(0), new ParseIntPipe()) stopTime: number,
    @Query('timeshift', new DefaultValuePipe(0), new ParseIntPipe()) timeShift: number,
    @Req() request: Request,
    @Res() response: Response,
  ) {
    const filePath = request.path.split(`/${config.prefix}/`)[1];
    try {
      const { manifest, contentType } = await this.appService.manifestFiltering(filePath, manifestfilter, startTime, stopTime, timeShift, isMedia);
      response.setHeader('Content-Type', contentType);
      return response.status(status.OK).send(manifest);
    } catch (error) {
      console.error(error);
      if (error.message) {
        return response.status(status.BAD_REQUEST).json({ error: error.message });
      }
      return response.status(status.BAD_REQUEST).json({ error: error });
    }
  }
}
