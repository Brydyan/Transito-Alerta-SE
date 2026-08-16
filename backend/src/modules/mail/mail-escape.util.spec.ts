import { escapeHtml } from './mail-escape.util';

/**
 * R13 (Mail) XSS scenario — template data must never reach an email body
 * unescaped. Pure function, no Redis/SMTP involved.
 */
describe('escapeHtml', () => {
  it('escapes < and > so markup cannot execute', () => {
    expect(escapeHtml('<script>alert(1)</script>')).toBe(
      '&lt;script&gt;alert(1)&lt;/script&gt;',
    );
  });

  it('escapes double quotes', () => {
    expect(escapeHtml('say "hi"')).toBe('say &quot;hi&quot;');
  });

  it('escapes single quotes', () => {
    expect(escapeHtml("it's here")).toBe('it&#39;s here');
  });

  it('escapes ampersands (and does not double-escape the entities it just produced)', () => {
    expect(escapeHtml('Tom & Jerry')).toBe('Tom &amp; Jerry');
  });

  it('escapes every special character in a single pass, in the correct order', () => {
    expect(escapeHtml(`<a href="x">it's & "quoted"</a>`)).toBe(
      '&lt;a href=&quot;x&quot;&gt;it&#39;s &amp; &quot;quoted&quot;&lt;/a&gt;',
    );
  });

  it('leaves plain text untouched', () => {
    expect(escapeHtml('Incident #42 in progress')).toBe('Incident #42 in progress');
  });

  it('coerces non-string values to their string form before escaping', () => {
    expect(escapeHtml(42 as unknown as string)).toBe('42');
    expect(escapeHtml(null as unknown as string)).toBe('');
    expect(escapeHtml(undefined as unknown as string)).toBe('');
  });
});
