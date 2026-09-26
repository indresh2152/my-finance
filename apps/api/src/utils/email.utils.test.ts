import {
  normaliseEmail,
  emailDomain,
  hashEmail,
  maskEmail,
  canonicaliseEmail,
} from './email.utils';

describe('email utils', () => {
  it('should trim and lower-case an email', () => {
    expect(normaliseEmail('  John.Doe@Gmail.COM ')).toBe('john.doe@gmail.com');
  });

  it('should return the lower-cased domain', () => {
    expect(emailDomain('a@Company.IN')).toBe('company.in');
  });

  it('should return an empty domain when there is no @', () => {
    expect(emailDomain('not-an-email')).toBe('');
  });

  it('should hash case-insensitively with the secret', () => {
    expect(hashEmail('A@B.com', 'secret')).toBe(hashEmail('a@b.com', 'secret'));
    expect(hashEmail('a@b.com', 'secret')).not.toBe(hashEmail('a@b.com', 'other'));
    expect(hashEmail('a@b.com', 'secret')).toMatch(/^[0-9a-f]{64}$/);
  });

  it('should mask all but the first two characters of the local part', () => {
    expect(maskEmail('indresh@gmail.com')).toBe('in****@gmail.com');
    expect(maskEmail('a@x.com')).toBe('a****@x.com');
  });

  it('should treat googlemail.com as gmail.com when comparing accounts', () => {
    expect(canonicaliseEmail(' User@GoogleMail.com ')).toBe('user@gmail.com');
    expect(canonicaliseEmail('user@company.in')).toBe('user@company.in');
  });
});
