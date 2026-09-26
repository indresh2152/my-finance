import { ParserRegistry, BANK_PARSERS } from './registry';
import type { EmailMeta, EmailParser } from './email-parser';

const makeParser = (key: string, senders: string[], subjectWord: string): EmailParser => ({
  key,
  senders,
  matches: ({ subject }: EmailMeta): boolean => subject.includes(subjectWord),
  parse: (): null => null,
});

describe('ParserRegistry', () => {
  it('should reject duplicate parser keys', () => {
    expect(
      () =>
        new ParserRegistry([makeParser('a', ['@x.com'], 's'), makeParser('a', ['@y.com'], 's')]),
    ).toThrow('Duplicate parser key: a');
  });

  it('should return unique lower-cased senders', () => {
    const registry = new ParserRegistry([
      makeParser('a', ['@HDFCBank.net', 'x@axisbank.com'], 's'),
      makeParser('b', ['@hdfcbank.net'], 's'),
    ]);
    expect(registry.allSenders()).toEqual(['@hdfcbank.net', 'x@axisbank.com']);
  });

  it('should find the parser whose sender and subject match', () => {
    const statement = makeParser('hdfc.cc-statement', ['@hdfcbank.net'], 'Statement');
    const registry = new ParserRegistry([statement]);
    expect(registry.find({ from: 'emailstatements@hdfcbank.net', subject: 'Your Statement' })).toBe(
      statement,
    );
    expect(registry.find({ from: 'emailstatements@hdfcbank.net', subject: 'OTP' })).toBeNull();
    expect(registry.find({ from: 'x@other.com', subject: 'Statement' })).toBeNull();
  });

  it('should ship with no bank parsers in phase 1', () => {
    expect(new ParserRegistry(BANK_PARSERS).allSenders()).toEqual([]);
  });
});
