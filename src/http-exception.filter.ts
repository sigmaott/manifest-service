import { ExceptionFilter, Catch, ArgumentsHost, HttpException, HttpStatus } from '@nestjs/common';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse();
    const request = ctx.getRequest();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message;
    if (exception instanceof HttpException) {
      const exceptionRes = exception.getResponse() as { message?: string[] };
      status = exception.getStatus();
      message = exceptionRes.message || exception.message;
    } else {
      console.error(exception);
    }

    response.status(status).json({
      statusCode: status,
      timestamp: new Date().toISOString(),
      message: message || 'Hệ thống có lỗi xin vui lòng thử lại',
      path: request.url,
    });
  }
}
