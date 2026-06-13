import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import * as amqp from 'amqplib';
import { ArchiveService } from '../archive/archive.service';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class RabbitmqConsumer implements OnModuleInit {
  private readonly logger = new Logger(RabbitmqConsumer.name);
  private readonly queue = 'document_uploaded';
  private readonly rabbitmqUrl: string;
  private readonly gatewayUrl: string;

  constructor(
    private readonly archiveService: ArchiveService,
    private readonly configService: ConfigService,
  ) {
    this.rabbitmqUrl = this.configService.get<string>('RABBITMQ_URL') ?? 'amqp://localhost:5672';
    this.gatewayUrl = this.configService.get<string>('GATEWAY_URL') ?? 'http://localhost:8001';
  }

  async onModuleInit() {
    await this.connect();
  }

  private async reportFailure(documentId: string, enterprise_id: string, errorMsg: string) {
    try {
      const response = await fetch(`${this.gatewayUrl}/api/ocr/failure`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Enterprise-ID': enterprise_id,
        },
        body: JSON.stringify({ documentId, error_message: errorMsg }),
      });
      if (!response.ok) {
        this.logger.error(`Failure report failed: ${response.status}`);
      } else {
        this.logger.log(`Reported archive failure for ${documentId}`);
      }
    } catch (e) {
      this.logger.error(`Failed to report archive failure: ${e.message}`);
    }
  }

  private async connect() {
    let retries = 5;
    while (retries) {
      try {
        const connection = await amqp.connect(this.rabbitmqUrl);
        const channel = await connection.createChannel();
        await channel.assertQueue(this.queue, { durable: true });
        channel.prefetch(1);
        this.logger.log(`Connected to RabbitMQ, consuming from '${this.queue}'`);

        channel.consume(this.queue, async (msg) => {
          if (msg) {
            try {
              const event = JSON.parse(msg.content.toString());
              if (!event.enterprise_id) {
                throw new Error('Missing enterprise_id');
              }
              this.logger.log(`Received document ${event.documentId} for archival`);
              if (event.fileContent) {
                const buffer = Buffer.from(event.fileContent, 'base64');
                await this.archiveService.register(
                  event.documentId,
                  event.enterprise_id,
                  buffer,
                );
                this.logger.log(`Successfully archived document ${event.documentId}`);
                channel.ack(msg);
              } else {
                this.logger.warn('Event missing fileContent, skipping');
                channel.ack(msg);
              }
            } catch (err) {
              this.logger.error(`Error processing message: ${err.message}`);
              // Report failure to gateway
              try {
                const event = JSON.parse(msg.content.toString());
                await this.reportFailure(event.documentId, event.enterprise_id, `Archive: ${err.message}`);
              } catch (parseErr) {
                this.logger.error('Could not parse message for failure reporting');
              }
              channel.nack(msg, false, false);
            }
          }
        });
        return;
      } catch (err) {
        this.logger.error(`RabbitMQ connection failed (${retries} retries left): ${err.message}`);
        retries -= 1;
        await new Promise(res => setTimeout(res, 5000));
      }
    }
    throw new Error('Could not connect to RabbitMQ after multiple attempts');
  }
}
