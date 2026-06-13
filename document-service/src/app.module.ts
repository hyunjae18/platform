// src/app.module.ts
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { DocumentsModule } from './documents/documents.module';
import { RabbitMQModule } from './rabbitmq/rabbitmq.module';
import { AdminModule } from './admin/admin.module';   // <-- ADD THIS

@Module({
  imports: [
    MongooseModule.forRoot(
      process.env.MONGO_URI || 'mongodb://mongodb:27017/documents_service_db',
      {
        connectionFactory: (connection: unknown) => {
          console.log('MongoDB connected successfully');
          return connection;
        },
        serverSelectionTimeoutMS: 5000,
        socketTimeoutMS: 45000,
      },
    ),
    DocumentsModule,
    RabbitMQModule,
    AdminModule,   // <-- ADD THIS
  ],
})
export class AppModule {}