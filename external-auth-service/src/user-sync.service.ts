import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import mongoose, { Connection, Schema } from 'mongoose';
import { KeycloakUserProfile } from './keycloak.service';

type UserStatus = 'active' | 'invited' | 'disabled';
type ApprovalStatus = 'approved' | 'pending' | 'rejected';

interface SyncOptions {
  status?: UserStatus;
  approvalStatus?: ApprovalStatus;
  lastLoginAt?: string | null;
}

const userSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ['admin', 'member'], default: 'member' },
    requestedRole: { type: String, enum: ['admin', 'member'], default: 'member' },
    status: { type: String, enum: ['active', 'invited', 'disabled'], default: 'active' },
    approvalStatus: { type: String, enum: ['approved', 'pending', 'rejected'], default: 'approved' },
    enterpriseId: { type: String, required: true, default: 'ENT_DEFAULT', index: true },
    lastLoginAt: { type: String, default: null },
    avatar: { type: String, required: false },
    keycloakId: { type: String, required: true, unique: true, index: true },
    authProvider: { type: String, default: 'keycloak' },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

export interface SyncedDocmindUser {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'member';
  requestedRole: 'admin' | 'member';
  status: UserStatus;
  approvalStatus: ApprovalStatus;
  enterpriseId: string;
  lastLoginAt: string | null;
  keycloakId: string;
}

@Injectable()
export class UserSyncService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(UserSyncService.name);
  private connection?: Connection;
  private userModel?: mongoose.Model<any>;

  async onModuleInit() {
    const uri = process.env.MONGODB_URI || process.env.MONGO_URI || '';
    if (!uri) {
      this.logger.warn('MongoDB sync disabled: MONGODB_URI is not configured');
      return;
    }

    try {
      this.connection = await mongoose.createConnection(uri).asPromise();
      const userModel = this.connection.model('User', userSchema, 'users');
      await userModel.collection.createIndex({ email: 1 }, { unique: true });
      await userModel.collection.createIndex({ keycloakId: 1 }, { unique: true, sparse: true });
      this.userModel = userModel;
      this.logger.log('Keycloak user sync to MongoDB is enabled');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`MongoDB sync disabled: ${message}`);
    }
  }

  async onModuleDestroy() {
    await this.connection?.close();
  }

  async syncUser(user: KeycloakUserProfile, options: SyncOptions = {}): Promise<SyncedDocmindUser> {
    if (!this.userModel) {
      return this.toFallbackUser(user, options);
    }

    const status = options.status || 'active';
    const approvalStatus = options.approvalStatus || 'approved';
    const now = new Date();

    const update = {
      $set: {
        name: user.name,
        email: user.email.toLowerCase(),
        role: user.role,
        requestedRole: user.requestedRole,
        status,
        approvalStatus,
        enterpriseId: user.enterpriseId,
        keycloakId: user.id,
        authProvider: 'keycloak',
        ...(options.lastLoginAt !== undefined ? { lastLoginAt: options.lastLoginAt } : {}),
        updatedAt: now,
      },
      $setOnInsert: {
        passwordHash: 'external:keycloak',
        lastLoginAt: options.lastLoginAt ?? null,
        createdAt: now,
      },
    };

    const doc = await this.userModel.findOneAndUpdate(
      { $or: [{ keycloakId: user.id }, { email: user.email.toLowerCase() }] },
      update,
      { new: true, upsert: true },
    );

    return {
      id: String(doc.id || doc._id),
      name: String(doc.get('name')),
      email: String(doc.get('email')),
      role: doc.get('role') as 'admin' | 'member',
      requestedRole: doc.get('requestedRole') as 'admin' | 'member',
      status: doc.get('status') as UserStatus,
      approvalStatus: doc.get('approvalStatus') as ApprovalStatus,
      enterpriseId: String(doc.get('enterpriseId')),
      lastLoginAt: (doc.get('lastLoginAt') as string | null) || null,
      keycloakId: String(doc.get('keycloakId')),
    };
  }

  private toFallbackUser(user: KeycloakUserProfile, options: SyncOptions): SyncedDocmindUser {
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      requestedRole: user.requestedRole,
      status: options.status || 'active',
      approvalStatus: options.approvalStatus || 'approved',
      enterpriseId: user.enterpriseId,
      lastLoginAt: options.lastLoginAt ?? null,
      keycloakId: user.id,
    };
  }
}
