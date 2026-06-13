import bcrypt from 'bcryptjs';
import cors from 'cors';
import { randomBytes, createHash } from 'crypto';
import dotenv from 'dotenv';
import express, { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import multer from 'multer';
import mongoose, { Schema, model } from 'mongoose';
import nodemailer from 'nodemailer';
import os from 'os';
import path from 'path';
import { promises as fs } from 'fs';
import { PythonShell } from 'python-shell';
import { createClient } from 'redis';
import { fileURLToPath } from 'url';

dotenv.config();

// Define __dirname and __filename for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT || 3001);
const JWT_SECRET = process.env.JWT_SECRET || 'docmind-secure-jwt-key-2024';
const REDIS_URL = process.env.REDIS_URL;
const STORAGE_ROOT = process.env.NAS_PATH || path.resolve(__dirname, '../../../../');
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/docmind_identity';
const API_GATEWAY_URL = (process.env.API_GATEWAY_URL || 'http://localhost:8001').replace(/\/$/, '');
const API_GATEWAY_API_URL = API_GATEWAY_URL.endsWith('/api') ? API_GATEWAY_URL : `${API_GATEWAY_URL}/api`;
const APP_BASE_URL = process.env.APP_BASE_URL || 'http://localhost:3000';
const EMAIL_WEBHOOK_URL = process.env.EMAIL_WEBHOOK_URL;
const EMAIL_FROM = process.env.EMAIL_FROM || 'noreply@docmind.local';
const SMTP_HOST = process.env.SMTP_HOST || 'smtp.gmail.com';
const SMTP_PORT = Number(process.env.SMTP_PORT || 465);
const SMTP_USER = process.env.SMTP_USER || process.env.EMAIL_USER || '';
const SMTP_PASS = process.env.SMTP_PASS || process.env.EMAIL_APP_PASSWORD || '';
const SUPPORT_INBOX_EMAIL = process.env.SUPPORT_INBOX_EMAIL || 'docmind2026@gmail.com';
const EMAIL_OUTBOX_PATH = path.join(__dirname, 'data', 'email-outbox.json');
const DEFAULT_ENTERPRISE_ID = process.env.DEFAULT_ENTERPRISE_ID || 'ENT_DEFAULT';
const MAX_REPROCESS_COUNT = Number(process.env.MAX_REPROCESS_COUNT || 3);
const REPROCESS_STRATEGY = (process.env.REPROCESS_STRATEGY || 'new_job') as 'new_job' | 'reuse_job';

type UserRole = 'admin' | 'member';
type RequestedRole = 'admin' | 'member';
type UserStatus = 'active' | 'invited' | 'disabled';
type ApprovalStatus = 'approved' | 'pending' | 'rejected';
type WorkflowStatus = 'idle' | 'running' | 'completed' | 'failed';
type DocumentStatus = 'uploaded' | 'processing' | 'failed' | 'reprocessing' | 'processed';

interface AuthenticatedRequest extends Request {
  user?: UserDocument;
}

interface UserDocument {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  role: UserRole;
  requestedRole: RequestedRole;
  status: UserStatus;
  approvalStatus: ApprovalStatus;
  enterpriseId: string;
  lastLoginAt: string | null;
  createdAt?: Date | string;
  updatedAt?: Date | string;
  avatar?: string;
}

interface PasswordResetTokenDocument {
  id: string;
  userId: string;
  email: string;
  tokenHash: string;
  expiresAt: Date;
  usedAt?: Date | null;
  createdAt?: Date | string;
  updatedAt?: Date | string;
}

interface WorkflowRunDocument {
  id: string;
  name: string;
  description: string;
  type: 'ocr' | 'review' | 'archive' | 'search';
  status: WorkflowStatus;
  steps: number;
  createdByUserId: string;
  lastRunAt?: string | null;
  createdAt?: Date | string;
  updatedAt?: Date | string;
}

interface DocumentRecord {
  id: string;
  documentId: string;
  name: string;
  type: string;
  size: string;
  sizeBytes: number;
  status: DocumentStatus;
  uploadedAt: string;
  category: string;
  ownerId: string;
  enterpriseId: string;
  extractedText?: string;
  checksum?: string;
  errorMessage?: string;
  errorAt?: string | null;
  errorUserId?: string;
  errorFileName?: string;
  reprocessCount?: number;
  originalJobId?: string | null;
  lastReprocessedAt?: string | null;
  createdAt?: Date | string;
  updatedAt?: Date | string;
}

interface NotificationDocument {
  id: string;
  userId: string;
  title: string;
  message: string;
  level: 'info' | 'success' | 'warning' | 'error';
  read: boolean;
  link?: string;
  createdAt?: Date | string;
  updatedAt?: Date | string;
}

interface SupportMessageDocument {
  id: string;
  userId?: string;
  name: string;
  email: string;
  subject: string;
  message: string;
  channel: 'form' | 'chat' | 'email';
  status: 'open' | 'answered';
  response?: string;
  createdAt?: Date | string;
  updatedAt?: Date | string;
}

interface EmailOutboxItem {
  id: string;
  to: string;
  from: string;
  subject: string;
  text: string;
  html?: string;
  resetUrl?: string;
  createdAt: string;
}

const redisClient = createClient({
  ...(REDIS_URL ? { url: REDIS_URL } : {}),
  socket: {
    reconnectStrategy: false,
  },
});

const userSchema = new Schema<UserDocument>(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ['admin', 'member'], default: 'member' },
    requestedRole: { type: String, enum: ['admin', 'member'], default: 'member' },
    status: { type: String, enum: ['active', 'invited', 'disabled'], default: 'active' },
    approvalStatus: { type: String, enum: ['approved', 'pending', 'rejected'], default: 'approved' },
    enterpriseId: { type: String, required: true, default: DEFAULT_ENTERPRISE_ID, index: true },
    lastLoginAt: { type: String, default: null },
    avatar: { type: String, required: false },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

const passwordResetTokenSchema = new Schema<PasswordResetTokenDocument>(
  {
    userId: { type: String, required: true, index: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    tokenHash: { type: String, required: true, unique: true },
    expiresAt: { type: Date, required: true, index: true },
    usedAt: { type: Date, default: null },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

const workflowRunSchema = new Schema<WorkflowRunDocument>(
  {
    id: { type: String, required: true, unique: true },
    name: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    type: { type: String, enum: ['ocr', 'review', 'archive', 'search'], required: true },
    status: { type: String, enum: ['idle', 'running', 'completed', 'failed'], default: 'idle' },
    steps: { type: Number, required: true, min: 1 },
    createdByUserId: { type: String, required: true, index: true },
    lastRunAt: { type: String, default: null },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

const documentSchema = new Schema<DocumentRecord>(
  {
    id: { type: String, required: true, unique: true },
    documentId: { type: String, required: true, unique: true },
    name: { type: String, required: true, trim: true },
    type: { type: String, required: true },
    size: { type: String, required: true },
    sizeBytes: { type: Number, required: true },
    status: { type: String, enum: ['uploaded', 'processing', 'failed', 'reprocessing', 'processed'], default: 'processing' },
    uploadedAt: { type: String, required: true },
    category: { type: String, required: true },
    ownerId: { type: String, required: true, index: true },
    enterpriseId: { type: String, required: true, default: DEFAULT_ENTERPRISE_ID, index: true },
    extractedText: { type: String, default: '' },
    checksum: { type: String, default: '' },
    errorMessage: { type: String, default: '' },
    errorAt: { type: String, default: null },
    errorUserId: { type: String, default: '' },
    errorFileName: { type: String, default: '' },
    reprocessCount: { type: Number, default: 0 },
    originalJobId: { type: String, default: null, index: true },
    lastReprocessedAt: { type: String, default: null },
  },
  {
    timestamps: true,
    versionKey: false,
    collection: 'documents_local',
  },
);

const notificationSchema = new Schema<NotificationDocument>(
  {
    id: { type: String, required: true, unique: true },
    userId: { type: String, required: true, index: true },
    title: { type: String, required: true, trim: true },
    message: { type: String, required: true, trim: true },
    level: { type: String, enum: ['info', 'success', 'warning', 'error'], default: 'info' },
    read: { type: Boolean, default: false },
    link: { type: String, default: '' },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

const supportMessageSchema = new Schema<SupportMessageDocument>(
  {
    id: { type: String, required: true, unique: true },
    userId: { type: String, required: false, index: true },
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, trim: true, lowercase: true },
    subject: { type: String, required: true, trim: true },
    message: { type: String, required: true, trim: true },
    channel: { type: String, enum: ['form', 'chat', 'email'], default: 'form' },
    status: { type: String, enum: ['open', 'answered'], default: 'open' },
    response: { type: String, default: '' },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

const UserModel =
  (mongoose.models.User as mongoose.Model<UserDocument>) || model<UserDocument>('User', userSchema);
const PasswordResetTokenModel =
  (mongoose.models.PasswordResetToken as mongoose.Model<PasswordResetTokenDocument>) ||
  model<PasswordResetTokenDocument>('PasswordResetToken', passwordResetTokenSchema);
const WorkflowRunModel =
  (mongoose.models.WorkflowRun as mongoose.Model<WorkflowRunDocument>) ||
  model<WorkflowRunDocument>('WorkflowRun', workflowRunSchema);
const DocumentModel =
  (mongoose.models.DocumentLocal as mongoose.Model<DocumentRecord>) ||
  model<DocumentRecord>('DocumentLocal', documentSchema);
const NotificationModel =
  (mongoose.models.Notification as mongoose.Model<NotificationDocument>) ||
  model<NotificationDocument>('Notification', notificationSchema);
const SupportMessageModel =
  (mongoose.models.SupportMessage as mongoose.Model<SupportMessageDocument>) ||
  model<SupportMessageDocument>('SupportMessage', supportMessageSchema);

let redisReady = false;
const upload = multer({ storage: multer.memoryStorage() });

app.use(cors());
app.use(express.json({ limit: '10mb' }));

redisClient.on('ready', () => {
  redisReady = true;
  console.log('Connected to Redis');
});

redisClient.on('end', () => {
  redisReady = false;
});

redisClient.on('error', (err: unknown) => {
  redisReady = false;
  console.log('Redis unavailable', err);
});

void redisClient.connect().catch(() => {
  console.log('Redis cache disabled');
});

const createId = (prefix: string) =>
  `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

const formatBytes = (value: number) => {
  if (value < 1024) {
    return `${value} B`;
  }

  const units = ['KB', 'MB', 'GB', 'TB'];
  let size = value / 1024;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }

  return `${size.toFixed(size >= 10 ? 0 : 1)} ${units[unitIndex]}`;
};

const categoryFromFile = (filename: string) => {
  const lower = filename.toLowerCase();
  if (lower.includes('invoice')) return 'Invoice';
  if (lower.includes('contract')) return 'Contract';
  if (lower.includes('report')) return 'Report';
  if (lower.includes('note')) return 'Notes';
  return 'General';
};

const normalizeDate = (value?: Date | string | null) => {
  if (!value) {
    return null;
  }

  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

const sanitizeUser = (user: UserDocument) => ({
  id: String((user as unknown as { _id?: unknown; id?: unknown }).id || (user as unknown as { _id?: unknown })._id),
  name: user.name,
  email: user.email,
  role: user.role,
  requestedRole: user.requestedRole,
  status: user.status,
  approvalStatus: user.approvalStatus,
  lastLoginAt: user.lastLoginAt,
  createdAt: normalizeDate(user.createdAt),
  updatedAt: normalizeDate(user.updatedAt),
  avatar: user.avatar,
  enterpriseId: user.enterpriseId,
});

const sanitizeWorkflow = (workflow: WorkflowRunDocument) => ({
  id: workflow.id,
  name: workflow.name,
  description: workflow.description,
  type: workflow.type,
  status: workflow.status,
  steps: workflow.steps,
  createdByUserId: workflow.createdByUserId,
  lastRunAt: workflow.lastRunAt || null,
  createdAt: normalizeDate(workflow.createdAt),
  updatedAt: normalizeDate(workflow.updatedAt),
});

const sanitizeDocument = (doc: DocumentRecord) => ({
  id: doc.id,
  documentId: doc.documentId,
  name: doc.name,
  type: doc.type,
  size: doc.size,
  sizeBytes: doc.sizeBytes,
  status: doc.status,
  uploadedAt: doc.uploadedAt,
  category: doc.category,
  ownerId: doc.ownerId,
  extractedText: doc.extractedText || '',
  createdAt: normalizeDate(doc.createdAt),
  updatedAt: normalizeDate(doc.updatedAt),
});

const sanitizeNotification = (notification: NotificationDocument) => ({
  id: notification.id,
  userId: notification.userId,
  title: notification.title,
  message: notification.message,
  level: notification.level,
  read: notification.read,
  link: notification.link || '',
  createdAt: normalizeDate(notification.createdAt),
  updatedAt: normalizeDate(notification.updatedAt),
});

const addNotification = async (payload: {
  userId: string;
  title: string;
  message: string;
  level?: 'info' | 'success' | 'warning' | 'error';
  link?: string;
}) => {
  return NotificationModel.create({
    id: createId('notif'),
    userId: payload.userId,
    title: payload.title,
    message: payload.message,
    level: payload.level || 'info',
    read: false,
    link: payload.link || '',
  });
};

const issueToken = (user: UserDocument) =>
  jwt.sign(
    { sub: String(user.id), role: user.role, email: user.email, enterpriseId: user.enterpriseId },
    JWT_SECRET,
    { expiresIn: '12h' }
  );

const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

const ensureOutboxFile = async () => {
  await fs.mkdir(path.dirname(EMAIL_OUTBOX_PATH), { recursive: true });

  try {
    await fs.access(EMAIL_OUTBOX_PATH);
  } catch {
    await fs.writeFile(EMAIL_OUTBOX_PATH, '[]', 'utf8');
  }
};

const appendEmailOutbox = async (item: EmailOutboxItem) => {
  await ensureOutboxFile();
  const raw = await fs.readFile(EMAIL_OUTBOX_PATH, 'utf8');
  const items = JSON.parse(raw) as EmailOutboxItem[];
  items.unshift(item);
  await fs.writeFile(EMAIL_OUTBOX_PATH, JSON.stringify(items.slice(0, 50), null, 2), 'utf8');
};

const sendEmailNotification = async (payload: {
  to: string;
  subject: string;
  text: string;
  html?: string;
  resetUrl?: string;
  replyTo?: string;
}) => {
  const emailItem: EmailOutboxItem = {
    id: createId('email'),
    from: EMAIL_FROM,
    to: payload.to,
    subject: payload.subject,
    text: payload.text,
    html: payload.html,
    resetUrl: payload.resetUrl,
    createdAt: new Date().toISOString(),
  };

  if (SMTP_USER && SMTP_PASS) {
    try {
      const transporter = nodemailer.createTransport({
        host: SMTP_HOST,
        port: SMTP_PORT,
        secure: SMTP_PORT === 465,
        auth: {
          user: SMTP_USER,
          pass: SMTP_PASS,
        },
      });

      await transporter.sendMail({
        from: EMAIL_FROM || SMTP_USER,
        to: payload.to,
        replyTo: payload.replyTo,
        subject: payload.subject,
        text: payload.text,
        html: payload.html,
      });
      return emailItem;
    } catch (error) {
      console.warn('SMTP email failed, falling back to webhook/outbox', error);
    }
  }

  if (EMAIL_WEBHOOK_URL) {
    try {
      const response = await fetch(EMAIL_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(emailItem),
      });

      if (!response.ok) {
        throw new Error(`Email webhook returned ${response.status}`);
      }
    } catch (error) {
      console.warn('Email webhook failed, falling back to local outbox', error);
      await appendEmailOutbox(emailItem);
    }
  } else {
    await appendEmailOutbox(emailItem);
  }

  return emailItem;
};

const runPythonNLP = (text: string): Promise<unknown> =>
  new Promise((resolve, reject) => {
    const options = {
      mode: 'json' as const,
      pythonOptions: ['-u'],
      scriptPath: path.join(__dirname, '../'),
      args: [text],
    };

    PythonShell.run('nlp_engine.py', options, (err, results) => {
      if (err) {
        reject(err);
        return;
      }

      if (results && results.length > 0) {
        resolve(results[0]);
        return;
      }

      reject(new Error('No results from Python'));
    });
  });

const asyncHandler =
  (handler: (req: Request, res: Response, next: NextFunction) => Promise<void>) =>
  (req: Request, res: Response, next: NextFunction) => {
    void handler(req, res, next).catch(next);
  };

const requireAuth = asyncHandler(async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ message: 'Authentication required' });
    return;
  }

  try {
    const token = authHeader.slice('Bearer '.length);
    const payload = jwt.verify(token, JWT_SECRET) as { sub: string };
    const user = await UserModel.findById(payload.sub);

    if (!user) {
      res.status(401).json({ message: 'User no longer exists' });
      return;
    }

    (req as AuthenticatedRequest).user = user;
    next();
  } catch {
    res.status(401).json({ message: 'Invalid token' });
  }
});

const requireAdmin = (req: Request, res: Response, next: NextFunction) => {
  const user = (req as AuthenticatedRequest).user;

  if (!user || user.role !== 'admin') {
    res.status(403).json({ message: 'Admin access required' });
    return;
  }

  next();
};

const fetchDocumentsFromService = async (user?: UserDocument, authorization?: string) => {
  const headers: Record<string, string> = {};
  if (user) {
    headers['x-user-id'] = String(user.id);
    headers['x-user-role'] = user.role;
    headers['x-user-email'] = user.email;
    headers['x-enterprise-id'] = user.enterpriseId;
  }
  if (authorization) {
    headers.authorization = authorization;
  }

  try {
    const response = await fetch(`${API_GATEWAY_API_URL}/documents`, { headers });
    if (!response.ok) {
      throw new Error(`API Gateway returned ${response.status}`);
    }
    return (await response.json()) as Array<Record<string, unknown>>;
  } catch (error) {
    console.warn('API Gateway document list failed, falling back to local store', error);
    return getLocalDocuments(user);
  }
};

const validateUploadedFile = (file: Express.Multer.File): string | null => {
  // 1. Size guard
  if (file.size === 0) return 'File is empty (0 bytes)';
  if (file.size > 50 * 1024 * 1024) return 'File exceeds 50 MB limit';

  // 2. Magic-byte check for PDF
  if (file.originalname.toLowerCase().endsWith('.pdf')) {
    const header = file.buffer.slice(0, 5).toString('ascii');
    if (header !== '%PDF-') return 'File does not appear to be a valid PDF (bad magic bytes)';
  }

  // 3. MIME type sanity
  const allowed = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'text/plain'];
  if (!allowed.includes(file.mimetype)) {
    return `Unsupported file type: ${file.mimetype}`;
  }

  return null; // valid
};

const createLocalDocument = async (
  file: Express.Multer.File,
  ownerId: string,
  enterpriseId: string,
) => {
  const extension = path.extname(file.originalname).slice(1).toUpperCase() || 'FILE';
  const now = new Date().toISOString();

  const validationError = validateUploadedFile(file);

  if (validationError) {
    // Save a FAILED record so the admin can reprocess later
    const failedDoc = await DocumentModel.create({
      id: createId('doc'),
      documentId: createId('docsvc'),
      name: file.originalname,
      type: extension,
      size: formatBytes(file.size),
      sizeBytes: file.size,
      status: 'failed',
      uploadedAt: now,
      category: categoryFromFile(file.originalname),
      ownerId,
      enterpriseId,
      errorMessage: validationError,
      errorAt: now,
      errorUserId: ownerId,
      errorFileName: file.originalname,
      reprocessCount: 0,
    });

    await addNotification({
      userId: ownerId,
      title: 'Upload failed',
      message: `"${file.originalname}" could not be processed: ${validationError}`,
      level: 'error',
      link: '/dashboard',
    });

    return { ...sanitizeDocument(failedDoc), _failed: true };
  }

  const localDocument = await DocumentModel.create({
    id: createId('doc'),
    documentId: createId('docsvc'),
    name: file.originalname,
    type: extension,
    size: formatBytes(file.size),
    sizeBytes: file.size,
    status: 'processed',
    uploadedAt: now,
    category: categoryFromFile(file.originalname),
    ownerId,
    enterpriseId,
    extractedText: file.buffer.toString('utf8'),
  });

  const safeDocument = sanitizeDocument(localDocument);
  await addNotification({
    userId: ownerId,
    title: 'Document uploaded',
    message: `${safeDocument.name} was saved and classified as ${safeDocument.category}.`,
    level: 'success',
    link: '/dashboard',
  });

  return safeDocument;
};

const getLocalDocuments = async (user?: UserDocument) => {
  const filter = user && user.role !== 'admin' ? { ownerId: String(user.id) } : {};
  const docs = await DocumentModel.find(filter).sort({ uploadedAt: -1 });
  return docs.map((doc) => sanitizeDocument(doc));
};

const getDocumentStats = async (authorization?: string) => {
  const headers: Record<string, string> = {};
  if (authorization) {
    headers.authorization = authorization;
  }

  try {
    const response = await fetch(`${API_GATEWAY_API_URL}/admin/documents/stats`, { headers });
    if (!response.ok) {
      throw new Error(`API Gateway returned ${response.status}`);
    }

    return (await response.json()) as {
      totalDocuments: number;
      processedDocuments: number;
      processingDocuments: number;
      pendingDocuments?: number;
      failedDocuments: number;
      totalSizeBytes: number;
    };
  } catch (error) {
    console.warn('Could not reach API Gateway document stats, falling back to local store', error);
    const [totalDocuments, processedDocuments, processingDocuments, pendingDocuments, failedDocuments, sizeAggregation] =
      await Promise.all([
        DocumentModel.countDocuments(),
        DocumentModel.countDocuments({ status: 'processed' }),
        DocumentModel.countDocuments({ status: { $in: ['processing', 'reprocessing'] } }),
        DocumentModel.countDocuments({ status: { $nin: ['processed', 'processing', 'reprocessing', 'failed'] } }),
        DocumentModel.countDocuments({ status: 'failed' }),
        DocumentModel.aggregate([{ $group: { _id: null, totalSize: { $sum: '$sizeBytes' } } }]),
      ]);

    return {
      totalDocuments,
      processedDocuments,
      processingDocuments,
      pendingDocuments,
      failedDocuments,
      totalSizeBytes: sizeAggregation?.[0]?.totalSize ?? 0,
    };
  }
};

const ensureSeedAdmin = async () => {
  const adminEmail = (process.env.ADMIN_EMAIL || 'admin@docmind.local').toLowerCase();
  const existingAdmin = await UserModel.findOne({ email: adminEmail });

  if (!existingAdmin) {
    const passwordHash = await bcrypt.hash(process.env.ADMIN_PASSWORD || 'Admin123!', 10);

    await UserModel.create({
      name: 'System Admin',
      email: adminEmail,
      passwordHash,
      role: 'admin',
      requestedRole: 'admin',
      status: 'active',
      approvalStatus: 'approved',
      lastLoginAt: null,
    });

    await UserModel.create({
      name: 'Operations Lead',
      email: 'ops@docmind.local',
      passwordHash: await bcrypt.hash('OpsLead123!', 10),
      role: 'member',
      requestedRole: 'member',
      status: 'active',
      approvalStatus: 'approved',
      lastLoginAt: null,
    });
  }
};

const ensureSeedWorkflows = async () => {
  const count = await WorkflowRunModel.countDocuments();
  if (count > 0) {
    return;
  }

  const firstUser = await UserModel.findOne().sort({ createdAt: 1 });
  if (!firstUser) {
    return;
  }

  await WorkflowRunModel.insertMany([
    {
      id: createId('wf'),
      name: 'OCR Intake Pipeline',
      description: 'Uploads, OCR, metadata extraction, and queue dispatch.',
      type: 'ocr',
      status: 'completed',
      steps: 4,
      createdByUserId: String(firstUser.id),
      lastRunAt: new Date().toISOString(),
    },
    {
      id: createId('wf'),
      name: 'Semantic Review',
      description: 'Pushes extracted content toward the vector search pipeline.',
      type: 'search',
      status: 'idle',
      steps: 3,
      createdByUserId: String(firstUser.id),
      lastRunAt: null,
    },
  ]);
};

// Root health check endpoint
app.get('/', (_req, res) => {
  res.json({
    status: 'ok',
    message: 'DocMind API server is running',
    version: '1.0.0',
  });
});

app.get(
  '/api/health',
  asyncHandler(async (req, res) => {
    let apiGateway = 'unavailable';

    try {
      const response = await fetch(`${API_GATEWAY_URL}/health`, { method: 'GET' });
      if (response.ok) {
        apiGateway = 'connected';
      }
    } catch {
      apiGateway = 'unavailable';
    }

    res.json({
      status: 'ok',
      redis: redisReady ? 'connected' : 'degraded',
      mongo: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
      apiGateway,
      hostname: os.hostname(),
      uptimeSeconds: Math.round(process.uptime()),
    });
  }),
);

app.post(
  '/api/auth/register',
  asyncHandler(async (req, res) => {
    const { name, email, password, requestedRole, enterpriseId } = req.body as {
      name?: string;
      email?: string;
      password?: string;
      requestedRole?: RequestedRole;
      enterpriseId?: string;
    };

    if (!name || !email || !password) {
      res.status(400).json({ message: 'Name, email, and password are required' });
      return;
    }

    const normalizedEmail = email.trim().toLowerCase();
    const existing = await UserModel.findOne({ email: normalizedEmail });

    if (existing) {
      res.status(409).json({ message: 'Email already exists' });
      return;
    }

    const wantsAdmin = requestedRole === 'admin';
    const user = await UserModel.create({
      name: name.trim(),
      email: normalizedEmail,
      passwordHash: await bcrypt.hash(password, 10),
      role: 'member',
      requestedRole: wantsAdmin ? 'admin' : 'member',
      status: wantsAdmin ? 'invited' : 'active',
      approvalStatus: wantsAdmin ? 'pending' : 'approved',
      lastLoginAt: wantsAdmin ? null : new Date().toISOString(),
      enterpriseId: enterpriseId || DEFAULT_ENTERPRISE_ID,
    });

    if (wantsAdmin) {
      res.status(201).json({
        requiresApproval: true,
        message: 'Admin account request submitted. An existing admin must approve it before sign-in.',
        user: sanitizeUser(user),
      });
      return;
    }

    res.status(201).json({
      requiresApproval: false,
      token: issueToken(user),
      user: sanitizeUser(user),
    });
  }),
);

app.post(
  '/api/auth/login',
  asyncHandler(async (req, res) => {
    const { email, password } = req.body as { email?: string; password?: string };

    if (!email || !password) {
      res.status(400).json({ message: 'Email and password are required' });
      return;
    }

    const normalizedEmail = email.trim().toLowerCase();
    const user = await UserModel.findOne({ email: normalizedEmail });

    if (!user) {
      res.status(401).json({ message: 'Invalid credentials' });
      return;
    }

    const isValid = await bcrypt.compare(password, user.passwordHash);
    if (!isValid) {
      res.status(401).json({ message: 'Invalid credentials' });
      return;
    }

    if (user.approvalStatus === 'pending') {
      res.status(403).json({ message: 'This account is pending admin approval.' });
      return;
    }

    if (user.approvalStatus === 'rejected') {
      res.status(403).json({ message: 'This account request was rejected by an admin.' });
      return;
    }

    if (user.status !== 'active') {
      res.status(403).json({ message: 'This account is not active.' });
      return;
    }

    user.lastLoginAt = new Date().toISOString();
    await (user as mongoose.Document & UserDocument).save();

    res.json({
      token: issueToken(user),
      user: sanitizeUser(user),
    });
  }),
);

app.get(
  '/api/auth/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    res.json(sanitizeUser((req as AuthenticatedRequest).user!));
  }),
);

app.get(
  '/api/auth/validate',
  requireAuth,
  asyncHandler(async (req, res) => {
    res.json({ user: sanitizeUser((req as AuthenticatedRequest).user!) });
  }),
);

app.get(
  '/api/notifications',
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = (req as AuthenticatedRequest).user!;
    const notifications = await NotificationModel.find({ userId: String(user.id) }).sort({ createdAt: -1 }).limit(20);
    res.json(notifications.map((item) => sanitizeNotification(item)));
  }),
);

app.post(
  '/api/notifications/:id/read',
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = (req as AuthenticatedRequest).user!;
    const notification = await NotificationModel.findOne({
      id: req.params.id,
      userId: String(user.id),
    });

    if (!notification) {
      res.status(404).json({ message: 'Notification not found' });
      return;
    }

    notification.read = true;
    await (notification as mongoose.Document & NotificationDocument).save();
    res.json(sanitizeNotification(notification));
  }),
);

app.get(
  '/api/documents',
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = (req as AuthenticatedRequest).user!;

    try {
      const serviceDocs = await fetchDocumentsFromService(user, req.headers.authorization);
      res.json(serviceDocs);
    } catch (error) {
      console.warn('Falling back to local document store for listing', error);
      res.json(await getLocalDocuments(user));
    }
  }),
);

app.post(
  '/api/documents/upload',
  requireAuth,
  upload.single('file'),
  asyncHandler(async (req, res) => {
    const user = (req as AuthenticatedRequest).user!;

    if (!req.file) {
      res.status(400).json({ message: 'File is required' });
      return;
    }

    try {
      const formData = new FormData();
      const fileBytes = new Uint8Array(req.file.buffer);
      const blob = new Blob([fileBytes], { type: req.file.mimetype });
      formData.append('file', blob, req.file.originalname);

      const headers: Record<string, string> = {
        'x-user-id': String(user.id),
        'x-user-role': user.role,
        'x-user-email': user.email,
        'x-enterprise-id': user.enterpriseId,
      };
      if (req.headers.authorization) {
        headers.authorization = req.headers.authorization;
      }

      const response = await fetch(`${API_GATEWAY_API_URL}/documents/upload`, {
        method: 'POST',
        headers,
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`API Gateway upload returned ${response.status}`)
      }

      const data = await response.json();
      res.status(201).json(data);
    } catch (error) {
      console.warn('Falling back to local document store for upload', error);
      const localDocument = await createLocalDocument(req.file, String(user.id), user.enterpriseId);
      res.status(201).json(localDocument);
    }
  }),
);

app.post(
  '/api/auth/request-password-reset',
  asyncHandler(async (req, res) => {
    const { email } = req.body as { email?: string };

    if (!email) {
      res.status(400).json({ message: 'Email is required' });
      return;
    }

    const normalizedEmail = email.trim().toLowerCase();
    const user = await UserModel.findOne({ email: normalizedEmail });

    if (!user) {
      res.json({
        message: 'If the account exists, a password reset message has been prepared.',
      });
      return;
    }

    await PasswordResetTokenModel.updateMany(
      { userId: String(user.id), usedAt: null },
      { $set: { usedAt: new Date() } },
    );

    const rawToken = randomBytes(32).toString('hex');
    const tokenHash = hashToken(rawToken);
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

    await PasswordResetTokenModel.create({
      userId: String(user.id),
      email: normalizedEmail,
      tokenHash,
      expiresAt,
      usedAt: null,
    });

    const resetUrl = `${APP_BASE_URL}/reset-password?token=${rawToken}`;
    const emailRecord = await sendEmailNotification({
      to: normalizedEmail,
      subject: 'DocMind password reset',
      text: `Hello ${user.name}, use this link to reset your password: ${resetUrl}`,
      html: `<p>Hello ${user.name},</p><p>Use this link to reset your password:</p><p><a href="${resetUrl}">${resetUrl}</a></p>`,
      resetUrl,
    });

    res.json({
      message: 'Password reset instructions have been generated.',
      delivery: EMAIL_WEBHOOK_URL ? 'webhook' : 'local-outbox',
      previewPath: EMAIL_WEBHOOK_URL ? null : EMAIL_OUTBOX_PATH,
      emailId: emailRecord.id,
    });
  }),
);

app.post(
  '/api/auth/reset-password',
  asyncHandler(async (req, res) => {
    const { token, password } = req.body as { token?: string; password?: string };

    if (!token || !password) {
      res.status(400).json({ message: 'Token and password are required' });
      return;
    }

    const tokenHash = hashToken(token);
    const resetRecord = await PasswordResetTokenModel.findOne({
      tokenHash,
      usedAt: null,
      expiresAt: { $gt: new Date() },
    });

    if (!resetRecord) {
      res.status(400).json({ message: 'This reset link is invalid or expired.' });
      return;
    }

    const user = await UserModel.findById(resetRecord.userId);
    if (!user) {
      res.status(404).json({ message: 'User not found' });
      return;
    }

    user.passwordHash = await bcrypt.hash(password, 10);
    user.status = 'active';
    await (user as mongoose.Document & UserDocument).save();

    resetRecord.usedAt = new Date();
    await (resetRecord as mongoose.Document & PasswordResetTokenDocument).save();

    res.json({ message: 'Password updated successfully.' });
  }),
);

app.get(
  '/api/profile',
  requireAuth,
  asyncHandler(async (req, res) => {
    res.json(sanitizeUser((req as AuthenticatedRequest).user!));
  }),
);

app.put(
  '/api/profile',
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = (req as AuthenticatedRequest).user!;
    const { name, avatar } = req.body as { name?: string; avatar?: string };

    if (name) {
      user.name = name.trim();
    }

    if (typeof avatar === 'string') {
      user.avatar = avatar.trim();
    }

    await (user as mongoose.Document & UserDocument).save();
    res.json(sanitizeUser(user));
  }),
);

app.post(
  '/api/support/messages',
  asyncHandler(async (req, res) => {
    const { name, email, subject, message, channel = 'form', userId } = req.body as {
      name?: string;
      email?: string;
      subject?: string;
      message?: string;
      channel?: 'form' | 'chat' | 'email';
      userId?: string;
    };

    if (!name || !email || !subject || !message) {
      res.status(400).json({ message: 'Name, email, subject, and message are required.' });
      return;
    }

    const entry = await SupportMessageModel.create({
      id: createId('support'),
      userId,
      name: name.trim(),
      email: email.trim().toLowerCase(),
      subject: subject.trim(),
      message: message.trim(),
      channel,
      status: 'open',
      response: 'Support request recorded. An admin will reply manually by email.',
    });

    const adminUsers = await UserModel.find({ role: 'admin' });
    await Promise.all(
      adminUsers.map((adminUser) =>
        addNotification({
          userId: String(adminUser.id),
          title: 'New support request',
          message: `${entry.name} sent: ${entry.subject}`,
          level: 'warning',
          link: '/admin',
        }),
      ),
    );

    if (userId) {
      await addNotification({
        userId,
        title: 'Support request sent',
        message: `We received "${entry.subject}" and added it to the support queue.`,
        level: 'info',
        link: '/support',
      });
    }

    await sendEmailNotification({
      to: SUPPORT_INBOX_EMAIL,
      subject: `DocMind support request: ${entry.subject}`,
      text: `From: ${entry.name} <${entry.email}>\n\n${entry.message}`,
      html: `<p><strong>From:</strong> ${entry.name} &lt;${entry.email}&gt;</p><p>${entry.message}</p>`,
      replyTo: entry.email,
    });

    res.status(201).json({
      id: entry.id,
      response: entry.response,
      status: entry.status,
    });
  }),
);

app.get(
  '/api/support/messages',
  requireAuth,
  requireAdmin,
  asyncHandler(async (_req, res) => {
    const messages = await SupportMessageModel.find().sort({ createdAt: -1 }).limit(50);
    res.json(messages);
  }),
);

app.get(
  '/api/workflows',
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = (req as AuthenticatedRequest).user!;
    const filter = user.role === 'admin' ? {} : { createdByUserId: String(user.id) };
    const workflows = await WorkflowRunModel.find(filter).sort({ updatedAt: -1 });
    res.json(workflows.map((workflow) => sanitizeWorkflow(workflow)));
  }),
);

app.post(
  '/api/workflows',
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = (req as AuthenticatedRequest).user!;
    const { name, description, type, steps } = req.body as {
      name?: string;
      description?: string;
      type?: 'ocr' | 'review' | 'archive' | 'search';
      steps?: number;
    };

    if (!name || !type || !steps) {
      res.status(400).json({ message: 'Name, type, and steps are required' });
      return;
    }

    const workflow = await WorkflowRunModel.create({
      id: createId('wf'),
      name: name.trim(),
      description: description?.trim() || '',
      type,
      steps,
      status: 'idle',
      createdByUserId: String(user.id),
      lastRunAt: null,
    });

    res.status(201).json(sanitizeWorkflow(workflow));
  }),
);

app.post(
  '/api/workflows/:id/run',
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = (req as AuthenticatedRequest).user!;
    const workflow = await WorkflowRunModel.findOne({
      id: req.params.id,
      ...(user.role === 'admin' ? {} : { createdByUserId: String(user.id) }),
    });

    if (!workflow) {
      res.status(404).json({ message: 'Workflow not found' });
      return;
    }

    workflow.status = 'completed';
    workflow.lastRunAt = new Date().toISOString();
    await (workflow as mongoose.Document & WorkflowRunDocument).save();
    await addNotification({
      userId: String(user.id),
      title: 'Workflow completed',
      message: `${workflow.name} finished successfully.`,
      level: 'success',
      link: '/workflows',
    });

    res.json({
      message: `${workflow.name} ran successfully.`,
      workflow: sanitizeWorkflow(workflow),
    });
  }),
);

app.get(
  '/api/admin/stats',
  requireAuth,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const [
      totalUsers,
      activeUsers,
      disabledUsers,
      adminUsers,
      pendingApprovals,
      workflowCount,
      workflowRunsToday,
      documentStats,
    ] = await Promise.all([
      UserModel.countDocuments(),
      UserModel.countDocuments({ status: 'active' }),
      UserModel.countDocuments({ status: 'disabled' }),
      UserModel.countDocuments({ role: 'admin' }),
      UserModel.countDocuments({ approvalStatus: 'pending' }),
      WorkflowRunModel.countDocuments(),
      WorkflowRunModel.countDocuments({
        lastRunAt: { $gte: new Date(new Date().setHours(0, 0, 0, 0)).toISOString() },
      }),
      getDocumentStats(req.headers.authorization),
    ]);

    const nasStats = await fs.statfs(STORAGE_ROOT);
    const totalBytes = nasStats.bsize * nasStats.blocks;
    const freeBytes = nasStats.bsize * nasStats.bfree;
    const usedBytes = totalBytes - freeBytes;

    res.json({
      generatedAt: new Date().toISOString(),
      overview: {
        totalUsers,
        activeUsers,
        disabledUsers,
        adminUsers,
        pendingApprovals,
        totalDocuments: documentStats.totalDocuments,
        processedDocuments: documentStats.processedDocuments,
        processingDocuments: documentStats.processingDocuments,
        pendingDocuments: documentStats.pendingDocuments ?? 0,
        failedDocuments: documentStats.failedDocuments,
        workflowCount,
        workflowRunsToday,
      },
      storage: {
        path: STORAGE_ROOT,
        totalBytes,
        freeBytes,
        usedBytes,
        usagePercent: totalBytes > 0 ? Number(((usedBytes / totalBytes) * 100).toFixed(1)) : 0,
        documentBytes: documentStats.totalSizeBytes,
        totalLabel: formatBytes(totalBytes),
        freeLabel: formatBytes(freeBytes),
        usedLabel: formatBytes(usedBytes),
        documentLabel: formatBytes(documentStats.totalSizeBytes),
      },
      services: [
        { name: 'API', status: 'online', detail: `Node ${process.version}` },
        { name: 'MongoDB', status: mongoose.connection.readyState === 1 ? 'online' : 'degraded', detail: MONGODB_URI },
        { name: 'API Gateway', status: documentStats.totalDocuments >= 0 ? 'online' : 'degraded', detail: API_GATEWAY_URL },
        { name: 'Redis Cache', status: redisReady ? 'online' : 'degraded', detail: redisReady ? 'Connected' : 'Unavailable' },
        { name: 'NLP Engine', status: 'online', detail: 'Python shell ready' },
        { name: 'Storage', status: 'online', detail: STORAGE_ROOT },
      ],
    });
  }),
);

app.get(
  '/api/admin/users',
  requireAuth,
  requireAdmin,
  asyncHandler(async (_req, res) => {
    const users = await UserModel.find().sort({ createdAt: -1 });
    res.json(users.map((user) => sanitizeUser(user)));
  }),
);

app.post(
  '/api/admin/users',
  requireAuth,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { name, email, password, role, status } = req.body as {
      name?: string;
      email?: string;
      password?: string;
      role?: UserRole;
      status?: UserStatus;
    };

    if (!name || !email || !password) {
      res.status(400).json({ message: 'Name, email, and password are required' });
      return;
    }

    const normalizedEmail = email.trim().toLowerCase();
    const existing = await UserModel.findOne({ email: normalizedEmail });

    if (existing) {
      res.status(409).json({ message: 'Email already exists' });
      return;
    }

    const safeRole = role === 'admin' ? 'admin' : 'member';
    const safeStatus = status === 'disabled' || status === 'invited' ? status : 'active';

    const user = await UserModel.create({
      name: name.trim(),
      email: normalizedEmail,
      passwordHash: await bcrypt.hash(password, 10),
      role: safeRole,
      requestedRole: safeRole,
      status: safeStatus,
      approvalStatus: 'approved',
      lastLoginAt: null,
    });

    res.status(201).json(sanitizeUser(user));
  }),
);

app.put(
  '/api/admin/users/:id',
  requireAuth,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { name, email, password, role, status, approvalStatus } = req.body as {
      name?: string;
      email?: string;
      password?: string;
      role?: UserRole;
      status?: UserStatus;
      approvalStatus?: ApprovalStatus;
    };

    const user = await UserModel.findById(id);

    if (!user) {
      res.status(404).json({ message: 'User not found' });
      return;
    }

    if (email) {
      const normalizedEmail = email.trim().toLowerCase();
      const emailTaken = await UserModel.findOne({ email: normalizedEmail, _id: { $ne: id } });

      if (emailTaken) {
        res.status(409).json({ message: 'Email already exists' });
        return;
      }

      user.email = normalizedEmail;
    }

    if (name) user.name = name.trim();
    if (role) {
      user.role = role;
      user.requestedRole = role;
    }
    if (status) user.status = status;
    if (approvalStatus) user.approvalStatus = approvalStatus;
    if (password) user.passwordHash = await bcrypt.hash(password, 10);

    await (user as mongoose.Document & UserDocument).save();
    res.json(sanitizeUser(user));
  }),
);

app.post(
  '/api/admin/users/:id/approve',
  requireAuth,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const user = await UserModel.findById(id);

    if (!user) {
      res.status(404).json({ message: 'User not found' });
      return;
    }

    user.role = user.requestedRole;
    user.status = 'active';
    user.approvalStatus = 'approved';
    await (user as mongoose.Document & UserDocument).save();
    await addNotification({
      userId: String(user.id),
      title: 'Admin access approved',
      message: 'Your admin account request was approved. You can now open the admin console.',
      level: 'success',
      link: '/admin',
    });

    res.json(sanitizeUser(user));
  }),
);

app.post(
  '/api/admin/users/:id/reject',
  requireAuth,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const user = await UserModel.findById(id);

    if (!user) {
      res.status(404).json({ message: 'User not found' });
      return;
    }

    user.role = 'member';
    user.status = 'disabled';
    user.approvalStatus = 'rejected';
    await (user as mongoose.Document & UserDocument).save();
    await addNotification({
      userId: String(user.id),
      title: 'Admin request rejected',
      message: 'Your admin access request was rejected. Contact support for details.',
      level: 'warning',
      link: '/support',
    });

    res.json(sanitizeUser(user));
  }),
);

app.delete(
  '/api/admin/users/:id',
  requireAuth,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const actor = (req as AuthenticatedRequest).user!;

    if (String(actor.id) === id) {
      res.status(400).json({ message: 'You cannot delete the currently signed-in admin' });
      return;
    }

    const deleted = await UserModel.findByIdAndDelete(id);

    if (!deleted) {
      res.status(404).json({ message: 'User not found' });
      return;
    }

    res.status(204).send();
  }),
);

// GET failed documents (admin only)
app.get(
  '/api/admin/documents/failed',
  requireAuth,
  requireAdmin,
  asyncHandler(async (_req, res) => {
    const docs = await DocumentModel.find({ status: 'failed' })
      .sort({ errorAt: -1 })
      .limit(100);
    res.json(
      docs.map((doc) => ({
        id: doc.id,
        documentId: doc.documentId,
        name: doc.name,
        status: doc.status,
        errorMessage: doc.errorMessage,
        errorAt: doc.errorAt,
        errorUserId: doc.errorUserId,
        reprocessCount: doc.reprocessCount ?? 0,
        uploadedAt: doc.uploadedAt,
        enterpriseId: doc.enterpriseId,
      })),
    );
  }),
);

// POST reprocess a failed document (admin only)
app.post(
  '/api/admin/documents/:id/reprocess',
  requireAuth,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const actor = (req as AuthenticatedRequest).user!;
    const doc = await DocumentModel.findOne({ id: req.params.id });

    if (!doc) {
      res.status(404).json({ message: 'Document not found' });
      return;
    }

    if (doc.status !== 'failed') {
      res.status(400).json({ message: 'Only failed documents can be reprocessed' });
      return;
    }

    const currentCount = doc.reprocessCount ?? 0;
    if (currentCount >= MAX_REPROCESS_COUNT) {
      res.status(429).json({
        message: `Reprocess limit reached (max ${MAX_REPROCESS_COUNT}). Manual intervention required.`,
        reprocessCount: currentCount,
      });
      return;
    }

    if (REPROCESS_STRATEGY === 'new_job') {
      // Create a brand-new document record pointing to the same file
      const newDoc = await DocumentModel.create({
        id: createId('doc'),
        documentId: createId('docsvc'),
        name: doc.name,
        type: doc.type,
        size: doc.size,
        sizeBytes: doc.sizeBytes,
        status: 'processing',
        uploadedAt: new Date().toISOString(),
        category: doc.category,
        ownerId: doc.ownerId,
        enterpriseId: doc.enterpriseId,
        originalJobId: doc.id,          // traceability back to the original
        reprocessCount: currentCount + 1,
        lastReprocessedAt: new Date().toISOString(),
      });

      await addNotification({
        userId: String(actor.id),
        title: 'Reprocessing started',
        message: `New job created for "${doc.name}" (attempt ${currentCount + 1}).`,
        level: 'info',
      });

      res.status(201).json({
        strategy: 'new_job',
        newDocumentId: newDoc.id,
        reprocessCount: currentCount + 1,
      });
    } else {
      // Reuse the existing record — reset status to processing
      doc.status = 'reprocessing';
      doc.reprocessCount = currentCount + 1;
      doc.lastReprocessedAt = new Date().toISOString();
      doc.errorMessage = '';
      doc.errorAt = null;
      await (doc as mongoose.Document & DocumentRecord).save();

      await addNotification({
        userId: String(actor.id),
        title: 'Reprocessing started',
        message: `"${doc.name}" queued for reprocessing (attempt ${currentCount + 1}).`,
        level: 'info',
      });

      res.json({
        strategy: 'reuse_job',
        documentId: doc.id,
        reprocessCount: currentCount + 1,
      });
    }
  }),
);

app.post(
  '/api/search',
  asyncHandler(async (req, res) => {
    const { query, top_k = 10, filter_key, filter_value } = req.body as {
      query?: string;
      top_k?: number;
      filter_key?: string;
      filter_value?: string;
    };

    if (!query) {
      res.status(400).json({ message: 'Query is required' });
      return;
    }

    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (req.headers.authorization) {
        headers.authorization = req.headers.authorization;
      }

      const searchResponse = await fetch(`${API_GATEWAY_API_URL}/search?q=${encodeURIComponent(query)}&top_k=${top_k}`, {
        method: 'GET',
        headers,
      });

      if (!searchResponse.ok) {
        throw new Error(`API Gateway search returned ${searchResponse.status}`);
      }

      const data = await searchResponse.json();
      res.json(data);
    } catch (error: unknown) {
      console.warn('API Gateway search proxy failed', error);
      const lowerQuery = query.toLowerCase();
      const docs = await DocumentModel.find().sort({ uploadedAt: -1 }).limit(top_k);
      const results = docs
        .filter((doc) =>
          [doc.name, doc.type, doc.category, doc.status, doc.extractedText || '']
            .some((field) => field.toLowerCase().includes(lowerQuery)),
        )
        .slice(0, top_k)
        .map((doc) => ({
          id: doc.id,
          score: 0.72,
          metadata: {
            fileName: doc.name,
            fileType: doc.type,
            fileSize: doc.size,
            category: doc.category,
            status: doc.status,
            uploadedAt: doc.uploadedAt,
            preview: (doc.extractedText || '').slice(0, 220),
          },
        }));

      res.json({
        message: 'Semantic search service is currently unavailable. Returning local document matches.',
        results,
      });
    }
  }),
);

app.post(
  '/api/extract',
  asyncHandler(async (req, res) => {
    const { text, docId } = req.body as { text?: string; docId?: string };

    if (!text) {
      res.status(400).json({ error: 'Text is required' });
      return;
    }

    const cacheKey = `metadata:${docId || Buffer.from(text.substring(0, 20)).toString('base64')}`;

    if (redisReady) {
      const cachedData = await redisClient.get(cacheKey);
      if (cachedData) {
        res.json(JSON.parse(cachedData) as unknown);
        return;
      }
    }

    const metadata = await runPythonNLP(text);

    if (redisReady) {
      await redisClient.set(cacheKey, JSON.stringify(metadata), { EX: 3600 });
    }

    res.json(metadata);
  }),
);

app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error('Server Error:', error);
  res.status(500).json({ message: 'Internal Server Error' });
});

const start = async () => {
  await mongoose.connect(MONGODB_URI);
  console.log(`Connected to MongoDB at ${MONGODB_URI}`);
  await ensureSeedAdmin();
  await ensureSeedWorkflows();
  await ensureOutboxFile();
  app.listen(PORT, () => {
    console.log(`API server running on http://localhost:${PORT}`);
  });
};

void start().catch((error: unknown) => {
  console.error('Startup failure:', error);
  process.exit(1);
});
