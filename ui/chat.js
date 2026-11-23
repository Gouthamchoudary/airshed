import { byId, element, sourceLink } from './dom.js';

export function createChat() {
  const questionField = byId('question');
  const thread = byId('thread');
  const send = byId('ask-submit');
  const consent = byId('cloud-ai');
  const status = byId('ask-status');
  let context;
  let sequence = 0;
  let pending;

  function appendEntry(role, label, text, citations = []) {
    const item = element('div', { class: `chat-entry ${role}` });
    item.append(element('strong', { text: label }), element('p', { text }));
    const links = citations
      .map((source) => sourceLink(source.url, source.title || 'Source'))
      .filter(Boolean);
    if (links.length) {
      const refs = element('div', { class: 'chat-sources' });
      refs.append(...links);
      item.append(refs);
    }
    thread.append(item);
    thread.scrollTop = thread.scrollHeight;
  }

  async function submit() {
    const question = questionField.value.trim();
    if (!question || send.disabled || !context) return;
    const { air, profile } = context;
    const current = ++sequence;
    pending?.abort();
    const controller = new AbortController();
    pending = controller;
    appendEntry('user', 'You', question);
    questionField.value = '';
    send.disabled = true;
    status.textContent = 'Preparing your answer…';
    try {
      const { askAssistant } = await import('../domain/assistant.js');
      if (current !== sequence) return;
      const answer = await askAssistant(question, air, profile, {
        cloud: consent.checked,
        signal: controller.signal,
        onStatus: (message) => {
          if (current === sequence) status.textContent = message;
        },
      });
      if (current !== sequence) return;
      appendEntry('assistant', answer.label || 'Airshed', answer.text, answer.sources ?? []);
      status.textContent = 'Answer ready';
    } catch {
      if (current !== sequence) return;
      questionField.value = question;
      appendEntry(
        'assistant',
        'Airshed',
        'The assistant could not complete this response. Try again, or use the action plan for your current brief.',
      );
      status.textContent = 'Answer interrupted';
    } finally {
      if (current === sequence) {
        pending = null;
        send.disabled = false;
      }
    }
  }

  byId('ask-form').addEventListener('submit', (event) => {
    event.preventDefault();
    submit();
  });
  questionField.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
      event.preventDefault();
      submit();
    }
  });
  for (const button of document.querySelectorAll('.suggestions button')) {
    button.addEventListener('click', () => {
      if (send.disabled) return;
      questionField.value = button.textContent;
      submit();
    });
  }

  return {
    setContext(air, profile, loading = false) {
      sequence++;
      pending?.abort();
      pending = null;
      context = { air, profile };
      thread.replaceChildren();
      status.textContent = loading ? 'Waiting for the current city forecast…' : '';
      send.disabled = loading;
    },
  };
}
