import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { LagPlayer } from '../LagPlayer';

beforeAll(() => {
  if (!customElements.get('lag-player')) {
    customElements.define('lag-player', LagPlayer);
  }
});

afterEach(() => {
  // Clean up any elements appended to body
  document.body.innerHTML = '';
});

describe('LagPlayer – construction', () => {
  it('createElement does not throw (catches constructor setAttribute violations)', () => {
    expect(() => document.createElement('lag-player')).not.toThrow();
  });

  it('appending to DOM (connectedCallback) does not throw', () => {
    const el = document.createElement('lag-player');
    expect(() => document.body.appendChild(el)).not.toThrow();
  });

  it('has data-paused attribute after connecting (video starts paused)', () => {
    const el = document.createElement('lag-player');
    document.body.appendChild(el);
    expect(el.hasAttribute('data-paused')).toBe(true);
  });
});

describe('LagPlayer – attribute reflection', () => {
  it('reflects src to inner video', () => {
    const el = document.createElement('lag-player') as LagPlayer;
    document.body.appendChild(el);
    el.setAttribute('src', '/test.mp4');
    const video = el.videoElement;
    expect(video.getAttribute('src')).toBe('/test.mp4');
  });

  it('reflects loop to inner video', () => {
    const el = document.createElement('lag-player') as LagPlayer;
    document.body.appendChild(el);
    el.setAttribute('loop', '');
    expect(el.videoElement.hasAttribute('loop')).toBe(true);
  });

  it('removing src removes it from inner video', () => {
    const el = document.createElement('lag-player') as LagPlayer;
    document.body.appendChild(el);
    el.setAttribute('src', '/test.mp4');
    el.removeAttribute('src');
    expect(el.videoElement.hasAttribute('src')).toBe(false);
  });
});

describe('LagPlayer – filter API', () => {
  it('setFilter does not throw', () => {
    const el = document.createElement('lag-player') as LagPlayer;
    document.body.appendChild(el);
    expect(() =>
      el.setFilter({ id: 'cc', type: 'colorCorrection', params: { temperature: 50, tint: 10 } })
    ).not.toThrow();
  });

  it('setFilter applies CSS filter to content wrapper', () => {
    const el = document.createElement('lag-player') as LagPlayer;
    document.body.appendChild(el);
    el.setFilter({ id: 'cc', type: 'colorCorrection', params: { temperature: 50, tint: 0 } });
    const shadow = el.shadowRoot!;
    const content = shadow.querySelector<HTMLElement>('.content')!;
    expect(content.style.filter).toMatch(/^url\(#lag-filter-/);
  });

  it('removeFilter clears CSS filter', () => {
    const el = document.createElement('lag-player') as LagPlayer;
    document.body.appendChild(el);
    el.setFilter({ id: 'cc', type: 'colorCorrection', params: { temperature: 50, tint: 0 } });
    el.removeFilter('cc');
    const content = el.shadowRoot!.querySelector<HTMLElement>('.content')!;
    expect(content.style.filter).toBe('');
  });

  it('filter is applied to .content, NOT to <video> directly', () => {
    const el = document.createElement('lag-player') as LagPlayer;
    document.body.appendChild(el);
    el.setFilter({ id: 'cc', type: 'colorCorrection', params: { temperature: 80, tint: 0 } });
    const video = el.shadowRoot!.querySelector<HTMLElement>('video')!;
    expect(video.style.filter).toBe('');
  });
});

describe('LagPlayer – registerControlButton', () => {
  it('inserts button into ctrl-row before the fullscreen button', () => {
    const el = document.createElement('lag-player') as LagPlayer;
    document.body.appendChild(el);
    el.registerControlButton({ icon: '★', title: 'Test', onClick: () => {} });
    const ctrlRow = el.shadowRoot!.querySelector('.ctrl-row')!;
    const buttons = ctrlRow.querySelectorAll('button');
    const fsBtn = ctrlRow.querySelector<HTMLButtonElement>('.fs-btn')!;
    const inserted = Array.from(buttons).find(b => b.textContent === '★')!;
    expect(inserted).toBeTruthy();
    // inserted button should appear before the fullscreen button in DOM order
    expect(inserted.compareDocumentPosition(fsBtn) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('sets the title attribute on the button', () => {
    const el = document.createElement('lag-player') as LagPlayer;
    document.body.appendChild(el);
    el.registerControlButton({ icon: '★', title: 'My Button', onClick: () => {} });
    const btn = el.shadowRoot!.querySelector<HTMLButtonElement>('.ctrl-row button[title="My Button"]');
    expect(btn).not.toBeNull();
  });

  it('calls onClick with the button element when clicked', () => {
    const el = document.createElement('lag-player') as LagPlayer;
    document.body.appendChild(el);
    let received: HTMLButtonElement | null = null;
    el.registerControlButton({ icon: '★', title: 'Test', onClick: (btn) => { received = btn; } });
    const btn = el.shadowRoot!.querySelector<HTMLButtonElement>('button[title="Test"]')!;
    btn.click();
    expect(received).toBe(btn);
  });

  it('returned cleanup function removes the button', () => {
    const el = document.createElement('lag-player') as LagPlayer;
    document.body.appendChild(el);
    const remove = el.registerControlButton({ icon: '★', title: 'Test', onClick: () => {} });
    remove();
    const btn = el.shadowRoot!.querySelector('button[title="Test"]');
    expect(btn).toBeNull();
  });

  it('multiple buttons can be registered independently', () => {
    const el = document.createElement('lag-player') as LagPlayer;
    document.body.appendChild(el);
    const removeA = el.registerControlButton({ icon: 'A', title: 'BtnA', onClick: () => {} });
    el.registerControlButton({ icon: 'B', title: 'BtnB', onClick: () => {} });
    removeA();
    expect(el.shadowRoot!.querySelector('button[title="BtnA"]')).toBeNull();
    expect(el.shadowRoot!.querySelector('button[title="BtnB"]')).not.toBeNull();
  });
});

describe('LagPlayer – captureFrame', () => {
  it('returns null when video has no decoded dimensions (no src loaded)', () => {
    const el = document.createElement('lag-player') as LagPlayer;
    document.body.appendChild(el);
    expect(el.captureFrame()).toBeNull();
  });

  it('does not throw regardless of video state', () => {
    const el = document.createElement('lag-player') as LagPlayer;
    document.body.appendChild(el);
    expect(() => el.captureFrame()).not.toThrow();
  });
});

describe('LagPlayer – registerFrameCallback', () => {
  it('returns a cleanup function', () => {
    const el = document.createElement('lag-player') as LagPlayer;
    document.body.appendChild(el);
    const cleanup = el.registerFrameCallback(() => {});
    expect(typeof cleanup).toBe('function');
    cleanup();
  });

  it('cleanup does not throw if called more than once', () => {
    const el = document.createElement('lag-player') as LagPlayer;
    document.body.appendChild(el);
    const cleanup = el.registerFrameCallback(() => {});
    expect(() => { cleanup(); cleanup(); }).not.toThrow();
  });

  it('multiple callbacks can be registered independently', () => {
    const el = document.createElement('lag-player') as LagPlayer;
    document.body.appendChild(el);
    const calls: string[] = [];
    const removeA = el.registerFrameCallback(() => calls.push('A'));
    const removeB = el.registerFrameCallback(() => calls.push('B'));
    removeA();
    removeB();
    // Neither should throw; the set is now empty
    expect(calls.length).toBe(0); // no frame was sampled (no real video)
  });

  it('registering does not throw even without a real video source', () => {
    const el = document.createElement('lag-player') as LagPlayer;
    document.body.appendChild(el);
    expect(() => {
      const cleanup = el.registerFrameCallback(() => {});
      cleanup();
    }).not.toThrow();
  });
});
