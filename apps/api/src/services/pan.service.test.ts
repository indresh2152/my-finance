import { PanService } from './pan.service';
import { AppError } from '../middleware/error.middleware';

const HMAC_SECRET = 'test-pan-hmac-secret-32-chars-min!';
const USER_ID = '550e8400-e29b-41d4-a716-446655440000';
const LNG = 'en';

const makeDb = (): { query: jest.Mock } => ({ query: jest.fn() });

describe('PanService.register', () => {
  it('should throw INVALID_PAN_FORMAT for an invalid PAN', async () => {
    const db = makeDb();
    const service = new PanService(db as never, HMAC_SECRET);
    await expect(service.register(USER_ID, 'INVALID', LNG)).rejects.toThrow(
      expect.objectContaining({ code: 'INVALID_PAN_FORMAT' }),
    );
    expect(db.query).not.toHaveBeenCalled();
  });

  it('should throw PAN_ALREADY_REGISTERED when user already has a PAN', async () => {
    const db = makeDb();
    db.query.mockResolvedValueOnce({ rows: [{ id: 'existing-pan-id' }] });
    const service = new PanService(db as never, HMAC_SECRET);
    await expect(service.register(USER_ID, 'ABCDE1234F', LNG)).rejects.toThrow(
      expect.objectContaining({ code: 'PAN_ALREADY_REGISTERED' }),
    );
  });

  it('should return a PAN profile with masked PAN on success', async () => {
    const db = makeDb();
    db.query
      .mockResolvedValueOnce({ rows: [] }) // no existing PAN
      .mockResolvedValueOnce({
        rows: [{ id: 'pan-uuid', pan_masked: 'ABCDE####F', verified_at: null, created_at: '2024-01-01' }],
      });
    const service = new PanService(db as never, HMAC_SECRET);
    const result = await service.register(USER_ID, 'ABCDE1234F', LNG);
    expect(result.panMasked).toBe('ABCDE####F');
    expect(result.verifiedAt).toBeNull();
  });

  it('should never expose the raw PAN in the query parameters', async () => {
    const db = makeDb();
    db.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [{ id: 'pan-uuid', pan_masked: 'ABCDE####F', verified_at: null, created_at: '2024-01-01' }],
      });
    const service = new PanService(db as never, HMAC_SECRET);
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
    const service = new PanService(db as never, HMAC_SECRET);
    await expect(service.getByUserId(USER_ID, LNG)).rejects.toThrow(
      expect.objectContaining({ code: 'PAN_NOT_REGISTERED' }),
    );
  });

  it('should return the PAN profile when it exists', async () => {
    const db = makeDb();
    db.query.mockResolvedValueOnce({
      rows: [{ id: 'pan-uuid', pan_masked: 'ABCDE####F', verified_at: null, created_at: '2024-01-01' }],
    });
    const service = new PanService(db as never, HMAC_SECRET);
    const result = await service.getByUserId(USER_ID, LNG);
    expect(result.panMasked).toBe('ABCDE####F');
  });
});
