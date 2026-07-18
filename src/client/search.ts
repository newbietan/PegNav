export type Engine = 'baidu' | 'bing' | 'google' | 'local';

const engineUrls: Record<Exclude<Engine, 'local'>, (q: string) => string> = {
  baidu: (q) => `https://www.baidu.com/s?wd=${q}`,
  bing: (q) => `https://www.bing.com/search?q=${q}`,
  google: (q) => `https://www.google.com/search?q=${q}`,
};

let currentEngine: Engine = 'local';

export function getEngine() {
  return currentEngine;
}

export function setEngine(engine: Engine) {
  currentEngine = engine;
  document.querySelectorAll<HTMLButtonElement>('#engineSwitch button').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.engine === engine);
  });
  const input = document.getElementById('searchInput') as HTMLInputElement | null;
  if (input) {
    input.placeholder =
      engine === 'local' ? '筛选本站卡片（标题 / 网址 / 分类）…' : '输入关键词搜索…';
  }
  input?.focus();
}

/** 外站搜索；站内模式不跳转，由主逻辑做过滤 */
export function doExternalSearch() {
  if (currentEngine === 'local') return false;
  const input = document.getElementById('searchInput') as HTMLInputElement | null;
  const q = input?.value.trim() ?? '';
  if (!q) return false;
  window.open(engineUrls[currentEngine](encodeURIComponent(q)), '_blank');
  return true;
}
