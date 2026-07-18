/** 统一自定义弹窗：toast / 确认 / 单行输入，替代 alert/confirm/prompt */

type ConfirmOpts = {
  title?: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  danger?: boolean;
};

type PromptOpts = {
  title?: string;
  message?: string;
  placeholder?: string;
  defaultValue?: string;
  confirmText?: string;
  cancelText?: string;
};

function ensureToastHost(): HTMLElement {
  let host = document.getElementById('toastHost');
  if (!host) {
    host = document.createElement('div');
    host.id = 'toastHost';
    host.className = 'toast-host';
    host.setAttribute('aria-live', 'polite');
    document.body.appendChild(host);
  }
  return host;
}

export function toast(message: string, kind: 'info' | 'success' | 'error' = 'info') {
  const host = ensureToastHost();
  const el = document.createElement('div');
  el.className = `toast toast-${kind}`;
  el.textContent = message;
  host.appendChild(el);
  requestAnimationFrame(() => el.classList.add('show'));
  window.setTimeout(() => {
    el.classList.remove('show');
    window.setTimeout(() => el.remove(), 220);
  }, 2800);
}

function openMask(maskId: string) {
  document.getElementById(maskId)?.classList.add('show');
}

function closeMask(maskId: string) {
  document.getElementById(maskId)?.classList.remove('show');
}

export function confirmDialog(opts: ConfirmOpts): Promise<boolean> {
  return new Promise((resolve) => {
    const mask = document.getElementById('confirmMask');
    const title = document.getElementById('confirmTitle');
    const msg = document.getElementById('confirmMessage');
    const okBtn = document.getElementById('confirmOk') as HTMLButtonElement | null;
    const cancelBtn = document.getElementById('confirmCancel') as HTMLButtonElement | null;
    if (!mask || !okBtn || !cancelBtn || !title || !msg) {
      resolve(window.confirm(opts.message));
      return;
    }

    title.textContent = opts.title || '确认';
    msg.textContent = opts.message;
    okBtn.textContent = opts.confirmText || '确定';
    cancelBtn.textContent = opts.cancelText || '取消';
    okBtn.classList.toggle('danger', Boolean(opts.danger));

    const finish = (value: boolean) => {
      closeMask('confirmMask');
      okBtn.removeEventListener('click', onOk);
      cancelBtn.removeEventListener('click', onCancel);
      mask.removeEventListener('click', onMask);
      document.removeEventListener('keydown', onKey);
      resolve(value);
    };
    const onOk = () => finish(true);
    const onCancel = () => finish(false);
    const onMask = (e: Event) => {
      if (e.target === mask) finish(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') finish(false);
      if (e.key === 'Enter') finish(true);
    };

    okBtn.addEventListener('click', onOk);
    cancelBtn.addEventListener('click', onCancel);
    mask.addEventListener('click', onMask);
    document.addEventListener('keydown', onKey);
    openMask('confirmMask');
    requestAnimationFrame(() => okBtn.focus());
  });
}

export function promptDialog(opts: PromptOpts): Promise<string | null> {
  return new Promise((resolve) => {
    const mask = document.getElementById('promptMask');
    const title = document.getElementById('promptTitle');
    const msg = document.getElementById('promptMessage');
    const input = document.getElementById('promptInput') as HTMLInputElement | null;
    const err = document.getElementById('promptError');
    const okBtn = document.getElementById('promptOk') as HTMLButtonElement | null;
    const cancelBtn = document.getElementById('promptCancel') as HTMLButtonElement | null;
    const form = document.getElementById('promptForm') as HTMLFormElement | null;

    if (!mask || !input || !okBtn || !cancelBtn || !title) {
      resolve(window.prompt(opts.message || opts.title || '', opts.defaultValue || ''));
      return;
    }

    title.textContent = opts.title || '输入';
    if (msg) {
      msg.textContent = opts.message || '';
      msg.hidden = !opts.message;
    }
    input.value = opts.defaultValue || '';
    input.placeholder = opts.placeholder || '';
    okBtn.textContent = opts.confirmText || '确定';
    cancelBtn.textContent = opts.cancelText || '取消';
    if (err) {
      err.hidden = true;
      err.textContent = '';
    }

    const finish = (value: string | null) => {
      closeMask('promptMask');
      form?.removeEventListener('submit', onSubmit);
      cancelBtn.removeEventListener('click', onCancel);
      mask.removeEventListener('click', onMask);
      document.removeEventListener('keydown', onKey);
      resolve(value);
    };
    const onSubmit = (e: Event) => {
      e.preventDefault();
      const v = input.value.trim();
      if (!v) {
        if (err) {
          err.hidden = false;
          err.textContent = '内容不能为空';
        }
        input.focus();
        return;
      }
      finish(v);
    };
    const onCancel = () => finish(null);
    const onMask = (e: Event) => {
      if (e.target === mask) finish(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') finish(null);
    };

    form?.addEventListener('submit', onSubmit);
    cancelBtn.addEventListener('click', onCancel);
    mask.addEventListener('click', onMask);
    document.addEventListener('keydown', onKey);
    openMask('promptMask');
    requestAnimationFrame(() => {
      input.focus();
      input.select();
    });
  });
}
