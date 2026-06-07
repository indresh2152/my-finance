import { AuthService } from './auth.service';
import { AppError } from '../middleware/error.middleware';
import bcrypt from 'bcryptjs';

const LNG = 'en';

const makeDb = (): { query: jest.Mock } => ({ query: jest.fn() });

describe('AuthService.register', () => {
  it('should throw USERNAME_TAKEN when username exists', async () => {
    const db = makeDb();
    db.query.mockResolvedValueOnce({ rows: [{ id: 'existing' }] });
    const service = new AuthService(db as never, 'secret', 'refresh-secret');
    await expect(service.register('taken', 'e@e.com', 'P@ss1234', LNG)).rejects.toThrow(
      expect.objectContaining({ code: 'USERNAME_TAKEN' }),
    );
  });

  it('should throw EMAIL_TAKEN when email exists', async () => {
    const db = makeDb();
    db.query
      .mockResolvedValueOnce({ rows: [] }) // username check
      .mockResolvedValueOnce({ rows: [{ id: 'existing' }] }); // email check
    const service = new AuthService(db as never, 'secret', 'refresh-secret');
    await expect(service.register('newuser', 'taken@e.com', 'P@ss1234', LNG)).rejects.toThrow(
      expect.objectContaining({ code: 'EMAIL_TAKEN' }),
    );
  });

  it('should return tokens and user on successful registration', async () => {
    const db = makeDb();
    db.query
      .mockResolvedValueOnce({ rows: [] }) // username check
      .mockResolvedValueOnce({ rows: [] }) // email check
      .mockResolvedValueOnce({ rows: [{ id: 'new-uuid', username: 'newuser', email: 'new@e.com' }] }) // INSERT
      .mockResolvedValueOnce({ rows: [] }); // INSERT refresh_token
    const service = new AuthService(db as never, 'test-secret-32-chars-minimum!!', 'test-refresh-32-chars-min!!');
    const { tokens, user } = await service.register('newuser', 'new@e.com', 'P@ss1234', LNG);
    expect(tokens.accessToken).toBeTruthy();
    expect(tokens.refreshToken).toBeTruthy();
    expect(user.hasPan).toBe(false);
  });
});

describe('AuthService.login', () => {
  it('should throw INVALID_CREDENTIALS when user does not exist', async () => {
    const db = makeDb();
    db.query.mockResolvedValueOnce({ rows: [] });
    const service = new AuthService(db as never, 'secret', 'refresh-secret');
    await expect(service.login('nobody', 'pass', LNG)).rejects.toThrow(
      expect.objectContaining({ code: 'INVALID_CREDENTIALS' }),
    );
  });

  it('should throw INVALID_CREDENTIALS when password is wrong', async () => {
    const db = makeDb();
    const hash = await bcrypt.hash('correct-password', 12);
    db.query.mockResolvedValueOnce({
      rows: [{ id: '1', username: 'u', email: 'e@e.com', password_hash: hash, pan_masked: null }],
    });
    const service = new AuthService(db as never, 'secret', 'refresh-secret');
    await expect(service.login('u', 'wrong-password', LNG)).rejects.toThrow(
      expect.objectContaining({ code: 'INVALID_CREDENTIALS' }),
    );
  });

  it('should return tokens and user on successful login', async () => {
    const db = makeDb();
    const hash = await bcrypt.hash('P@ss1234', 12);
    db.query
      .mockResolvedValueOnce({
        rows: [{ id: 'uid', username: 'u', email: 'e@e.com', password_hash: hash, pan_masked: null }],
      })
      .mockResolvedValueOnce({ rows: [] }); // INSERT refresh_token
    const service = new AuthService(db as never, 'test-secret-32-chars-minimum!!', 'test-refresh-32-chars-min!!');
    const { tokens, user } = await service.login('u', 'P@ss1234', LNG);
    expect(tokens.accessToken).toBeTruthy();
    expect(user.hasPan).toBe(false);
  });
});

describe('AuthService.refresh', () => {
  it('should throw REFRESH_TOKEN_INVALID for a malformed token', async () => {
    const db = makeDb();
    const service = new AuthService(db as never, 'secret', 'test-refresh-32-chars-min!!');
    await expect(service.refresh('not-a-jwt', LNG)).rejects.toThrow(
      expect.objectContaining({ code: 'REFRESH_TOKEN_INVALID' }),
    );
  });

  it('should throw REFRESH_TOKEN_INVALID when token is not found in DB', async () => {
    const db = makeDb();
    db.query.mockResolvedValueOnce({ rows: [] });
    const { signRefreshToken } = await import('../utils/token.utils');
    const token = signRefreshToken('uid', 'test-refresh-32-chars-min!!');
    const service = new AuthService(db as never, 'test-secret-32-chars-minimum!!', 'test-refresh-32-chars-min!!');
    await expect(service.refresh(token, LNG)).rejects.toThrow(
      expect.objectContaining({ code: 'REFRESH_TOKEN_INVALID' }),
    );
  });

  it('should throw REFRESH_TOKEN_INVALID for a revoked token and revoke all sessions', async () => {
    const db = makeDb();
    const { signRefreshToken } = await import('../utils/token.utils');
    const token = signRefreshToken('uid', 'test-refresh-32-chars-min!!');
    db.query
      .mockResolvedValueOnce({ rows: [{ id: 'rt-1', revoked_at: '2024-01-01' }] })
      .mockResolvedValueOnce({ rows: [] }); // revoke all
    const service = new AuthService(db as never, 'test-secret-32-chars-minimum!!', 'test-refresh-32-chars-min!!');
    await expect(service.refresh(token, LNG)).rejects.toThrow(AppError);
    expect(db.query).toHaveBeenCalledTimes(2);
  });
});

describe('AuthService.logout', () => {
  it('should call UPDATE to revoke the token', async () => {
    const db = makeDb();
    db.query.mockResolvedValueOnce({ rows: [] });
    const service = new AuthService(db as never, 'secret', 'refresh-secret');
    await service.logout('some-raw-token');
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE refresh_tokens SET revoked_at'),
      expect.any(Array),
    );
  });
});
