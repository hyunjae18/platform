import { Test, TestingModule } from '@nestjs/testing';
import { Minio } from './minio';

describe('Minio', () => {
  let provider: Minio;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [Minio],
    }).compile();

    provider = module.get<Minio>(Minio);
  });

  it('should be defined', () => {
    expect(provider).toBeDefined();
  });
});
