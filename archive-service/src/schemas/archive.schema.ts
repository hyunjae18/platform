// src/schemas/archive.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type ArchiveDocumentType = ArchiveDocument & Document;

@Schema({ timestamps: true })
export class ArchiveDocument {
  @Prop({ required: true })
  documentId: string; // same as MinIO object key

  @Prop({ required: true, index: true })
  enterprise_id: string;

  @Prop({ required: true })
  fileHash: string; // SHA‑256 hex string

  @Prop({ required: true, enum: ['HOT', 'COLD'], default: 'HOT' })
  location: string;

  @Prop({ type: Date, default: null })
  archivedAt?: Date | null;

  @Prop({ required: true })
  size: number;

  @Prop({ required: true })
  fileName: string;
}

export const ArchiveSchema = SchemaFactory.createForClass(ArchiveDocument);
ArchiveSchema.index({ enterprise_id: 1, documentId: 1 }, { unique: true });
ArchiveSchema.index({ enterprise_id: 1, createdAt: -1 });
