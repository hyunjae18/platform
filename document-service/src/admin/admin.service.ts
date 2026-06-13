import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { isValidObjectId, Model } from 'mongoose';
import * as fs from 'fs';

@Injectable()
export class AdminService {
  constructor(
    @InjectModel('Document') private documentModel: Model<any>, // use string name
  ) {}

  async getDocumentStats() {
    const total = await this.documentModel.countDocuments();
    const processed = await this.documentModel.countDocuments({ status: 'processed' });
    const processing = await this.documentModel.countDocuments({ status: { $in: ['processing', 'reprocessing'] } });
    const failed = await this.documentModel.countDocuments({ status: 'failed' });
    const pending = await this.documentModel.countDocuments({ status: { $nin: ['processed', 'processing', 'reprocessing', 'failed'] } });
    const inPipeline = await this.documentModel.countDocuments({
      status: { $in: ['uploaded', 'processing', 'reprocessing'] },
    });
    const sizeAgg = await this.documentModel.aggregate([
      { $group: { _id: null, totalSize: { $sum: '$size' } } },
    ]);
    const totalSizeBytes = sizeAgg[0]?.totalSize || 0;

    return {
      totalDocuments: total,
      processedDocuments: processed,
      processingDocuments: processing,
      pendingDocuments: pending,
      failedDocuments: failed,
      inPipeline,
      totalSizeBytes,
    };
  }

  async getFailedDocuments() {
    const docs = await this.documentModel
      .find({ status: 'failed' })
      .sort({ uploadedAt: -1 })
      .limit(100)
      .select('documentId name status errorMessage errorAt reprocessCount uploadedAt enterprise_id ownerId')
      .lean()
      .exec();

    return docs.map((doc) => ({
      ...doc,
      id: String(doc._id),
      enterpriseId: doc.enterprise_id,
    }));
  }

  async reprocessDocument(id: string, userId: string) {
    const lookup = isValidObjectId(id) ? { _id: id } : { documentId: id };
    const doc = await this.documentModel.findOne(lookup);
    if (!doc) throw new NotFoundException('Document not found');
    if (doc.status !== 'failed') throw new BadRequestException('Only failed documents can be reprocessed');
    if (doc.reprocessCount >= 3) throw new BadRequestException('Maximum reprocess attempts (3) reached');

    doc.status = 'reprocessing';
    doc.reprocessCount += 1;
    doc.lastReprocessedAt = new Date().toISOString();
    doc.errorMessage = '';
    doc.errorAt = null;
    await doc.save();

    return {
      message: 'Reprocess queued',
      documentId: doc.documentId,
      reprocessCount: doc.reprocessCount,
    };
  }

  async getStorageInfo() {
    const mountPath = process.env.NAS_PATH || '/mnt/truenas/documents';
    let totalBytes = 400 * 1024 ** 3;
    let freeBytes = 240 * 1024 ** 3;
    let usedBytes = 160 * 1024 ** 3;

    try {
      const usage = fs.statfsSync(mountPath);
      totalBytes = usage.bsize * usage.blocks;
      freeBytes = usage.bsize * usage.bfree;
      usedBytes = totalBytes - freeBytes;
    } catch (error) {
      // fallback to mock values
    }

    const percentUsed = totalBytes > 0 ? (usedBytes / totalBytes) * 100 : 0;
    const documentBytes = await this.getTotalDocumentBytes();

    return {
      path: mountPath,
      totalBytes,
      freeBytes,
      usedBytes,
      usagePercent: Number(percentUsed.toFixed(1)),
      totalLabel: this.formatBytes(totalBytes),
      freeLabel: this.formatBytes(freeBytes),
      usedLabel: this.formatBytes(usedBytes),
      documentBytes,
      documentLabel: this.formatBytes(documentBytes),
    };
  }

  private async getTotalDocumentBytes(): Promise<number> {
    const agg = await this.documentModel.aggregate([
      { $group: { _id: null, total: { $sum: '$size' } } },
    ]);
    return agg[0]?.total || 0;
  }

  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
}
