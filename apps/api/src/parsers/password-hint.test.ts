import { extractPasswordHint } from './password-hint';

describe('extractPasswordHint', () => {
  it('should return the password sentences about opening the statement', () => {
    const text =
      'Dear customer, your statement is attached. The attachment is password protected. ' +
      'The password is the first 4 letters of your name in capitals followed by DDMM of birth. ' +
      'Never share your OTP or PIN with anyone.';
    expect(extractPasswordHint(text)).toBe(
      'The attachment is password protected. The password is the first 4 letters of your name in capitals followed by DDMM of birth.',
    );
  });

  it('should drop an e.g. example from the hint', () => {
    expect(
      extractPasswordHint(
        'The statement is password protected. The password is your name and DDMM, e.g. RAHU0101. Thanks.',
      ),
    ).toBe('The statement is password protected. The password is your name and DDMM');
  });

  it('should ignore a password warning unrelated to the statement', () => {
    expect(extractPasswordHint('Never share your password with anyone.')).toBeNull();
  });

  it('should cap the hint at 400 characters', () => {
    const hint = extractPasswordHint(
      `To open the statement use this password format: ${'x'.repeat(500)}.`,
    );
    expect(hint).toHaveLength(400);
  });

  it('should read a format rule that never says "password" and skip the worked example', () => {
    const text = [
      'Access your e-Statement by entering the first 4 letters of your name as it appears on your card followed by Date of Birth in DDMM format.',
      'Example:',
      'Name on the Card: S Gupta',
      'Date of Birth: Jan 05, 1992',
      'Password',
      'sgup0501',
      'First 4 letters of your name on the card + Date of Birth in DDMM format',
      '(Enter all letters in lowercase without adding any special characters, spaces or salutation).',
    ].join('\n');
    expect(extractPasswordHint(text)).toBe(
      'Access your e-Statement by entering the first 4 letters of your name as it appears on your card followed by Date of Birth in DDMM format. ' +
        'First 4 letters of your name on the card + Date of Birth in DDMM format ' +
        '(Enter all letters in lowercase without adding any special characters, spaces or salutation).',
    );
  });

  it.each([
    [
      'a PAN rule with a case rule',
      'Your statement is attached as a PDF. To open it, use your PAN. Enter it in upper case.',
      'To open it, use your PAN. Enter it in upper case.',
    ],
    [
      'a last-digits rule',
      'Please open the statement using your DOB in DDMMYYYY format and the last 4 digits of your card.',
      'Please open the statement using your DOB in DDMMYYYY format and the last 4 digits of your card.',
    ],
    [
      'a password rule right after a statement sentence',
      'Your statement is attached. Your password is your Customer ID. Thank you for banking with us.',
      'Your password is your Customer ID.',
    ],
    [
      'a rule that mentions net banking',
      'Your statement is attached. The password is your Customer ID used to login to NetBanking.',
      'The password is your Customer ID used to login to NetBanking.',
    ],
    [
      'a rule that mentions "do not use spaces"',
      'Your statement is attached. The password is the first 4 letters of your name followed by DDMM (do not use spaces).',
      'The password is the first 4 letters of your name followed by DDMM (do not use spaces).',
    ],
    [
      'a rule that mentions a name rule',
      'Your statement is attached. The password is your name in lowercase.',
      'The password is your name in lowercase.',
    ],
    [
      'a rule that mentions a mobile number rule',
      'Your statement is attached. The password is your registered mobile number.',
      'The password is your registered mobile number.',
    ],
    [
      'a rule that mentions a number word',
      'Your statement is attached. Open it with the first four letters of your name.',
      'Open it with the first four letters of your name.',
    ],
  ])('should read %s', (_case, text, expected) => {
    expect(extractPasswordHint(text)).toBe(expected);
  });

  it('should leave out example dates and security warnings', () => {
    const text =
      'The statement is password protected. The password is your DOB in DDMMYYYY format.\n' +
      'For example, if your date of birth is 05/01/1992, enter 05011992.\n' +
      'Never share your password with anyone.';
    expect(extractPasswordHint(text)).toBe(
      'The statement is password protected. The password is your DOB in DDMMYYYY format.',
    );
  });

  const RULE = 'Your statement is attached. The password is your DOB in DDMMYYYY format.';
  const RULE_HINT = 'The password is your DOB in DDMMYYYY format.';

  it.each([
    ['a labelled example password', `${RULE}\nExample:\nPassword : sgup0501`],
    ['an example password in a table row', `${RULE}\nYour Password sgup0501`],
    [
      'a sentence-style worked example',
      `${RULE}\nExample: Name: Rahul Sharma, DOB 5th January 1992\nSo your password will be RAHU0501.`,
    ],
    ['an "if your DOB is" example', `${RULE} If your DOB is 05/01, enter sgup0501.`],
    ['an example DOB without a year', `${RULE}\nDate of Birth : 5 January`],
    ['the real Customer ID', `${RULE}\nCustomer ID : 123456789`],
    [
      'a warning and log-in help after the rule',
      `${RULE} Never disclose your password to anyone. Forgot your net banking password? Reset it.`,
    ],
    [
      'an unrelated sentence after the rule',
      `${RULE} Pay by the due date. Use your PAN in capitals.`,
    ],
    ['a lender name with "Capital"', `${RULE} ABC Capital thanks you.`],
    ['an example DOB written "January 5th"', `${RULE}\nExample:\nDate of Birth: January 5th`],
    ['an example DOB written "5th of January"', `${RULE}\nExample:\nDOB is 5th of January`],
    ['an example DOB written "05-Jan"', `${RULE}\nExample:\nDate of Birth: 05-Jan`],
    [
      'a footer after an example block',
      `${RULE}\nExample:\nPassword: x\nLink your PAN with Aadhaar today to avoid penalties.`,
    ],
    ['an identity-only promo after the rule', `${RULE} Link your PAN with Aadhaar today.`],
    ['an example DOB with spaces', `${RULE}\nExample:\nDOB: 05 01`],
    ['an example DOB with no separator', `${RULE}\nExample:\nDate of Birth: 05Jan`],
    ['an example DOB written "January, 05"', `${RULE}\nExample:\nDate of Birth : January, 05`],
    ['an example two-digit year', `${RULE}\nExample:\nYear of birth: 92`],
    ['an example ordinal day', `${RULE}\nExample:\nDate of Birth: 5th`],
    ['a spaced example password', `${RULE}\nExample:\nPassword: RAHU 05 01`],
    ['a short example password', `${RULE}\nExample:\nThe password will be ra05`],
  ])('should never keep %s', (_case, text) => {
    expect(extractPasswordHint(text)).toBe(RULE_HINT);
  });

  it.each([
    [
      'a net-banking log-in line',
      'Login to net banking with your Customer ID and password. Your statement is attached. The password is your PAN in upper case.',
      'The password is your PAN in upper case.',
    ],
    [
      'a "do not use" warning',
      'Please do not use your date of birth as your password. Your statement is attached; the password is your PAN.',
      'Your statement is attached; the password is your PAN.',
    ],
    [
      'a promo that opens something with a PAN',
      'Open an FD instantly with just your PAN. Your statement is attached. The password is your DOB in DDMM format.',
      'The password is your DOB in DDMM format.',
    ],
    [
      'a promo that accesses offers with a Customer ID',
      'Access exclusive offers using your Customer ID on our app. Your statement is attached. The password is your DOB in DDMM format.',
      'The password is your DOB in DDMM format.',
    ],
  ])('should not start the hint at %s', (_case, text, expected) => {
    expect(extractPasswordHint(text)).toBe(expected);
  });

  it('should stay fast on long hostile runs', () => {
    const started = Date.now();
    extractPasswordHint(`To open the statement ${'x'.repeat(20_000)}`);
    extractPasswordHint(`To open the statement, use your PAN${', '.repeat(10_000)}e.g.`);
    expect(Date.now() - started).toBeLessThan(1000);
  });

  it('should cut a warning off the end of the rule sentence', () => {
    expect(
      extractPasswordHint(
        'Your statement is attached. The password is your DOB in DDMMYYYY format; do not share it with anyone.',
      ),
    ).toBe('The password is your DOB in DDMMYYYY format');
  });

  it('should keep a fallback rule that starts with "If your PAN"', () => {
    const text =
      'Your statement is attached. The password is your PAN. If your PAN is not updated, the password is your date of birth in DDMMYYYY format.';
    expect(extractPasswordHint(text)).toBe(
      'The password is your PAN. If your PAN is not updated, the password is your date of birth in DDMMYYYY format.',
    );
  });

  it('should keep count phrases, the only digits a rule has', () => {
    const rule =
      'The password is the first 4 letters of your name and the last 4 digits of your 10-digit mobile number.';
    expect(extractPasswordHint(`Your statement is attached. ${rule}`)).toBe(rule);
  });

  it.each([
    ['a PAN promo', 'Update your PAN to keep receiving your statement on email.'],
    ['an SMS alert note', 'Statement alerts are sent to your registered mobile number via SMS.'],
  ])('should not start the hint at %s', (_case, promo) => {
    expect(extractPasswordHint(`${promo} The statement is password protected.`)).toBe(
      'The statement is password protected.',
    );
  });

  it('should never keep digits of another script', () => {
    expect(
      extractPasswordHint(
        'Open the attached statement with the password: first 4 letters of name and last ४ digits ५६४८ of card.',
      ),
    ).toBeNull();
  });

  it('should drop a greeting and an "i.e." value on the rule line', () => {
    const hint = extractPasswordHint(
      'Dear Indresh Singh Rathore, your attached statement is password protected. The password is the first 4 letters of your name i.e. INDR followed by your DDMM.',
    );
    expect(hint).toBe(
      'your attached statement is password protected. The password is the first 4 letters of your name',
    );
  });

  it.each([
    'Dear Mr. Indresh Singh Rathore, your attached statement is password protected.',
    'Indresh Singh Rathore, your attached statement is password protected.',
    'Dear Indresh Singh Rathore: your attached statement is password protected.',
  ])('should leave the name out of %p', (text) => {
    expect(extractPasswordHint(text)).toBe('your attached statement is password protected.');
  });

  it('should cut a "such as" value', () => {
    expect(
      extractPasswordHint(
        'Your statement is attached. The password is your name such as INDRESHRATHORE in capitals.',
      ),
    ).toBe('The password is your name');
  });

  it.each(['Option 1:', 'Step 2 -', '3.'])('should read a rule numbered %p', (number) => {
    const rule = 'Enter the first four letters of your name in UPPER CASE.';
    expect(extractPasswordHint(`${number} ${rule}`)).toBe(rule);
  });

  it('should cut an "eg" example written without dots', () => {
    expect(
      extractPasswordHint(
        'Your e-statement is attached. Your password is the first four letters of your name in capitals followed by DDMM of birth, eg RAKE2801.',
      ),
    ).toBe(
      'Your password is the first four letters of your name in capitals followed by DDMM of birth',
    );
  });

  it('should not start the hint at a password rule with no statement around it', () => {
    expect(extractPasswordHint('Your password is your Customer ID. Thank you.')).toBeNull();
  });

  it('should ignore format words that are not about the statement', () => {
    expect(extractPasswordHint('Update your PAN and date of birth in the app.')).toBeNull();
  });
});
