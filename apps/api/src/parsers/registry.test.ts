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

  it('should collect subject keywords, or none when any parser has no keywords', () => {
    const withKeywords = (key: string, keywords: string[]): EmailParser => ({
      ...makeParser(key, ['@x.com'], 's'),
      subjectKeywords: keywords,
    });
    expect(
      new ParserRegistry([
        withKeywords('a', ['Statement']),
        withKeywords('b', ['statement', 'balance']),
      ]).allSubjectKeywords(),
    ).toEqual(['statement', 'balance']);
    expect(
      new ParserRegistry([
        withKeywords('a', ['statement']),
        makeParser('b', ['@y.com'], 's'),
      ]).allSubjectKeywords(),
    ).toEqual([]);
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

  it('should ship the card statement parsers with unique keys', () => {
    expect(new ParserRegistry(BANK_PARSERS).allSenders()).toEqual(
      expect.arrayContaining(['@hdfcbank.net', '@sbicard.com']),
    );
    expect(BANK_PARSERS).toHaveLength(6);
    expect(new ParserRegistry(BANK_PARSERS).allSubjectKeywords()).toEqual([
      'statement',
      'estatement',
    ]);
  });
});
