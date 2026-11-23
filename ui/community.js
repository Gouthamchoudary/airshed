import { getCommunityBrief } from '../domain/guidance.js';
import { byId, element } from './dom.js';

/** @param {{showToast: (message: string) => void, showCopyText: (brief: string) => void}} options */
export function createCommunityView({ showToast, showCopyText }) {
  const copy = byId('copy-brief');
  const label = copy.querySelector('span');
  if (!label) throw new Error('Missing copy button label');
  const feedback = byId('share-status');
  let brief = '';
  let cityName = '';
  /** @type {ReturnType<typeof setTimeout> | undefined} */
  let resetLabel;

  copy.addEventListener('click', async () => {
    const bulletin = brief;
    try {
      await navigator.clipboard.writeText(bulletin);
      label.textContent = 'Copied!';
      feedback.textContent = 'Brief copied to clipboard.';
      showToast('Community brief copied');
      clearTimeout(resetLabel);
      resetLabel = setTimeout(() => {
        label.textContent = 'Copy brief';
      }, 1800);
    } catch {
      showCopyText(bulletin);
    }
  });

  byId('download-brief').addEventListener('click', () => {
    const url = URL.createObjectURL(new Blob([brief], { type: 'text/plain;charset=utf-8' }));
    const slug =
      cityName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '') || 'city';
    const link = element('a', { href: url, download: `airshed-${slug}-brief.txt` });
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    showToast('Community brief saved as text');
  });

  return {
    /**
     * @param {import('../types/contracts.js').AirForecast} air
     * @param {import('../types/contracts.js').Profile} profile
     */
    update(air, profile) {
      cityName = air.city.name;
      brief = getCommunityBrief(air, profile);
      byId('brief-preview').textContent = brief;
    },
  };
}
