// src/documents/schemas/document.schema.ts
import { Schema } from 'mongoose';

export const DocumentSchema = new Schema(
  {
    documentId: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    type: { type: String, required: true },
    size: { type: Number, required: true },
    ownerId: { type: String, required: true, index: true },
    enterprise_id: { type: String, required: true, index: true },
    status: {
      type: String,
      enum: [
        'uploaded',
        'processing',     // changed from 'ocr_completed'
        'processed',      // final success state
        'failed',
        'reprocessing',   // when admin triggers retry
        'classified',
        'indexed',
        'archived',
      ],
      default: 'uploaded',
    },
    extractedText: { type: String, default: '' },
    metadata: { type: Object, default: {} },
    category: { type: String, default: 'uncategorized' },
    storagePath: { type: String },
    uploadedAt: { type: String, required: true },
    ocrCompletedAt: { type: String },
    classifiedAt: { type: String },
    indexedAt: { type: String },
    
    // Admin & reprocessing fields
    errorMessage: { type: String, default: '' },
    errorAt: { type: String, default: null },
    reprocessCount: { type: Number, default: 0 },
    lastReprocessedAt: { type: String, default: null },
  },
  {
    timestamps: true,
  },
);

DocumentSchema.index({ enterprise_id: 1, createdAt: -1 });
DocumentSchema.index({ status: 1 }); // for faster failed docs queries
