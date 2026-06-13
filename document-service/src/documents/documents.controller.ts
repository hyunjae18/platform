import {
  Controller,
  Post,
  Body,
  Get,
  Put,
  Delete,
  Param,
  UseInterceptors,
  UploadedFile,
  Req,
  BadRequestException,
  Query,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Request } from 'express';
import {
  DocumentsService,
  DocumentDocument,
  DocumentPayload,
} from './documents.service';

type DocumentRequestBody = DocumentPayload;

@Controller('documents')
export class DocumentsController {
  constructor(private readonly documentsService: DocumentsService) {}

  @Post('process')
  @UseInterceptors(FileInterceptor('file'))
  async processDocument(
    @UploadedFile() file?: Express.Multer.File,
    @Body() body: DocumentRequestBody = {},
    @Req() req?: Request,
  ): Promise<DocumentDocument | null> {
    let documentId = body.documentId ?? body.documentId;
    const name = file?.originalname ?? body.name ?? body.filename ?? 'unnamed';
    const type = file?.mimetype ?? body.type ?? 'unknown';
    const size = file?.size ?? body.size ?? 0;
    const headerUserId = req?.headers['x-user-id'];
    const headerEnterpriseId = req?.headers['x-enterprise-id'];
    const ownerId =
      body.ownerId ??
      body.userId ??
      (Array.isArray(headerUserId) ? headerUserId[0] : headerUserId) ??
      'unknown';
    const enterprise_id =
      (Array.isArray(headerEnterpriseId)
        ? headerEnterpriseId[0]
        : headerEnterpriseId);
    const extractedText = body.extractedText ?? body.text ?? '';

    if (!enterprise_id) {
      throw new BadRequestException('Missing enterprise_id');
    }

    if (!documentId) {
      documentId = `doc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    const data: DocumentPayload = {
      documentId,
      name,
      type,
      size,
      ownerId,
      enterprise_id,
      extractedText,
    };

    return this.documentsService.processDocument(data);
  }

  @Post('update')
  async updateDocument(
    @Body() data: DocumentRequestBody,
    @Req() req?: Request,
  ): Promise<DocumentDocument | null> {
    if (data.documentId && data.text !== undefined) {
      const headerEnterpriseId = req?.headers['x-enterprise-id'];
      const enterprise_id =
        (Array.isArray(headerEnterpriseId)
          ? headerEnterpriseId[0]
          : headerEnterpriseId);
      if (!enterprise_id) {
        throw new BadRequestException('Missing enterprise_id');
      }
      return this.documentsService.updateWithOcr(
        data.documentId,
        enterprise_id,
        data.text,
      );
    }

    return this.documentsService.processDocument(data);
  }

  @Post('json')
  async processDocumentJson(
    @Body() data: DocumentRequestBody,
    @Req() req?: Request,
  ): Promise<DocumentDocument | null> {
    const headerEnterpriseId = req?.headers['x-enterprise-id'];
    return this.documentsService.processDocument({
      ...data,
      enterprise_id:
        (Array.isArray(headerEnterpriseId)
          ? headerEnterpriseId[0]
          : headerEnterpriseId),
    });
  }

  // ------------------------------------------------------------------
  // NEW: Mark document as failed (called by API Gateway)
  // ------------------------------------------------------------------
  @Post('fail')
  async failDocument(
    @Body() body: { documentId: string; error_message: string },
    @Req() req?: Request,
  ): Promise<DocumentDocument> {
    const headerEnterpriseId = req?.headers['x-enterprise-id'];
    const enterprise_id = Array.isArray(headerEnterpriseId)
      ? headerEnterpriseId[0]
      : headerEnterpriseId;
    if (!enterprise_id) {
      throw new BadRequestException('Missing enterprise_id');
    }
    return this.documentsService.failDocument(body.documentId, enterprise_id, body.error_message);
  }

  // ------------------------------------------------------------------
  // NEW: Reprocess failed document (called by admin via Node auth server)
  // ------------------------------------------------------------------
  @Post(':id/reprocess')
  async reprocessDocument(
    @Param('id') id: string,
    @Req() req?: Request,
  ): Promise<DocumentDocument> {
    const headerEnterpriseId = req?.headers['x-enterprise-id'];
    const enterprise_id = Array.isArray(headerEnterpriseId)
      ? headerEnterpriseId[0]
      : headerEnterpriseId;
    if (!enterprise_id) {
      throw new BadRequestException('Missing enterprise_id');
    }
    return this.documentsService.reprocessDocument(id, enterprise_id);
  }

  // ------------------------------------------------------------------
  // NEW: Get failed documents (admin only, called by Node auth server)
  // ------------------------------------------------------------------
  @Get('failed')
  async getFailedDocuments(
    @Req() req?: Request,
  ): Promise<DocumentDocument[]> {
    const headerEnterpriseId = req?.headers['x-enterprise-id'];
    const enterprise_id = Array.isArray(headerEnterpriseId)
      ? headerEnterpriseId[0]
      : headerEnterpriseId;
    // If admin, they can get all failed docs; if member, only their own enterprise
    return this.documentsService.getFailedDocuments(enterprise_id);
  }

  @Get(':id')
  async getDocument(
    @Param('id') id: string,
    @Req() req?: Request,
  ): Promise<DocumentDocument | null> {
    const headerEnterpriseId = req?.headers['x-enterprise-id'];
    const enterprise_id = Array.isArray(headerEnterpriseId)
      ? headerEnterpriseId[0]
      : headerEnterpriseId;
    if (!enterprise_id) {
      throw new BadRequestException('Missing enterprise_id');
    }
    return this.documentsService.getDocument(id, enterprise_id);
  }

  @Put(':id/metadata')
  async updateMetadata(
    @Param('id') id: string,
    @Body() body: { metadata?: Record<string, unknown> },
    @Req() req?: Request,
  ): Promise<DocumentDocument> {
    const headerEnterpriseId = req?.headers['x-enterprise-id'];
    const enterprise_id = Array.isArray(headerEnterpriseId)
      ? headerEnterpriseId[0]
      : headerEnterpriseId;
    if (!enterprise_id) {
      throw new BadRequestException('Missing enterprise_id');
    }
    return this.documentsService.updateMetadata(
      id,
      enterprise_id,
      body.metadata ?? body,
    );
  }

  @Delete(':id')
  async deleteDocument(
    @Param('id') id: string,
    @Req() req?: Request,
  ): Promise<{ message: string; documentId: string }> {
    const headerEnterpriseId = req?.headers['x-enterprise-id'];
    const enterprise_id = Array.isArray(headerEnterpriseId)
      ? headerEnterpriseId[0]
      : headerEnterpriseId;
    if (!enterprise_id) {
      throw new BadRequestException('Missing enterprise_id');
    }
    return this.documentsService.deleteDocument(id, enterprise_id);
  }

  @Get()
  async getAllDocuments(@Req() req?: Request): Promise<DocumentDocument[]> {
    const headerEnterpriseId = req?.headers['x-enterprise-id'];
    const enterprise_id = Array.isArray(headerEnterpriseId)
      ? headerEnterpriseId[0]
      : headerEnterpriseId;
    if (!enterprise_id) {
      throw new BadRequestException('Missing enterprise_id');
    }
    return this.documentsService.getAllDocuments(enterprise_id);
  }
}
