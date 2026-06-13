// src/archive/archive.service.ts
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { MinioProvider } from '../providers/minio.provider';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import {
  ArchiveDocument,
  ArchiveDocumentType,
} from '../schemas/archive.schema';
import * as crypto from 'crypto';

@Injectable()
export class ArchiveService {
  private readonly logger = new Logger(ArchiveService.name);
  private readonly archiveAfterDays: number;

  constructor(
    @InjectModel(ArchiveDocument.name)
    private readonly archiveModel: Model<ArchiveDocumentType>,
    private readonly minio: MinioProvider,
    private readonly configService: ConfigService,
  ) {
    this.archiveAfterDays =
      this.configService.get<number>('ARCHIVE_AFTER_DAYS') ?? 30;
  }

  /**
   * Register a new document: upload to hot bucket and record in MongoDB.
   */
  async register(
    documentId: string,
    enterprise_id: string,
    fileBuffer: Buffer,
    fileName = documentId,
  ): Promise<ArchiveDocument> {
    const hash = crypto.createHash('sha256').update(fileBuffer).digest('hex');

    await this.minio.uploadToHot(documentId, fileBuffer);

    const record = await this.archiveModel.findOneAndUpdate(
      { documentId, enterprise_id },
      {
        documentId,
        enterprise_id,
        fileHash: hash,
        location: 'HOT',
        size: fileBuffer.length,
        fileName,
        archivedAt: null,
      },
      { new: true, upsert: true },
    );
    if (!record) {
      throw new Error(`Failed to register archive document ${documentId}`);
    }

    this.logger.log(`Stored document in hot archive bucket: ${documentId}`);
    return record;
  }

  /**
   * Move a document from hot to cold storage (archive).
   */
  async archive(documentId: string, enterprise_id: string): Promise<void> {
    const doc = await this.archiveModel.findOne({ documentId, enterprise_id });
    if (!doc) throw new NotFoundException(`Document ${documentId} not found`);
    if (doc.location === 'COLD') {
      throw new Error('Document already archived');
    }

    if (this.minio.usesSameHotAndColdBucket()) {
      doc.location = 'COLD';
      doc.archivedAt = new Date();
      await doc.save();
      this.logger.log(`Marked document as archived: ${documentId}`);
      return;
    }

    // Download from hot
    const stream = await this.minio.downloadFromHot(documentId);
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(chunk);
    const buffer = Buffer.concat(chunks);

    // Upload to cold
    await this.minio.uploadToCold(documentId, buffer);

    // Delete from hot
    await this.minio.deleteFromHot(documentId);

    // Update MongoDB record
    doc.location = 'COLD';
    doc.archivedAt = new Date();
    await doc.save();

    this.logger.log(`Archived document: ${documentId}`);
  }

  /**
   * Retrieve document stream (checks MongoDB for location).
   */
  async get(documentId: string, enterprise_id: string) {
    const doc = await this.archiveModel.findOne({ documentId, enterprise_id });
    if (!doc) throw new NotFoundException(`Document ${documentId} not found`);

    if (doc.location === 'HOT') {
      return this.minio.downloadFromHot(documentId);
    } else {
      return this.minio.downloadFromCold(documentId);
    }
  }

  async list(
    enterprise_id: string,
    page = 1,
    pageSize = 20,
    location?: 'HOT' | 'COLD',
  ) {
    const filter: Record<string, unknown> = { enterprise_id };
    if (location) {
      filter.location = location;
    }

    const safePage = Math.max(page, 1);
    const safePageSize = Math.min(Math.max(pageSize, 1), 100);
    const [items, total] = await Promise.all([
      this.archiveModel
        .find(filter)
        .sort({ createdAt: -1 })
        .skip((safePage - 1) * safePageSize)
        .limit(safePageSize)
        .exec(),
      this.archiveModel.countDocuments(filter),
    ]);

    return {
      items,
      total,
      page: safePage,
      pageSize: safePageSize,
    };
  }

  async restore(documentId: string, enterprise_id: string): Promise<void> {
    const doc = await this.archiveModel.findOne({ documentId, enterprise_id });
    if (!doc) throw new NotFoundException(`Document ${documentId} not found`);
    if (doc.location === 'HOT') {
      return;
    }

    if (this.minio.usesSameHotAndColdBucket()) {
      doc.location = 'HOT';
      doc.archivedAt = null;
      await doc.save();
      this.logger.log(`Marked document as restored: ${documentId}`);
      return;
    }

    const stream = await this.minio.downloadFromCold(documentId);
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(chunk);
    const buffer = Buffer.concat(chunks);

    await this.minio.uploadToHot(documentId, buffer);
    await this.minio.deleteFromCold(documentId);

    doc.location = 'HOT';
    doc.archivedAt = null;
    await doc.save();

    this.logger.log(`Restored document to hot storage: ${documentId}`);
  }

  async remove(documentId: string, enterprise_id: string): Promise<void> {
    const doc = await this.archiveModel.findOne({ documentId, enterprise_id });
    if (!doc) throw new NotFoundException(`Document ${documentId} not found`);

    if (doc.location === 'HOT') {
      if (await this.minio.objectExistsInHot(documentId)) {
        await this.minio.deleteFromHot(documentId);
      }
    } else if (await this.minio.objectExistsInCold(documentId)) {
      await this.minio.deleteFromCold(documentId);
    }

    await this.archiveModel.deleteOne({ documentId, enterprise_id });
    this.logger.log(`Deleted archived document: ${documentId}`);
  }

  /**
   * Check if a file with the same hash already exists (deduplication).
   */
  async existsByHash(hash: string, enterprise_id: string): Promise<boolean> {
    const doc = await this.archiveModel.findOne({ fileHash: hash, enterprise_id });
    return !!doc;
  }

  /**
   * Generate a presigned GET URL for the document (valid 15 min).
   */
  async getPresignedUrl(
    documentId: string,
    enterprise_id: string,
  ): Promise<{ url: string }> {
    const doc = await this.archiveModel.findOne({ documentId, enterprise_id });
    if (!doc) throw new NotFoundException(`Document ${documentId} not found`);

    const bucket =
      doc.location === 'HOT'
        ? this.minio.getHotBucket()
        : this.minio.getColdBucket();

    const client =
      doc.location === 'HOT'
        ? this.minio.getHotClient()
        : this.minio.getColdClient();

    const url = await client.presignedGetObject(bucket, documentId, 15 * 60);
    return { url };
  }

  // ---------- Cron Jobs ----------

  /**
   * Cron: midnight – archive documents older than X days (based on createdAt in MongoDB).
   */
  @Cron('0 0 * * *')
  async handleCron() {
    this.logger.log('Cron: scanning for old documents...');
    const threshold = new Date();
    threshold.setDate(threshold.getDate() - this.archiveAfterDays);

    const oldDocs = await this.archiveModel.find({
      location: 'HOT',
      createdAt: { $lt: threshold },
    });

    for (const doc of oldDocs) {
      try {
        await this.archive(doc.documentId, doc.enterprise_id);
      } catch (err) {
        this.logger.error(
          `Failed to archive ${doc.documentId}: ${err.message}`,
        );
      }
    }
  }

  /**
   * Cron: every 30 min – if hot bucket exceeds capacity, evict oldest files.
   */
  @Cron('*/30 * * * *')
  async handleEviction() {
    const capacityBytes = +this.configService.get<number>(
      'HOT_BUCKET_CAPACITY_BYTES',
    )!;
    const fillPct = +this.configService.get<number>('HOT_BUCKET_FILL_PCT')!;
    const thresholdCapacity = (capacityBytes * fillPct) / 100;

    let totalSize = await this.minio.getHotBucketTotalSize();
    this.logger.log(
      `Hot bucket usage: ${totalSize} bytes (${((totalSize / capacityBytes) * 100).toFixed(2)}%)`,
    );

    if (totalSize > thresholdCapacity) {
      this.logger.warn('Hot bucket over threshold, starting FIFO eviction...');

      const oldestDocs = await this.archiveModel
        .find({ location: 'HOT' })
        .sort({ createdAt: 1 }) // oldest first
        .exec();

      for (const doc of oldestDocs) {
        if (totalSize <= thresholdCapacity) break;
        try {
          await this.archive(doc.documentId, doc.enterprise_id);
          totalSize -= doc.size;
          this.logger.log(`Evicted ${doc.documentId} to cold storage`);
        } catch (err) {
          this.logger.error(
            `Eviction failed for ${doc.documentId}: ${err.message}`,
          );
        }
      }
    }
  }
}
