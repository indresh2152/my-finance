import { extractAddress, matchesSender } from './sender-match';

describe('extractAddress', () => {
  it('should extract the address from a display-name header', () => {
    expect(extractAddress('HDFC Bank <Alerts@HDFCBank.net>')).toBe('alerts@hdfcbank.net');
  });

  it('should return a bare address lower-cased', () => {
    expect(extractAddress(' Statements@icicibank.com ')).toBe('statements@icicibank.com');
  });
});

describe('matchesSender', () => {
  const senders = ['cc.statements@axisbank.com', '@hdfcbank.net'];

  it('should match an exact address', () => {
    expect(matchesSender('CC.Statements@axisbank.com', senders)).toBe(true);
  });

  it('should match any address at a listed domain', () => {
    expect(matchesSender('emailstatements.cards@hdfcbank.net', senders)).toBe(true);
  });

  it('should not match a look-alike domain', () => {
    expect(matchesSender('x@fakehdfcbank.net', senders)).toBe(false);
  });

  it('should not match an unrelated sender', () => {
    expect(matchesSender('friend@gmail.com', senders)).toBe(false);
  });
});
