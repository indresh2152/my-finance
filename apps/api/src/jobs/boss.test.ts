const mockOn = jest.fn();
const mockConstructor = jest.fn().mockImplementation(() => ({ on: mockOn }));
jest.mock('pg-boss', () => mockConstructor);
const mockLogger = { error: jest.fn() };
const mockPino = jest.fn(() => mockLogger);
jest.mock('pino', () => mockPino);

import { createBoss, PGBOSS_SCHEMA } from './boss';

describe('createBoss', () => {
  it('should create pg-boss in its own schema and log its errors', () => {
    createBoss('postgresql://db');

    expect(mockConstructor).toHaveBeenCalledWith({
      connectionString: 'postgresql://db',
      schema: PGBOSS_SCHEMA,
    });
    const [event, handler] = mockOn.mock.calls[0] ?? [];
    expect(event).toBe('error');
    const err = new Error('maintenance failed');
    handler(err);
    expect(mockPino).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'pg-boss', redact: expect.anything() }),
    );
    expect(mockLogger.error).toHaveBeenCalledWith({ err }, 'pg-boss error');
  });
});
