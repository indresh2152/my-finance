import { htmlToText } from './html-to-text';

describe('htmlToText', () => {
  it('should strip tags and keep line structure', () => {
    const html = '<div>Total Due: <b>Rs. 1,234.00</b></div><p>Due by 25 Sep</p>';
    expect(htmlToText(html)).toBe('Total Due: Rs. 1,234.00\nDue by 25 Sep');
  });

  it('should drop script and style blocks', () => {
    expect(htmlToText('<style>.a{}</style><script>x()</script>Hello')).toBe('Hello');
  });

  it('should decode named and numeric entities', () => {
    expect(htmlToText('A&nbsp;&amp;&nbsp;B &#8377;500 &lt;ok&gt;')).toBe('A & B ₹500 <ok>');
  });

  it('should convert br tags to new lines', () => {
    expect(htmlToText('line1<br/>line2<BR>line3')).toBe('line1\nline2\nline3');
  });
});
