// src/archive/archive.controller.ts
import {
  Controller,
  Post,
  Param,
  Get,
  Delete,
  Res,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  Body,
  Query,
  Req,
  BadRequestException,
  UnauthorizedException, // Added for API key validation
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ArchiveService } from './archive.service';
import type { Response, Request } from 'express';

type UploadedArchiveFile = {
  originalname: string;
  buffer: Buffer;
  size: number;
};

@Controller('archive')
export class ArchiveController {
  constructor(private readonly archiveService: ArchiveService) {}

  // 1. Read directly from the gateway's forwarded header
  private getEnterpriseId(req: Request): string {
    const enterpriseId = req.headers['x-enterprise-id'] as string;
    if (!enterpriseId) {
      throw new BadRequestException('Missing X-Enterprise-ID header from Gateway');
    }
    return enterpriseId;
  }

  // 2. Simple guard or method check to validate the Gateway's API Key
  private validateGatewayRequest(req: Request) {
    const apiKey = req.headers['x-api-key'];
    const expectedKey = process.env.ARCHIVING_API_KEY; // Ensure this is in your NestJS .env
    
    if (!apiKey || apiKey !== expectedKey) {
      throw new UnauthorizedException('Invalid or missing Gateway API Key');
    }
  }

  // Example updated endpoint (Apply this pattern across your routes)
  @Post('store')
  @UseInterceptors(FileInterceptor('file'))
  async store(
    @UploadedFile() file: UploadedArchiveFile,
    @Query('documentId') documentId: string | undefined,
    @Req() req: Request,
  ) {
    this.validateGatewayRequest(req); // Secure internal communication
    
    if (!file) {
      throw new BadRequestException('Missing file');
    }

    const finalDocumentId =
      documentId || `archive_${Date.now()}_${file.originalname.replace(/\s+/g, '_')}`;
    
    const doc = await this.archiveService.register(
      finalDocumentId,
      this.getEnterpriseId(req),
      file.buffer,
      file.originalname,
    );

    return {
      message: 'Stored',
      documentId: doc.documentId,
      location: doc.location,
      hash: doc.fileHash,
      size: doc.size,
      fileName: doc.fileName,
    };
  }
  
  // @UseGuards(AuthGuard('jwt'))
  @Post('upload')
  async upload(
    @Body('documentId') documentId: string,
    @Body('file') fileBase64: string,
    @Req() req: Request,
  ) {
    this.validateGatewayRequest(req)
    const buffer = Buffer.from(fileBase64, 'base64');
    const doc = await this.archiveService.register(
      documentId,
      this.getEnterpriseId(req),
      buffer,
      documentId,
    );
    return {
      message: 'Uploaded',
      documentId: doc.documentId,
      location: doc.location,
      hash: doc.fileHash,
    };
  }

  // @UseGuards(AuthGuard('jwt'))
  @Get()
  async list(
    @Query('page') page = '1',
    @Query('page_size') pageSize = '20',
    @Query('status') status: 'HOT' | 'COLD' | undefined,
    @Req() req: Request,
  ) {
    this.validateGatewayRequest(req)
    return this.archiveService.list(
      this.getEnterpriseId(req),
      Number(page),
      Number(pageSize),
      status,
    );
  }

  // @UseGuards(AuthGuard('jwt'))
  @Post('soft-delete')
  async softDelete(@Body('documentId') documentId: string, @Req() req: Request) {
    this.validateGatewayRequest(req)
    if (!documentId) {
      throw new BadRequestException('Missing documentId');
    }

    await this.archiveService.archive(documentId, this.getEnterpriseId(req));
    return { message: 'Archived', documentId };
  }

  // @UseGuards(AuthGuard('jwt'))
  @Post('restore')
  async restore(@Body('documentId') documentId: string, @Req() req: Request) {
    this.validateGatewayRequest(req)
    if (!documentId) {
      throw new BadRequestException('Missing documentId');
    }

    await this.archiveService.restore(documentId, this.getEnterpriseId(req));
    return { message: 'Restored', documentId };
  }

  // @UseGuards(AuthGuard('jwt'))
  @Post(':id')
  async archive(@Param('id') id: string, @Req() req: Request) {
    this.validateGatewayRequest(req)
    await this.archiveService.archive(id, this.getEnterpriseId(req));
    return { message: 'Archived' };
  }

  // @UseGuards(AuthGuard('jwt'))
  @Get(':id/presigned-url')
  async getPresignedUrl(@Param('id') id: string, @Req() req: Request) {
    this.validateGatewayRequest(req)
    return this.archiveService.getPresignedUrl(
      id,
      this.getEnterpriseId(req),
    );
  }

  // @UseGuards(AuthGuard('jwt'))
  @Get(':id')
  async get(@Param('id') id: string, @Req() req: Request, @Res() res: Response) {
    this.validateGatewayRequest(req)
    const stream = await this.archiveService.get(id, this.getEnterpriseId(req));
    stream.pipe(res);
  }

  // @UseGuards(AuthGuard('jwt'))
  
  @Delete(':id')
  async remove(@Param('id') id: string, @Req() req: Request) {
    this.validateGatewayRequest(req)
    await this.archiveService.remove(id, this.getEnterpriseId(req));
    return { message: 'Deleted', documentId: id };
  }
  // ... Remove @UseGuards(AuthGuard('jwt')) from the rest of your routes 
  // and invoke this.validateGatewayRequest(req) at the start of each method.
}