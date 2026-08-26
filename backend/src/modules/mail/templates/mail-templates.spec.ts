import { renderMailTemplate } from './mail-templates';

describe('renderMailTemplate — invitation / password-reset (T3.6 task 7.3)', () => {
  describe('invitation', () => {
    it('renders the link, role and organization name, all escaped', () => {
      const html = renderMailTemplate('invitation', {
        link: 'http://localhost:3000/accept-invitation?token=abc123',
        roleName: 'operador_org',
        organizationName: 'Santa Elena Transito',
      });

      expect(html).toContain('http://localhost:3000/accept-invitation?token=abc123');
      expect(html).toContain('operador_org');
      expect(html).toContain('Santa Elena Transito');
      expect(html).toMatch(/48 hours/);
    });

    it('escapes a poisoned token/link — no unescaped HTML reaches the body', () => {
      const html = renderMailTemplate('invitation', {
        link: '"><script>alert(1)</script>',
        roleName: 'reporter',
        organizationName: '<b>Org</b>',
      });

      expect(html).not.toContain('<script>');
      expect(html).not.toContain('<b>Org</b>');
    });
  });

  describe('password-reset', () => {
    it('renders the link, escaped, with no password hint', () => {
      const html = renderMailTemplate('password-reset', {
        link: 'http://localhost:3000/reset-password?token=xyz789',
      });

      expect(html).toContain('http://localhost:3000/reset-password?token=xyz789');
      expect(html).toMatch(/24 hours/);
      expect(html.toLowerCase()).not.toContain('your password is');
    });

    it('escapes a poisoned link', () => {
      const html = renderMailTemplate('password-reset', {
        link: '"><img src=x onerror=alert(1)>',
      });

      expect(html).not.toContain('<img');
    });
  });
});
