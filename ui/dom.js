export const byId = (id) => document.getElementById(id);

export function element(tag, { text, ...attributes } = {}) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value);
  return node;
}

export function sourceLink(url, label) {
  try {
    const address = new URL(url);
    if (address.protocol !== 'https:' && address.protocol !== 'http:') return null;
    return element('a', {
      href: address.href,
      target: '_blank',
      rel: 'noopener noreferrer',
      text: label,
    });
  } catch {
    return null;
  }
}

export function pressState(buttons, key, value) {
  for (const button of buttons)
    button.setAttribute('aria-pressed', String(button.dataset[key] === value));
}
