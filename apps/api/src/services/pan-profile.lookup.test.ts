import { requirePanProfileId } from './pan-profile.lookup';
import { AppError } from '../middleware/error.middleware';

describe('requirePanProfileId', () => {
  it('should return the PAN profile id', async () => {
    const db = { query: jest.fn().mockResolvedValue({ rows: [{ id: 'pan-1' }] }) };
    await expect(requirePanProfileId(db, 'user-1', 'en')).resolves.toBe('pan-1');
    expect(db.query).toHaveBeenCalledWith(expect.stringContaining('FROM pan_profiles'), ['user-1']);
  });

  it('should throw 403 PAN_NOT_REGISTERED when the user has no PAN', async () => {
    const db = { query: jest.fn().mockResolvedValue({ rows: [] }) };
    const error = await requirePanProfileId(db, 'user-1', 'en').catch((err: unknown) => err);
    expect(error).toBeInstanceOf(AppError);
    expect(error).toMatchObject({ code: 'PAN_NOT_REGISTERED', status: 403 });
  });
});
