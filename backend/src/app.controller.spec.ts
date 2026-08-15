import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';

describe('AppController', () => {
  let controller: AppController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
    }).compile();

    controller = module.get<AppController>(AppController);
  });

  it('returns status ok with an ISO timestamp on GET /health', () => {
    const result = controller.getHealth();

    expect(result.status).toBe('ok');
    expect(() => new Date(result.timestamp).toISOString()).not.toThrow();
    expect(new Date(result.timestamp).toISOString()).toBe(result.timestamp);
  });

  it('produces a different timestamp value across two calls (not hardcoded)', async () => {
    const first = controller.getHealth();
    await new Promise((resolve) => setTimeout(resolve, 5));
    const second = controller.getHealth();

    expect(second.timestamp).not.toBe(first.timestamp);
  });
});
