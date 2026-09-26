const mockLogger = { info: jest.fn() };
jest.mock('pino', () => jest.fn(() => mockLogger));

import { PanService } from './pan.service';
import { AppError } from '../middleware/error.middleware';

const HMAC_SECRET = 'test-pan-hmac-secret-32-chars-min!';
const USER_ID = '550e8400-e29b-41d4-a716-446655440000';
const OTHER_USER_ID = '660e8400-e29b-41d4-a716-446655440000';
const LNG = 'en';

const makeDb = (): { query: jest.Mock } => ({ query: jest.fn() });

const makeValidVerifier = (): { verify: jest.Mock } => ({
  verify: jest.fn().mockResolvedValue({ valid: true, holderName: 'JOHN DOE', status: 'VALID' }),
});

describe('PanService.register', () => {
  it('should throw INVALID_PAN_FORMAT for an invalid PAN', async () => {
    const db = makeDb();
    const service = new PanService(db as never, HMAC_SECRET, makeValidVerifier() as never);
    await expect(service.register(USER_ID, 'INVALID', LNG)).rejects.toThrow(
      expect.objectContaining({ code: 'INVALID_PAN_FORMAT' }),
    );
    expect(db.query).not.toHaveBeenCalled();
  });

  it('should throw PAN_ALREADY_REGISTERED when user already has a PAN', async () => {
    const db = makeDb();
    db.query.mockResolvedValueOnce({ rows: [{ user_id: USER_ID }] });
    const service = new PanService(db as never, HMAC_SECRET, makeValidVerifier() as never);
    await expect(service.register(USER_ID, 'ABCDE1234F', LNG)).rejects.toThrow(
      expect.objectContaining({ code: 'PAN_ALREADY_REGISTERED', status: 409 }),
    );
  });

  it('should prefer PAN_ALREADY_REGISTERED when both the user and the PAN conflict', async () => {
    const db = makeDb();
    db.query.mockResolvedValueOnce({ rows: [{ user_id: OTHER_USER_ID }, { user_id: USER_ID }] });
    const service = new PanService(db as never, HMAC_SECRET, makeValidVerifier() as never);
    await expect(service.register(USER_ID, 'ABCDE1234F', LNG)).rejects.toThrow(
      expect.objectContaining({ code: 'PAN_ALREADY_REGISTERED' }),
    );
  });

  it('should throw PAN_LINKED_TO_ANOTHER_ACCOUNT without calling the verifier', async () => {
    const db = makeDb();
    db.query.mockResolvedValueOnce({ rows: [{ user_id: OTHER_USER_ID }] });
    const verifier = makeValidVerifier();
    const service = new PanService(db as never, HMAC_SECRET, verifier as never);
    await expect(service.register(USER_ID, 'ABCDE1234F', LNG)).rejects.toThrow(
      expect.objectContaining({ code: 'PAN_LINKED_TO_ANOTHER_ACCOUNT', status: 409 }),
    );
    expect(verifier.verify).not.toHaveBeenCalled();
  });

  it.each([
    [USER_ID, 'PAN_ALREADY_REGISTERED'],
    [OTHER_USER_ID, 'PAN_LINKED_TO_ANOTHER_ACCOUNT'],
  ])(
    'should re-check and map a concurrent unique violation won by %s to %s',
    async (winnerUserId, code) => {
      const db = makeDb();
      db.query
        .mockResolvedValueOnce({ rows: [] })
        .mockRejectedValueOnce(Object.assign(new Error('duplicate key'), { code: '23505' }))
        .mockResolvedValueOnce({ rows: [{ user_id: winnerUserId }] });
      const service = new PanService(db as never, HMAC_SECRET, makeValidVerifier() as never);
      await expect(service.register(USER_ID, 'ABCDE1234F', LNG)).rejects.toThrow(
        expect.objectContaining({ code, status: 409 }),
      );
    },
  );

  it('should rethrow a unique violation the re-check cannot explain', async () => {
    const db = makeDb();
    const dbError = Object.assign(new Error('duplicate key'), { code: '23505' });
    db.query
      .mockResolvedValueOnce({ rows: [] })
      .mockRejectedValueOnce(dbError)
      .mockResolvedValueOnce({ rows: [] });
    const service = new PanService(db as never, HMAC_SECRET, makeValidVerifier() as never);
    await expect(service.register(USER_ID, 'ABCDE1234F', LNG)).rejects.toBe(dbError);
  });

  it('should rethrow other insert errors unchanged', async () => {
    const db = makeDb();
    const dbError = new Error('connection reset');
    db.query.mockResolvedValueOnce({ rows: [] }).mockRejectedValueOnce(dbError);
    const service = new PanService(db as never, HMAC_SECRET, makeValidVerifier() as never);
    await expect(service.register(USER_ID, 'ABCDE1234F', LNG)).rejects.toBe(dbError);
  });

  it('should check the conflict by hashed PAN, never the raw PAN', async () => {
    const db = makeDb();
    db.query.mockResolvedValueOnce({ rows: [{ user_id: USER_ID }] });
    const service = new PanService(db as never, HMAC_SECRET, makeValidVerifier() as never);
    await expect(service.register(USER_ID, 'ABCDE1234F', LNG)).rejects.toThrow();
    const [, params] = db.query.mock.calls[0] as [string, unknown[]];
    expect(params).not.toContain('ABCDE1234F');
    expect(params[0]).toBe(USER_ID);
  });

  it('should log userId, status, verifier message and traceId without the PAN when verification fails', async () => {
    mockLogger.info.mockClear();
    const db = makeDb();
    db.query.mockResolvedValueOnce({ rows: [] });
    const verifier = {
      verify: jest.fn().mockResolvedValue({
        valid: false,
        status: 'FAILED',
        message: 'PAN not found.',
        traceId: 'trace-404',
      }),
    };
    const service = new PanService(db as never, HMAC_SECRET, verifier as never);
    await expect(service.register(USER_ID, 'ABCDE1234F', LNG)).rejects.toThrow(
      expect.objectContaining({ code: 'PAN_VERIFICATION_FAILED' }),
    );
    expect(mockLogger.info).toHaveBeenCalledWith(
      {
        userId: USER_ID,
        status: 'FAILED',
        verifierMessage: 'PAN not found.',
        traceId: 'trace-404',
      },
      expect.any(String),
    );
    const logged = JSON.stringify(mockLogger.info.mock.calls);
    expect(logged).not.toContain('ABCDE1234F');
    expect(logged).not.toContain('ABCDE####F');
  });

  it('should throw PAN_VERIFICATION_FAILED when verifier returns valid=false', async () => {
    const db = makeDb();
    db.query.mockResolvedValueOnce({ rows: [] });
    const verifier = { verify: jest.fn().mockResolvedValue({ valid: false, status: 'INVALID' }) };
    const service = new PanService(db as never, HMAC_SECRET, verifier as never);
    await expect(service.register(USER_ID, 'ABCDE1234F', LNG)).rejects.toThrow(
      expect.objectContaining({ code: 'PAN_VERIFICATION_FAILED' }),
    );
  });

  it('should propagate PAN_KYC_UNAVAILABLE when verifier throws', async () => {
    const db = makeDb();
    db.query.mockResolvedValueOnce({ rows: [] });
    const verifier = {
      verify: jest
        .fn()
        .mockRejectedValue(new AppError('PAN_KYC_UNAVAILABLE', 502, 'KYC unavailable')),
    };
    const service = new PanService(db as never, HMAC_SECRET, verifier as never);
    await expect(service.register(USER_ID, 'ABCDE1234F', LNG)).rejects.toThrow(
      expect.objectContaining({ code: 'PAN_KYC_UNAVAILABLE' }),
    );
  });

  it('should return a PAN profile with non-null verifiedAt on success', async () => {
    const db = makeDb();
    db.query.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({
      rows: [
        {
          id: 'pan-uuid',
          pan_masked: 'ABCDE####F',
          verified_at: '2026-06-07T00:00:00Z',
          created_at: '2026-06-07T00:00:00Z',
        },
      ],
    });
    const service = new PanService(db as never, HMAC_SECRET, makeValidVerifier() as never);
    const result = await service.register(USER_ID, 'ABCDE1234F', LNG);
    expect(result.panMasked).toBe('ABCDE####F');
    expect(result.verifiedAt).toBe('2026-06-07T00:00:00Z');
  });

  it('should never expose the raw PAN in the query parameters', async () => {
    const db = makeDb();
    db.query.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({
      rows: [
        {
          id: 'pan-uuid',
          pan_masked: 'ABCDE####F',
          verified_at: '2026-06-07T00:00:00Z',
          created_at: '2026-06-07T00:00:00Z',
        },
      ],
    });
    const service = new PanService(db as never, HMAC_SECRET, makeValidVerifier() as never);
    await service.register(USER_ID, 'ABCDE1234F', LNG);
    const insertCall = db.query.mock.calls[1] as [string, unknown[]];
    const params = insertCall[1];
    expect(params).not.toContain('ABCDE1234F');
  });
});

describe('PanService.getByUserId', () => {
  it('should throw PAN_NOT_REGISTERED when no profile exists', async () => {
    const db = makeDb();
    db.query.mockResolvedValueOnce({ rows: [] });
    const service = new PanService(db as never, HMAC_SECRET, makeValidVerifier() as never);
    await expect(service.getByUserId(USER_ID, LNG)).rejects.toThrow(
      expect.objectContaining({ code: 'PAN_NOT_REGISTERED' }),
    );
  });

  it('should return the PAN profile when it exists', async () => {
    const db = makeDb();
    db.query.mockResolvedValueOnce({
      rows: [
        {
          id: 'pan-uuid',
          pan_masked: 'ABCDE####F',
          verified_at: '2026-06-07T00:00:00Z',
          created_at: '2026-06-07T00:00:00Z',
        },
      ],
    });
    const service = new PanService(db as never, HMAC_SECRET, makeValidVerifier() as never);
    const result = await service.getByUserId(USER_ID, LNG);
    expect(result.panMasked).toBe('ABCDE####F');
  });
});
