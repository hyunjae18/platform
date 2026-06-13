import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ArchiveService } from './archive.service';
import { ArchiveController } from './archive.controller';
import { ArchiveDocument, ArchiveSchema } from '../schemas/archive.schema';
import { MinioProvider } from '../providers/minio.provider';
import { RabbitmqConsumer } from '../events/rabbitmq.consumer';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    AuthModule,
    MongooseModule.forFeature([
      { name: ArchiveDocument.name, schema: ArchiveSchema },
    ]),
  ],
  controllers: [ArchiveController],
  providers: [ArchiveService, MinioProvider, RabbitmqConsumer],
})
export class ArchiveModule {}
