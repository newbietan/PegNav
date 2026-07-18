export type Engine = 'baidu' | 'bing' | 'google';

const engineUrls: Record<Engine, (q: string) => string> = {
  baidu: (q) => `https://www.baidu.com/s?wd=${q}`,
  bing: (q) => `https://www.bing.com/search?q=${q}`,
  google: (q) => `https://www.google.com/search?q=${q}`,
};

let currentEngine: Engine = 'baidu';

export function getEngine() {
  return currentEngine;
}

export function setEngine(engine: Engine) {
  currentEngine = engine;
  document.querySelectorAll<HTMLButtonElement>('#engineSwitch button').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.engine === engine);
  });
  document.getElementById('searchInput')?.focus();
}

export function doSearch() {
  const input = document.getElementById('searchInput') as HTMLInputElement | null;
  const q = input?.value.trim() ?? '';
  if (!q) return;
  window.open(engineUrls[currentEngine](encodeURIComponent(q)), '_blank');
}
