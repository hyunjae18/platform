import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { connect, Connection, Channel, ConsumeMessage } from 'amqplib';
import { DocumentsService } from '../documents/documents.service';

interface OcrMessage {
  documentId: string;
  enterprise_id: string;
  text: string;
}

interface ClassificationMessage {
  documentId: string;
  enterprise_id: string;
  category: string;
}

interface SearchIndexMessage {
  documentId: string;
  enterprise_id: string;
  indexedAt?: string;
}

@Injectable()
export class RabbitMQService implements OnModuleInit {
  private connection: Connection;
  private channel: Channel;
  private readonly logger = new Logger(RabbitMQService.name);
  private retryCount = 0;
  private maxRetries = 10;

  private readonly rabbitmqUrl =
    process.env.RABBITMQ_URL || 'amqp://admin:admin123@rabbitmq:5672';

  constructor(private documentsService: DocumentsService) {}

  async onModuleInit(): Promise<void> {
    await this.connect();
  }

  private async connect(): Promise<void> {
    try {
      this.logger.log(`Connecting to RabbitMQ at ${this.rabbitmqUrl}`);
      this.connection = await connect(this.rabbitmqUrl);
      this.channel = await this.connection.createChannel();

      await this.channel.assertQueue('document.ocr.completed', {
        durable: true,
      });
      await this.channel.assertQueue('document.classified', { durable: true });
      await this.channel.assertQueue('document.search.indexed', {
        durable: true,
      });

      this.logger.log(
        'Queues declared: document.ocr.completed, document.classified, document.search.indexed',
      );

      await this.consumeOcrResults();
      await this.consumeClassificationResults();
      await this.consumeSearchResults();

      this.logger.log('Connected to RabbitMQ and listening for messages');
      this.retryCount = 0;
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error
          ? error.message
          : typeof error === 'string'
            ? error
            : JSON.stringify(error);
      this.logger.error(`RabbitMQ connection failed: ${errorMessage}`);
      if (this.retryCount < this.maxRetries) {
        this.retryCount++;
        const delay = 5000;
        this.logger.log(`Retrying in ${delay / 1000} seconds...`);
        setTimeout(() => void this.connect(), delay);
      }
    }
  }

  private async consumeOcrResults(): Promise<void> {
    this.logger.log('Setting up consumer for document.ocr.completed');

    await this.channel.consume('document.ocr.completed', (msg) => {
      void this.handleOcrMessage(msg);
    });
  }

  private async handleOcrMessage(msg: ConsumeMessage | null): Promise<void> {
    if (!msg) {
      return;
    }

    try {
      const data = JSON.parse(msg.content.toString()) as OcrMessage;
      if (!data.enterprise_id) {
        throw new Error('Missing enterprise_id');
      }
      this.logger.log(`OCR result received for document: ${data.documentId}`);
      this.logger.log(`Text length: ${data.text.length} characters`);

      await this.documentsService.updateWithOcr(
        data.documentId,
        data.enterprise_id,
        data.text,
      );
      this.channel.ack(msg);
      this.logger.log(`Document ${data.documentId} updated successfully`);
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error
          ? error.message
          : typeof error === 'string'
            ? error
            : JSON.stringify(error);
      this.logger.error(`Error processing OCR result: ${errorMessage}`);
      this.channel.nack(msg, false, false);
    }
  }

  private async consumeClassificationResults(): Promise<void> {
    this.logger.log('Setting up consumer for document.classified');

    await this.channel.consume('document.classified', (msg) => {
      void this.handleClassificationMessage(msg);
    });
  }

  private async handleClassificationMessage(
    msg: ConsumeMessage | null,
  ): Promise<void> {
    if (!msg) {
      return;
    }

    try {
      const data = JSON.parse(msg.content.toString()) as ClassificationMessage;
      if (!data.enterprise_id) {
        throw new Error('Missing enterprise_id');
      }
      this.logger.log(
        `Classification received for document: ${data.documentId}`,
      );
      this.logger.log(`Category: ${data.category}`);

      await this.documentsService.updateWithCategory(
        data.documentId,
        data.enterprise_id,
        data.category,
      );
      this.channel.ack(msg);
      this.logger.log(
        `Document ${data.documentId} updated with category: ${data.category}`,
      );
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error
          ? error.message
          : typeof error === 'string'
            ? error
            : JSON.stringify(error);
      this.logger.error(`Error processing classification: ${errorMessage}`);
      this.channel.nack(msg, false, false);
    }
  }

  private async consumeSearchResults(): Promise<void> {
    this.logger.log('Setting up consumer for document.search.indexed');

    await this.channel.consume('document.search.indexed', (msg) => {
      void this.handleSearchIndexMessage(msg);
    });
  }

  private async handleSearchIndexMessage(
    msg: ConsumeMessage | null,
  ): Promise<void> {
    if (!msg) {
      return;
    }

    try {
      const data = JSON.parse(msg.content.toString()) as SearchIndexMessage;
      if (!data.enterprise_id) {
        throw new Error('Missing enterprise_id');
      }
      this.logger.log(
        `Search index confirmation for document: ${data.documentId}`,
      );

      await this.documentsService.updateWithSearchIndex(
        data.documentId,
        data.enterprise_id,
        data.indexedAt ?? new Date().toISOString(),
      );
      this.channel.ack(msg);
      this.logger.log(`Document ${data.documentId} marked as indexed`);
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error
          ? error.message
          : typeof error === 'string'
            ? error
            : JSON.stringify(error);
      this.logger.error(`Error processing search index: ${errorMessage}`);
      this.channel.nack(msg, false, false);
    }
  }
}
