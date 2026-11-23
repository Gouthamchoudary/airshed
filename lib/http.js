export async function fetchJSON(url, timeout = 5000, { signal, ...options } = {}) {
  const deadline = AbortSignal.timeout(timeout);
  const response = await fetch(url, {
    ...options,
    signal: signal ? AbortSignal.any([signal, deadline]) : deadline,
  });
  if (!response.ok) throw new Error('Service unavailable');
  return response.json();
}
