// D:\the_project\document-service\src\main.ts
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Logger } from '@nestjs/common';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  const logger = new Logger('Bootstrap');

  app.enableCors();

  const port = process.env.PORT || 3000;
  await app.listen(port);

  logger.log(`Document Service running on port ${port}`);
  logger.log(
    `MongoDB: ${process.env.MONGO_URI || 'mongodb://mongodb:27017/documents_service_db'}`,
  );
  logger.log(
    `RabbitMQ: ${process.env.RABBITMQ_URL || 'amqp://admin:admin123@rabbitmq:5672'}`,
  );
}

const startWithRetry = async (): Promise<void> => {
  let retries = 10;

  while (retries) {
    try {
      await bootstrap();
      break;
    } catch (err: unknown) {
      console.log(`Failed to start, retries left: ${retries}`, err);
      retries -= 1;
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
  }
};

void startWithRetry();
