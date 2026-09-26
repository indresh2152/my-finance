const mockLogger = { info: jest.fn() };
jest.mock('pino', () => jest.fn(() => mockLogger));

import { PanService } from './pan.service';
import { AppError } from '../middleware/error.middleware';

const HMAC_SECRET = 'test-pan-hmac-secret-32-chars-min!';
const USER_ID = '550e8400-e29b-41d4-a716-446655440000';
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
    db.query.mockResolvedValueOnce({ rows: [{ id: 'existing-pan-id' }] });
    const service = new PanService(db as never, HMAC_SECRET, makeValidVerifier() as never);
    await expect(service.register(USER_ID, 'ABCDE1234F', LNG)).rejects.toThrow(
      expect.objectContaining({ code: 'PAN_ALREADY_REGISTERED' }),
    );
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
      { userId: USER_ID, status: 'FAILED', verifierMessage: 'PAN not found.', traceId: 'trace-404' },
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
    db.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
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
    db.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
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
