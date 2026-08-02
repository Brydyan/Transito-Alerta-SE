import { es } from '../i18n/es.js';

export function __(key, replacements = {}) {
  let text = es[key] ?? key;

  for (const [name, value] of Object.entries(replacements)) {
    text = text.replaceAll(`:${name}`, String(value));
  }

  return text;
}

export function applyTranslations(root = document) {
  root.querySelectorAll('[data-i18n]').forEach((element) => {
    element.textContent = __(element.dataset.i18n);
  });

  const attributes = ['aria-label', 'title', 'placeholder'];
  for (const attribute of attributes) {
    const dataAttribute = `data-i18n-${attribute}`;
    root.querySelectorAll(`[${dataAttribute}]`).forEach((element) => {
      element.setAttribute(attribute, __(element.getAttribute(dataAttribute)));
    });
  }
}
