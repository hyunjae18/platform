import { Module } from '@nestjs/common';
import { Minio } from './minio/minio';

@Module({
  providers: [Minio]
})
export class ProvidersModule {}
