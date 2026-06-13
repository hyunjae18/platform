import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  // No more microservice connection
  await app.listen(process.env.PORT ?? 3007);
}
bootstrap();
