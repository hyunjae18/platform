import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ArchiveDocument } from '../schemas/archive.schema';
import { MinioProvider } from '../providers/minio.provider';

@Injectable()
export class ArchiveService {
  constructor(
    @InjectModel(ArchiveDocument.name)
    private model: Model<ArchiveDocument>,
    private minio: MinioProvider,
  ) {}

  async register(documentId: string, buffer: Buffer) {
    // Store new document in the hot bucket
    await this.minio.uploadToHot(documentId, buffer);
    return this.model.create({ documentId, location: 'HOT' });
  }

  async archive(documentId: string) {
    const doc = await this.model.findOne({ documentId });
    if (!doc) throw new NotFoundException();

    // Download from hot → upload to cold → delete hot
    const stream = await this.minio.download(
      this.minio.getHotBucket(),
      documentId,
    );
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(chunk);
    const buffer = Buffer.concat(chunks);

    await this.minio.uploadToCold(documentId, buffer);
    await this.minio.delete(this.minio.getHotBucket(), documentId);

    doc.location = 'COLD';
    doc.archivedAt = new Date();
    await doc.save();
  }

  async get(documentId: string) {
    const doc = await this.model.findOne({ documentId });
    if (!doc) throw new NotFoundException();

    const bucket =
      doc.location === 'HOT'
        ? this.minio.getHotBucket()
        : this.minio.getColdBucket();

    return this.minio.download(bucket, documentId);
  }
}
