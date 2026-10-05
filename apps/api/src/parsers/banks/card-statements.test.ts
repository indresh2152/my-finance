import type { ParsedEmail } from '../../services/mailbox/providers/mail-provider';
import { ParserRegistry } from '../registry';
import { htmlToText } from '../../utils/html-to-text';
import { CARD_STATEMENT_PARSERS } from './card-statements';

// Synthetic emails following each bank's publicly known wording; no real samples exist yet.
const registry = new ParserRegistry(CARD_STATEMENT_PARSERS);
const PDF = { locator: 'att-1', filename: 'statement.pdf', mimeType: 'application/pdf' };

const email = (from: string, subject: string, text: string): ParsedEmail => ({
  id: 'msg-1',
  from,
  subject,
  receivedAt: new Date('2026-09-06T04:00:00Z'),
  text,
  attachments: [PDF],
});

const FIXTURES: Array<[string, ParsedEmail, Record<string, unknown>]> = [
  [
    'HDFC',
    email(
      'emailstatements.cards@hdfcbank.net',
      'Your HDFC Bank Regalia Credit Card Statement for September 2026',
      [
        'Credit Card No. 4375 XXXX XXXX 1234',
        'Statement Date: 05/09/2026',
        'Total Amount Due: Rs. 12,345.67',
        'Minimum Amount Due: Rs. 620.00',
        'Payment Due Date: 25/09/2026',
        'To open the attached statement, enter the first 4 letters of your name in capitals and the last 4 digits of your card as the password.',
      ].join('\n'),
    ),
    {
      issuingBank: 'HDFC',
      last4: '1234',
      statementDate: '2026-09-05',
      dueDate: '2026-09-25',
      totalDue: 12345.67,
      minDue: 620,
    },
  ],
  [
    'ICICI',
    email(
      'credit_cards@icicibank.com',
      'ICICI Bank Credit Card XX5678 Statement for the period ending 04 Sep 2026',
      [
        'Your ICICI Bank Credit Card XX5678 statement is attached.',
        'Total Amount due: INR 8,000.00',
        'Minimum Amount due: INR 400.00',
        'Payment Due Date: September 22, 2026',
        'The statement PDF is password protected. Password: first four letters of your name in lower case followed by your date of birth in DDMM format.',
      ].join('\n'),
    ),
    {
      issuingBank: 'ICICI',
      last4: '5678',
      statementDate: '2026-09-04',
      dueDate: '2026-09-22',
      totalDue: 8000,
      minDue: 400,
    },
  ],
  [
    'SBI Card',
    email(
      'statements@sbicard.com',
      'Your SBI Card Monthly Statement - Sep 2026',
      [
        'SBI Card ending 9012',
        'Statement Date 03 Sep 2026',
        'Total Amount Due ₹25,000.00',
        'Minimum Amount Due ₹1,250.00',
        'Payment Due Date 23 Sep 2026',
        'To open your e-statement, use your date of birth (DDMMYYYY) and last 4 digits of your card as the password.',
      ].join('\n'),
    ),
    {
      issuingBank: 'SBI_CARD',
      last4: '9012',
      statementDate: '2026-09-03',
      dueDate: '2026-09-23',
      totalDue: 25000,
      minDue: 1250,
    },
  ],
  [
    'Axis',
    email(
      'cc.statements@axisbank.com',
      'Your Axis Bank Credit Card Statement ending XX3456',
      [
        'Card No: XXXX XXXX XXXX 3456',
        'Statement Date: 07-09-2026',
        'Total Payment Due: Rs. 3,210.50',
        'Minimum Payment Due: Rs. 200.00',
        'Payment Due Date: 27-09-2026',
        'Your statement is password protected. The password is the first 4 letters of your name (in capitals) followed by DDMM of your date of birth.',
      ].join('\n'),
    ),
    {
      issuingBank: 'AXIS',
      last4: '3456',
      statementDate: '2026-09-07',
      dueDate: '2026-09-27',
      totalDue: 3210.5,
      minDue: 200,
    },
  ],
  [
    'Kotak',
    email(
      'cardstatement@kotak.com',
      'Kotak Credit Card Statement for September 2026',
      [
        'Credit Card Number: XXXXXXXXXXXX7890',
        'Statement Date: 08-Sep-2026',
        'Total Amount Due: Rs. 0.00 Cr',
        'Minimum Amount Due: Rs. 0.00',
        'Due Date: 28-Sep-2026',
        'The attached statement can be opened with your CRN as the password.',
      ].join('\n'),
    ),
    {
      issuingBank: 'KOTAK',
      last4: '7890',
      statementDate: '2026-09-08',
      dueDate: '2026-09-28',
      totalDue: 0,
      minDue: 0,
    },
  ],
];

describe('card statement parsers', () => {
  it.each(FIXTURES)('should parse a %s statement email', (_bank, fixture, expected) => {
    const parser = registry.find({ from: fixture.from, subject: fixture.subject });
    const result = parser?.parse(fixture);
    expect(result).toMatchObject({
      kind: 'CARD_STATEMENT',
      ...expected,
      attachment: { locator: 'att-1', filename: 'statement.pdf' },
    });
    expect(result).toHaveProperty('passwordHint', expect.stringMatching(/password/i));
  });

  it('should parse the layout of a real Amazon Pay ICICI statement email', () => {
    const html = [
      '<h1>Credit Card Statement</h1>',
      '<div><h2>Payment due</h2><p>by October 16, 2026</p></div>',
      '<table><tr><td>ICICI Bank Credit Card</td><td>XX0019</td></tr></table>',
      '<p>Minimum Amount Due: &#x20B9;770.00</p>',
      '<p>Total Amount Due:</p><p><b>&#x20B9;15,398.51</b></p>',
      '<p>Pay now using:</p>',
      '<p>Access your <b>e-Statement</b> by entering the first 4 letters of your <b>name</b> as it appears on your card followed by Date of Birth in <b>DDMM</b> format.</p>',
      '<p>Example:</p><p>Name on the Card: S Gupta</p><p>Date of Birth: Jan 05, 1992</p>',
      '<p>Password</p><p>sgup0501</p>',
      '<p>First 4 letters of your name on the card + Date of Birth in DDMM format<br>',
      '(Enter all letters in lowercase without adding any special characters, spaces or salutation).</p>',
    ].join('');
    const fixture = email(
      'credit_cards@icici.bank.in',
      'Amazon Pay ICICI Bank Credit Card Statement for the period August 29, 2026 to September 28, 2026',
      htmlToText(html),
    );
    const parser = registry.find({ from: fixture.from, subject: fixture.subject });
    expect(parser?.parse(fixture)).toMatchObject({
      issuingBank: 'ICICI',
      last4: '0019',
      statementDate: '2026-09-28',
      dueDate: '2026-10-16',
      totalDue: 15398.51,
      minDue: 770,
      passwordHint: expect.stringMatching(/^Access your e-Statement .* in lowercase .*\)\.$/),
    });
    // The worked example's password, name and birth year never reach the stored record.
    expect(JSON.stringify(parser?.parse(fixture))).not.toMatch(/sgup0501|Gupta|1992/);
  });

  it.each([
    ['a savings account statement', 'alerts@hdfcbank.net', 'Your HDFC Bank Account Statement'],
    [
      'a card transaction alert',
      'alerts@icicibank.com',
      'Transaction alert for your ICICI Bank Credit Card',
    ],
    ['a look-alike sender', 'statements@fakesbicard.com', 'Your SBI Card Monthly Statement'],
    [
      'a OneCard statement for another bank',
      'statement@getonecard.app',
      'BOB One Credit Card statement for September 2026',
    ],
  ])('should not pick a parser for %s', (_case, from, subject) => {
    expect(registry.find({ from, subject })).toBeNull();
  });

  it('should accept a Federal subject in either word order', () => {
    const from = 'scapiacards@federalbank.co.in';
    expect(
      registry.find({ from, subject: 'Statement for your Federal Bank Scapia credit card' }),
    ).not.toBeNull();
  });

  it('should have one parser per bank', () => {
    expect(CARD_STATEMENT_PARSERS.map((parser) => parser.key)).toEqual([
      'hdfc.cc-statement',
      'icici.cc-statement',
      'sbi_card.cc-statement',
      'axis.cc-statement',
      'kotak.cc-statement',
      'federal.cc-statement',
    ]);
  });
});

/**
 * Real statement emails (October 2026), as their bodies read once converted to text. Example names,
 * dates and passwords are the banks' own samples; long footers are trimmed.
 */
describe('real card statement emails', () => {
  const real = (
    from: string,
    subject: string,
    receivedAt: string,
    lines: readonly string[],
    attachments: ParsedEmail['attachments'] = [PDF],
  ): ParsedEmail => ({
    id: 'msg-real',
    from,
    subject,
    receivedAt: new Date(receivedAt),
    text: lines.join('\n'),
    attachments,
  });

  const FIXTURES: Array<[string, ParsedEmail, Record<string, unknown>]> = [
    [
      'ICICI Coral',
      real(
        'credit_cards@icici.bank.in',
        'ICICI Bank Credit Card Statement for the period September 3 2026 to October 2 2026',
        '2026-10-03T13:45:00Z',
        [
          'Credit Card Statement',
          'Payment due',
          'by October 20, 2026',
          'ICICI Bank Credit Card XX4008',
          'Minimum Amount Due: ₹7,740.00',
          'Total Amount Due:',
          '₹41,811.24',
          'Pay now:',
          'iMobile Net Banking UPI*',
          'Other Options (Cheque/NEFT/ATM)',
          '*Pay from any UPI-enabled app to the ICICI Bank UPI ID:',
          'ccpay.<10-digit registered mobile number><last 4 digits of Credit Card number>@icici',
          'Pre-approved Loan and Card offers',
          'Access your e-statement by entering the first 4 letters of your name as it appears on your card followed by Date of Birth in DDMM format.',
          'Name: Sujit Gupta',
          'Date of Birth: Jan 05, 1992',
          'Password',
          'suji0501',
          'First 4 letters of your name on the card + Date of Birth in DDMM format',
          '(Enter all letters in lowercase without adding any special characters, spaces or salutation).',
          'Plus Card',
          'Share the joy & benefits with your loved ones',
          'This is a system generated e-mail. Please do not reply.',
        ],
      ),
      {
        issuingBank: 'ICICI',
        last4: '4008',
        statementDate: '2026-10-02',
        dueDate: '2026-10-20',
        totalDue: 41811.24,
        minDue: 7740,
        passwordHint:
          'Access your e-statement by entering the first 4 letters of your name as it appears on your card followed by Date of Birth in DDMM format. ' +
          'First 4 letters of your name on the card + Date of Birth in DDMM format ' +
          '(Enter all letters in lowercase without adding any special characters, spaces or salutation).',
      },
    ],
    [
      'Kotak Zen with nothing due',
      real(
        'cardstatement@kotak.bank.in',
        'Aug-2026 Statement for Zen Credit Card X0958',
        '2026-08-26T05:13:00Z',
        [
          'If you are unable to view the below e-mailer, please click here.',
          'Your statement for Zen Credit Card X0958 is ready!',
          'Dear Indresh Singh Rathore,',
          'Here is your Credit Card statement for Aug-2026. Click here to view the detailed statement.',
          'Total Amount',
          'Due (Rs.)',
          '0.00',
          'Minimum',
          'Amount Due (Rs.)',
          '0.00',
          'Payment Due',
          'Date',
          'No Payment Due',
          'Pay Now',
          'You can use any of the below options to access your statement',
          'Option 1: Via Name & Date of Birth',
          'Enter the first 4 letters of your name as mentioned on your Kotak Credit Card in lowercase only, followed by your date of birth in DDMM format. Please note that spaces and special characters will be counted as part of the password, but they should NOT be typed.',
          'Name',
          'Raj Bhargava',
          'Date of Birth',
          '28-08-1992',
          'Password',
          'raj2808',
          'Space after Raj is NOT typed, but is counted by default',
          'OR',
          'Option 2: Via CRN & Date of Birth',
          'Enter Customer Relationship Number (CRN) along with your date of birth in DDMM format. Please remove spaces and special characters, if any.',
          'CRN',
          '5678123',
          'Password',
          '56781232808',
          'Please maintain sufficient funds in your linked bank account if auto-debit is active.',
          'Payment will be debited from your bank account and credited to your Credit Card on the due date.',
        ],
        [{ locator: 'att-1', filename: '94XXXXXXXXXXX602.pdf', mimeType: 'application/pdf' }],
      ),
      {
        issuingBank: 'KOTAK',
        last4: '0958',
        cardName: 'Zen',
        statementDate: '2026-08-26',
        totalDue: 0,
        minDue: 0,
        passwordHint:
          'Enter the first 4 letters of your name as mentioned on your Kotak Credit Card in lowercase only, followed by your date of birth in DDMM format. ' +
          'Please note that spaces and special characters will be counted as part of the password, but they should NOT be typed.',
        attachment: { locator: 'att-1', filename: '94XXXXXXXXXXX602.pdf' },
      },
    ],
    [
      'HDFC Pixel Play without card digits',
      real(
        'alerts@hdfcbank.net',
        'Your HDFC Bank Pixel Play Credit Card Statement for Sep 2026',
        '2026-10-03T05:27:00Z',
        [
          'Your Pixel Play Credit Card E-Statement generated',
          'Dear Customer,',
          'We trust that your experience of using your HDFC Bank Pixel Cards has been enjoyable. We are pleased to provide you with a summary of your account statement.',
          'Total Amount Due',
          '₹14153.13',
          'Minimum Amount Due',
          '₹707.66',
          'Payment Due Date',
          '22-10-2026',
          'Pay With PayZapp',
          'Kindly be informed that this is a consolidated account statement for your PIXEL Cards.',
          'How to view your E-Statement',
          'To open the statement, enter the first 4 letters of your name on the card in capital case followed by The date and month (DDMM) of your Date of Birth (Or) The last 4 digits of your Rupay card number.',
          'For example:',
          'If the name is Rakesh Patel, the date of birth is 28/01/2000 and the last 4 digits of the card is 5648 then either RAKE2801 or RAKE5648 can be used to open the statement',
          'Convenient Payment Options',
          'You can easily pay your HDFC Pixel Credit Card outstanding using UPI or a debit card through the Pixel Credit Card section in the PayZapp app.',
          'Please do not reply to this email.',
        ],
      ),
      {
        issuingBank: 'HDFC',
        cardName: 'Pixel Play',
        statementDate: '2026-10-03',
        dueDate: '2026-10-22',
        totalDue: 14153.13,
        minDue: 707.66,
        passwordHint:
          'To open the statement, enter the first 4 letters of your name on the card in capital case followed by The date and month (DDMM) of your Date of Birth (Or) The last 4 digits of your Rupay card number.',
      },
    ],
    [
      'Scapia Federal without card digits',
      real(
        'scapiacards@federalbank.co.in',
        'Your Scapia Federal credit card statement for September, 2026',
        '2026-09-14T05:30:00Z',
        [
          'Your credit card statement for',
          '14 Aug 2026 - 13 Sep 2026 is here',
          'Check out everything you need to know',
          'Statement date: 14 Sep 2026',
          'Due date: 02 Oct 2026',
          'View statement',
          'Total amount due',
          '₹1,299.00',
          'Minimum amount due',
          '₹64.95',
          'Rewards earned and converted to scapia coins 130',
          'Now you can pay up to ₹5 lakhs via UPI on Scapia',
          'Find your statement password under card controls on the Scapia app or website',
          'Repayments through other apps may delay bill clearance, and penal interest and charges may apply if the payment is not received by the due date.',
        ],
      ),
      {
        issuingBank: 'FEDERAL',
        cardName: 'Scapia',
        statementDate: '2026-09-14',
        dueDate: '2026-10-02',
        totalDue: 1299,
        minDue: 64.95,
        passwordHint:
          'Find your statement password under card controls on the Scapia app or website',
      },
    ],
    [
      'Axis Flipkart with a table summary and two-digit mask',
      real(
        'cc.statements@axis.bank.in',
        'Flipkart Axis Bank Credit Card Statement ending XX52 - September 2026',
        '2026-09-14T05:00:00Z',
        [
          'Axis Bank',
          'Dear Customer,',
          'Please find enclosed your credit card statement for SEPTEMBER 2026.',
          'Total Amount Due',
          'INR Minimum Amount Due',
          '(INR) Payment Due Date',
          '(DD-MM-YYYY)',
          '488 Dr 100 Dr 03/10/2026',
          'How do I access my statement?',
          'You can use any one of the options below to access your statement',
          'Option 1: Enter the first four letters of your name in UPPER CASE (as it appears on your credit card account. Avoid spaces and periods, if any) and your date of birth in DDMM format.',
          'For example:',
          'Name',
          'C.K. Ajay Kumar + Date of Birth',
          '11.02.1985',
          'Password CKAJ1102',
          'Option 2: Enter the first four letters of your name in UPPER CASE (as it appears on your credit card account. Ignore spaces and periods, if any) and the last four digits of your credit card number.',
          'Name',
          'C.K. Ajay Kumar + credit card number',
          '009001234',
          'Password CKAJ1234',
          'Warm regards,',
          'Axis Bank',
          'Manage & pay your credit card bills using Mobile Banking App, open',
          'Need Help?',
          'visit axis.bank.in/support',
          'Interest will be applicable if your total amount due is not paid on or before the due date.',
          'Make Big Purchases on Axis Bank Credit Card and convert the purchases above INR 1,500 into easy EMIs.',
        ],
      ),
      {
        issuingBank: 'AXIS',
        cardName: 'Flipkart',
        statementDate: '2026-09-14',
        dueDate: '2026-10-03',
        totalDue: 488,
        minDue: 100,
        passwordHint:
          'Enter the first four letters of your name in UPPER CASE (as it appears on your credit card account. Avoid spaces and periods, if any) and your date of birth in DDMM format. ' +
          'Enter the first four letters of your name in UPPER CASE (as it appears on your credit card account. Ignore spaces and periods, if any) and the last four digits of your credit card number.',
      },
    ],
    [
      'Federal OneCard without card digits or a PDF',
      real(
        'statement@getonecard.app',
        'Federal Bank One Credit Card statement for September 2026',
        '2026-09-14T11:14:00Z',
        [
          'Your Federal Bank One Credit Card statement for September 2026',
          'View Statement',
          'Hi Indresh singh,',
          'We hope you enjoyed using your Federal Bank One Credit Card last month. Just a quick heads-up that the statement for September is now ready, and you can view it in the OneCard app.',
          'Here’s a quick summary of your statement for September.',
          'Total amount due',
          '₹ 2,427.31',
          'Minimum amount due',
          '₹ 121.37',
          'Payment',
          'due date',
          '01 Oct, 2026',
          'Steps to Pay from your OneCard App',
          'If you notice any discrepancy, our team is standing by to assist. You can reach to us here.',
        ],
        [],
      ),
      {
        issuingBank: 'FEDERAL',
        cardName: 'One',
        statementDate: '2026-09-14',
        dueDate: '2026-10-01',
        totalDue: 2427.31,
        minDue: 121.37,
        attachment: undefined,
      },
    ],
  ];

  it.each(FIXTURES)('should parse the %s email', (_name, fixture, expected) => {
    const parser = registry.find({ from: fixture.from, subject: fixture.subject });
    expect(parser?.parse(fixture)).toEqual({
      kind: 'CARD_STATEMENT',
      attachment: { locator: 'att-1', filename: 'statement.pdf' },
      ...expected,
    });
  });

  it.each(FIXTURES)('should never store example values from the %s email', (_name, fixture) => {
    const parser = registry.find({ from: fixture.from, subject: fixture.subject });
    expect(JSON.stringify(parser?.parse(fixture))).not.toMatch(
      /Sujit|Gupta|suji0501|Bhargava|raj2808|5678123|Rakesh|RAKE|1992|2000|Ajay|CKAJ|1985/,
    );
  });
});
