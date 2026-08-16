/**
 * Pure HTML-escape (R13 / design D9). `MailService.renderTemplate` calls
 * this on every `{{variable}}` interpolation before inserting it into an
 * email body — there is no template engine (Handlebars/EJS would add a
 * dependency and a class of injection bugs to render four fixed emails),
 * so this is the only thing standing between recipient-controlled data
 * (an incident title, a comment body) and executable markup in an inbox.
 *
 * `&` is replaced first and only once, so its own output (`&amp;`) is
 * never re-escaped by the subsequent replacements.
 */
export function escapeHtml(value: string): string {
  if (value === null || value === undefined) {
    return '';
  }
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
