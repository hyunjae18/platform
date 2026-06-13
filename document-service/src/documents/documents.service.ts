import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Document, Model } from 'mongoose';

export interface DocumentPayload {
  documentId?: string;
  name?: string;
  filename?: string;
  type?: string;
  size?: number;
  ownerId?: string;
  userId?: string;
  enterprise_id?: string;
  enterpriseId?: string;
  extractedText?: string;
  text?: string;
  metadata?: Record<string, unknown>;
  category?: string;
  indexedAt?: string;
}

export interface DocumentDocument extends Document {
  documentId: string;
  name: string;
  type: string;
  size: number;
  ownerId: string;
  enterprise_id: string;
  status: string;
  extractedText: string;
  metadata?: Record<string, unknown>;
  category: string;
  storagePath?: string;
  uploadedAt: string;
  ocrCompletedAt?: string;
  classifiedAt?: string;
  indexedAt?: string;
  errorMessage?: string;
  errorAt?: string;
  reprocessCount?: number;
  lastReprocessedAt?: string;
  originalJobId?: string;
}

@Injectable()
export class DocumentsService {
  private readonly logger = new Logger(DocumentsService.name);

  constructor(
    @InjectModel('Document') private documentModel: Model<DocumentDocument>,
  ) {}

  async processDocument(
    data: DocumentPayload,
  ): Promise<DocumentDocument | null> {
    this.logger.log(`Processing document: ${data.documentId || 'new'}`);

    const documentId =
      data.documentId ??
      data.documentId ??
      `doc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const name = data.name ?? data.filename ?? 'unnamed';
    const type = data.type ?? 'unknown';
    const size = data.size ?? 0;
    const ownerId = data.ownerId ?? data.userId ?? 'unknown';
    const enterprise_id = data.enterprise_id ?? data.enterpriseId;
    const extractedText = data.extractedText ?? data.text ?? '';
    const metadata = data.metadata ?? {};

    if (!enterprise_id) {
      throw new Error('Missing enterprise_id');
    }

    const document = await this.documentModel.findOneAndUpdate(
      { documentId, enterprise_id },
      {
        documentId,
        name,
        type,
        size,
        ownerId,
        enterprise_id,
        extractedText,
        metadata,
        status: extractedText ? 'processed' : 'uploaded',
        uploadedAt: new Date().toISOString(),
      },
      { new: true, upsert: true },
    );

    if (document) {
      this.logger.log(
        `Document ${documentId} saved with status: ${document.status}`,
      );
    }

    return document;
  }

  async updateWithOcr(
    documentId: string,
    enterprise_id: string,
    text: string,
  ): Promise<DocumentDocument | null> {
    this.logger.log(
      `Updating document ${documentId} with OCR result (${text.length} chars)`,
    );

    const result = await this.documentModel.findOneAndUpdate(
      { documentId, enterprise_id },
      {
        extractedText: text,
        status: 'processed',
        ocrCompletedAt: new Date().toISOString(),
      },
      { new: true },
    );

    if (result) {
      this.logger.log(`Document ${documentId} updated - OCR complete`);
    } else {
      this.logger.warn(`Document ${documentId} not found for OCR update`);
    }

    return result;
  }

  async updateWithCategory(
    documentId: string,
    enterprise_id: string,
    category: string,
  ): Promise<DocumentDocument | null> {
    this.logger.log(
      `Updating document ${documentId} with category: ${category}`,
    );

    const result = await this.documentModel.findOneAndUpdate(
      { documentId, enterprise_id },
      {
        category,
        status: 'processed',
        classifiedAt: new Date().toISOString(),
      },
      { new: true },
    );

    if (result) {
      this.logger.log(`Document ${documentId} updated - Category: ${category}`);
    } else {
      this.logger.warn(`Document ${documentId} not found for category update`);
    }

    return result;
  }

  async updateWithSearchIndex(
    documentId: string,
    enterprise_id: string,
    indexedAt: string,
  ): Promise<DocumentDocument | null> {
    this.logger.log(
      `Updating document ${documentId} with search index confirmation`,
    );

    const result = await this.documentModel.findOneAndUpdate(
      { documentId, enterprise_id },
      {
        status: 'processed',
        indexedAt: indexedAt || new Date().toISOString(),
      },
      { new: true },
    );

    if (result) {
      this.logger.log(`Document ${documentId} updated - Search indexed`);
    } else {
      this.logger.warn(
        `Document ${documentId} not found for search index update`,
      );
    }

    return result;
  }

  // ------------------------------------------------------------------
  // NEW: Mark document as failed
  // ------------------------------------------------------------------
  async failDocument(documentId: string, enterprise_id: string, errorMessage: string): Promise<DocumentDocument> {
    const doc = await this.documentModel.findOneAndUpdate(
      { documentId, enterprise_id },
      {
        status: 'failed',
        errorMessage,
        errorAt: new Date().toISOString(),
      },
      { new: true },
    );
    if (!doc) {
      throw new NotFoundException(`Document ${documentId} not found`);
    }
    this.logger.warn(`Document ${documentId} marked as FAILED: ${errorMessage}`);
    return doc;
  }

  // ------------------------------------------------------------------
  // NEW: Reprocess a failed document
  // ------------------------------------------------------------------
  async reprocessDocument(documentId: string, enterprise_id: string): Promise<DocumentDocument> {
    const doc = await this.documentModel.findOne({ documentId, enterprise_id });
    if (!doc) {
      throw new NotFoundException(`Document ${documentId} not found`);
    }
    if (doc.status !== 'failed') {
      throw new BadRequestException('Only failed documents can be reprocessed');
    }
    const currentCount = doc.reprocessCount ?? 0;
    if (currentCount >= 3) {
      throw new BadRequestException(`Reprocess limit reached (max 3). Manual intervention required.`);
    }

    // Update status back to processing
    const updated = await this.documentModel.findOneAndUpdate(
      { documentId, enterprise_id },
      {
        status: 'processing',
        reprocessCount: currentCount + 1,
        lastReprocessedAt: new Date().toISOString(),
        errorMessage: null,
        errorAt: null,
      },
      { new: true },
    );
    this.logger.log(`Document ${documentId} reprocess queued (attempt ${currentCount + 1})`);
    return updated;
  }

  // ------------------------------------------------------------------
  // NEW: Get all failed documents for admin
  // ------------------------------------------------------------------
  async getFailedDocuments(enterprise_id?: string): Promise<DocumentDocument[]> {
    const filter: any = { status: 'failed' };
    if (enterprise_id) {
      filter.enterprise_id = enterprise_id;
    }
    return this.documentModel.find(filter).sort({ errorAt: -1 }).limit(100);
  }

  async getDocument(
    documentId: string,
    enterprise_id: string,
  ): Promise<DocumentDocument | null> {
    return this.documentModel.findOne({ documentId, enterprise_id });
  }

  async updateMetadata(
    documentId: string,
    enterprise_id: string,
    metadata: Record<string, unknown>,
  ): Promise<DocumentDocument> {
    const doc = await this.documentModel.findOneAndUpdate(
      { documentId, enterprise_id },
      { metadata },
      { new: true },
    );
    if (!doc) {
      throw new NotFoundException(`Document ${documentId} not found`);
    }
    return doc;
  }

  async deleteDocument(
    documentId: string,
    enterprise_id: string,
  ): Promise<{ message: string; documentId: string }> {
    const doc = await this.documentModel.findOneAndDelete({
      documentId,
      enterprise_id,
    });
    if (!doc) {
      throw new NotFoundException(`Document ${documentId} not found`);
    }
    return { message: 'Document deleted', documentId };
  }

  async getAllDocuments(enterprise_id: string): Promise<DocumentDocument[]> {
    const docs = await this.documentModel
      .find({ enterprise_id })
      .sort({ createdAt: -1 });
    this.logger.log(`Returning ${docs.length} documents`);
    return docs;
  }
}
