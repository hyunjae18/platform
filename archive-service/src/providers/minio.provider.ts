// src/providers/minio.provider.ts
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as Minio from 'minio';

@Injectable()
export class MinioProvider implements OnModuleInit {
  private readonly logger = new Logger(MinioProvider.name);
  private hotClient: Minio.Client;
  private coldClient: Minio.Client;
  private hotBucket: string;
  private coldBucket: string;

  constructor(private configService: ConfigService) {
    this.hotBucket = this.readString(
      ['MINIO_HOT_BUCKET', 'MINIO_BUCKET'],
      'docmind-hot-bucket',
    );
    this.coldBucket = this.readString(
      ['MINIO_COLD_BUCKET', 'MINIO_ARCHIVE_BUCKET'],
      'docmind-archive',
    );

    this.hotClient = new Minio.Client({
      endPoint: this.readString(['MINIO_HOT_ENDPOINT', 'MINIO_ENDPOINT'], 'minio'),
      port: this.readNumber(['MINIO_HOT_PORT', 'MINIO_PORT'], 9010),
      useSSL: this.readBoolean(['MINIO_HOT_USE_SSL', 'MINIO_USE_SSL'], false),
      accessKey: this.readString(['MINIO_HOT_ACCESS_KEY', 'MINIO_ACCESS_KEY']),
      secretKey: this.readString(['MINIO_HOT_SECRET_KEY', 'MINIO_SECRET_KEY']),
    });

    this.coldClient = new Minio.Client({
      endPoint: this.readString(
        ['MINIO_COLD_ENDPOINT', 'MINIO_ENDPOINT', 'MINIO_HOT_ENDPOINT'],
        'minio',
      ),
      port: this.readNumber(['MINIO_COLD_PORT', 'MINIO_PORT', 'MINIO_HOT_PORT'], 9000),
      useSSL: this.readBoolean(
        ['MINIO_COLD_USE_SSL', 'MINIO_USE_SSL', 'MINIO_HOT_USE_SSL'],
        false,
      ),
      accessKey: this.readString(
        ['MINIO_COLD_ACCESS_KEY', 'MINIO_ACCESS_KEY', 'MINIO_HOT_ACCESS_KEY'],
      ),
      secretKey: this.readString(
        ['MINIO_COLD_SECRET_KEY', 'MINIO_SECRET_KEY', 'MINIO_HOT_SECRET_KEY'],
      ),
    });
  }

  async onModuleInit() {
    await this.ensureBucket(this.hotClient, this.hotBucket, 'hot');
    await this.ensureBucket(this.coldClient, this.coldBucket, 'cold');
  }

  private readString(keys: string[], fallback?: string): string {
    for (const key of keys) {
      const value = this.configService.get<string>(key);
      if (value && value.trim()) {
        return value.trim();
      }
    }

    if (fallback !== undefined) {
      return fallback;
    }

    throw new Error(`Missing required MinIO setting: ${keys.join(' or ')}`);
  }

  private readNumber(keys: string[], fallback: number): number {
    for (const key of keys) {
      const value = this.configService.get<string | number>(key);
      if (value !== undefined && value !== null && `${value}`.trim() !== '') {
        const parsed = Number(value);
        if (!Number.isNaN(parsed)) {
          return parsed;
        }
      }
    }
    return fallback;
  }

  private readBoolean(keys: string[], fallback: boolean): boolean {
    for (const key of keys) {
      const value = this.configService.get<string | boolean>(key);
      if (typeof value === 'boolean') {
        return value;
      }
      if (typeof value === 'string' && value.trim()) {
        return ['true', '1', 'yes'].includes(value.trim().toLowerCase());
      }
    }
    return fallback;
  }

  private async ensureBucket(client: Minio.Client, bucket: string, label: string) {
    const exists = await client.bucketExists(bucket);
    if (exists) {
      this.logger.log(`Using ${label} bucket: ${bucket}`);
      return;
    }

    await client.makeBucket(bucket);
    this.logger.log(`Created ${label} bucket: ${bucket}`);
  }

  // --- Hot bucket operations ---
  async uploadToHot(key: string, buffer: Buffer) {
    return this.hotClient.putObject(this.hotBucket, key, buffer);
  }

  async downloadFromHot(key: string) {
    return this.hotClient.getObject(this.hotBucket, key);
  }

  async deleteFromHot(key: string) {
    return this.hotClient.removeObject(this.hotBucket, key);
  }

  async listHotObjects(): Promise<string[]> {
    const stream = this.hotClient.listObjectsV2(this.hotBucket, '', true);
    const keys: string[] = [];
    for await (const obj of stream) {
      keys.push(obj.name);
    }
    return keys;
  }

  async getObjectLastModified(key: string): Promise<Date | null> {
    try {
      const stat = await this.hotClient.statObject(this.hotBucket, key);
      return stat.lastModified ?? null;
    } catch (err) {
      if (err.code === 'NotFound') return null;
      throw err;
    }
  }

  // --- Cold bucket operations ---
  async uploadToCold(key: string, buffer: Buffer) {
    return this.coldClient.putObject(this.coldBucket, key, buffer);
  }

  async downloadFromCold(key: string) {
    return this.coldClient.getObject(this.coldBucket, key);
  }

  async deleteFromCold(key: string) {
    return this.coldClient.removeObject(this.coldBucket, key);
  }

  async objectExistsInHot(key: string): Promise<boolean> {
    return this.getObjectLastModified(key) !== null;
  }

  async objectExistsInCold(key: string): Promise<boolean> {
    try {
      await this.coldClient.statObject(this.coldBucket, key);
      return true;
    } catch (err) {
      if (err.code === 'NotFound') return false;
      throw err;
    }
  }
  async getHotBucketTotalSize(): Promise<number> {
    const stream = this.hotClient.listObjectsV2(this.hotBucket, '', true);
    let totalSize = 0;
    for await (const obj of stream) {
      totalSize += obj.size;
    }
    return totalSize;
  }

  getHotBucket(): string {
    return this.hotBucket;
  }

  getColdBucket(): string {
    return this.coldBucket;
  }

  getHotClient(): Minio.Client {
    return this.hotClient;
  }

  getColdClient(): Minio.Client {
    return this.coldClient;
  }
}
