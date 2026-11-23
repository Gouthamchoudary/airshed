/**
 * Look up an element required by the page, validating typed controls at runtime.
 * @template {keyof HTMLElementTagNameMap} [T=keyof HTMLElementTagNameMap]
 * @param {string} id
 * @param {T} [tag]
 * @returns {HTMLElementTagNameMap[T]}
 */
export function byId(id, tag) {
  const node = document.getElementById(id);
  if (!node || (tag && node.localName !== tag))
    throw new Error(`Missing ${tag ?? 'element'} #${id}`);
  return /** @type {HTMLElementTagNameMap[T]} */ (node);
}

/**
 * @param {Event} event
 * @param {string} selector
 */
export function eventElement(event, selector) {
  return event.target instanceof Element ? event.target.closest(selector) : null;
}

/**
 * @template {keyof HTMLElementTagNameMap} T
 * @param {T} tag
 * @param {{text?: string} & Record<string, string | number>} [options]
 */
export function element(tag, { text, ...attributes } = {}) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, String(value));
  return node;
}

/** @param {string} url @param {string} label */
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

/** @param {Iterable<Element>} buttons @param {string} key @param {string} value */
export function pressState(buttons, key, value) {
  for (const button of buttons)
    button.setAttribute('aria-pressed', String(button.getAttribute('data-' + key) === value));
}
