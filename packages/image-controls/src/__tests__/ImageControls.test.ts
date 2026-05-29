import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { LagPlayer } from '@lagplayer/player';
import { LagImageControls } from '../ImageControls';

beforeAll(() => {
  if (!customElements.get('lag-player')) customElements.define('lag-player', LagPlayer);
  if (!customElements.get('lag-image-controls')) customElements.define('lag-image-controls', LagImageControls);
});

afterEach(() => { document.body.innerHTML = ''; });

function setup() {
  const player = document.createElement('lag-player') as LagPlayer;
  document.body.appendChild(player);

  const controls = document.createElement('lag-image-controls') as LagImageControls;
  document.body.appendChild(controls);
  controls.init(player);

  const sr = controls.shadowRoot!;
  const playerSr = player.shadowRoot!;
  const contentEl = playerSr.querySelector<HTMLElement>('.content')!;
  const imgBtn = playerSr.querySelector<HTMLButtonElement>('button[title="Image"]')!;

  return {
    player, controls, contentEl, imgBtn,
    // Levels
    blackSlider: sr.querySelector<HTMLInputElement>('.black-slider')!,
    whiteSlider: sr.querySelector<HTMLInputElement>('.white-slider')!,
    midSlider:   sr.querySelector<HTMLInputElement>('.mid-slider')!,
    blackVal:    sr.querySelector<HTMLSpanElement>('.black-val')!,
    whiteVal:    sr.querySelector<HTMLSpanElement>('.white-val')!,
    midVal:      sr.querySelector<HTMLSpanElement>('.mid-val')!,
    levelsCmpBtn: sr.querySelector<HTMLButtonElement>('.levels-cmp-btn')!,
    levelsRstBtn: sr.querySelector<HTMLButtonElement>('.levels-rst-btn')!,
    // Color
    tempSlider:  sr.querySelector<HTMLInputElement>('.temp-slider')!,
    tintSlider:  sr.querySelector<HTMLInputElement>('.tint-slider')!,
    satSlider:   sr.querySelector<HTMLInputElement>('.sat-slider')!,
    tempVal:     sr.querySelector<HTMLSpanElement>('.temp-val')!,
    tintVal:     sr.querySelector<HTMLSpanElement>('.tint-val')!,
    satVal:      sr.querySelector<HTMLSpanElement>('.sat-val')!,
    colorCmpBtn: sr.querySelector<HTMLButtonElement>('.color-cmp-btn')!,
    colorRstBtn: sr.querySelector<HTMLButtonElement>('.color-rst-btn')!,
    // Overall
    allCmpBtn:   sr.querySelector<HTMLButtonElement>('.all-cmp-btn')!,
    allRstBtn:   sr.querySelector<HTMLButtonElement>('.all-rst-btn')!,
    // Histogram
    histogram:   sr.querySelector<HTMLCanvasElement>('.histogram')!,
  };
}

// ── Construction ─────────────────────────────────────────────────────────────

describe('LagImageControls – construction', () => {
  it('createElement does not throw', () => {
    expect(() => document.createElement('lag-image-controls')).not.toThrow();
  });

  it('connecting to DOM does not throw', () => {
    const el = document.createElement('lag-image-controls');
    expect(() => document.body.appendChild(el)).not.toThrow();
  });
});

// ── Player button ─────────────────────────────────────────────────────────────

describe('LagImageControls – player button', () => {
  it('registers a button with icon ◑ in the player ctrl-row', () => {
    const { player } = setup();
    const btn = player.shadowRoot!.querySelector<HTMLButtonElement>('button[title="Image"]')!;
    expect(btn).not.toBeNull();
    expect(btn.textContent).toBe('◑');
  });

  it('panel is hidden by default', () => {
    const { controls } = setup();
    expect(controls.style.display).toBe('none');
  });

  it('clicking the button shows the panel', () => {
    const { controls, imgBtn } = setup();
    imgBtn.click();
    expect(controls.style.display).not.toBe('none');
  });

  it('clicking again hides the panel', () => {
    const { controls, imgBtn } = setup();
    imgBtn.click(); imgBtn.click();
    expect(controls.style.display).toBe('none');
  });

  it('button gains data-active when open, loses it when closed', () => {
    const { imgBtn } = setup();
    imgBtn.click();
    expect('active' in imgBtn.dataset).toBe(true);
    imgBtn.click();
    expect('active' in imgBtn.dataset).toBe(false);
  });

  it('disconnecting removes the button from the player', () => {
    const { player, controls } = setup();
    controls.remove();
    expect(player.shadowRoot!.querySelector('button[title="Image"]')).toBeNull();
  });
});

// ── Initial button state ──────────────────────────────────────────────────────

describe('LagImageControls – initial button states', () => {
  it('all six buttons start disabled', () => {
    const { levelsCmpBtn, levelsRstBtn, colorCmpBtn, colorRstBtn, allCmpBtn, allRstBtn } = setup();
    expect(levelsCmpBtn.disabled).toBe(true);
    expect(levelsRstBtn.disabled).toBe(true);
    expect(colorCmpBtn.disabled).toBe(true);
    expect(colorRstBtn.disabled).toBe(true);
    expect(allCmpBtn.disabled).toBe(true);
    expect(allRstBtn.disabled).toBe(true);
  });
});

// ── Levels section ────────────────────────────────────────────────────────────

describe('LagImageControls – levels section', () => {
  it('applying black point enables levels and overall buttons only', () => {
    const { blackSlider, levelsCmpBtn, levelsRstBtn, colorCmpBtn, colorRstBtn, allCmpBtn, allRstBtn } = setup();
    blackSlider.value = '20'; blackSlider.dispatchEvent(new Event('input'));
    expect(levelsCmpBtn.disabled).toBe(false);
    expect(levelsRstBtn.disabled).toBe(false);
    expect(colorCmpBtn.disabled).toBe(true);   // color untouched
    expect(colorRstBtn.disabled).toBe(true);
    expect(allCmpBtn.disabled).toBe(false);
    expect(allRstBtn.disabled).toBe(false);
  });

  it('levels filter is applied to the video content', () => {
    const { blackSlider, contentEl } = setup();
    blackSlider.value = '20'; blackSlider.dispatchEvent(new Event('input'));
    expect(contentEl.style.filter).toMatch(/^url\(#lag-filter-/);
  });

  it('levels compare (pointerdown) removes levels filter', () => {
    const { blackSlider, levelsCmpBtn, contentEl } = setup();
    blackSlider.value = '20'; blackSlider.dispatchEvent(new Event('input'));
    levelsCmpBtn.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    expect(contentEl.style.filter).toBe('');
  });

  it('levels compare (pointerup) restores levels filter', () => {
    const { blackSlider, levelsCmpBtn, contentEl } = setup();
    blackSlider.value = '20'; blackSlider.dispatchEvent(new Event('input'));
    levelsCmpBtn.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    levelsCmpBtn.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
    expect(contentEl.style.filter).toMatch(/^url\(#lag-filter-/);
  });

  it('levels reset clears only levels', () => {
    const { blackSlider, tempSlider, levelsRstBtn, contentEl } = setup();
    blackSlider.value = '20'; blackSlider.dispatchEvent(new Event('input'));
    tempSlider.value = '50'; tempSlider.dispatchEvent(new Event('input'));
    levelsRstBtn.click();
    // Color filter still active
    expect(contentEl.style.filter).toMatch(/^url\(#lag-filter-/);
  });

  it('levels reset disables only levels buttons when color is still dirty', () => {
    const { blackSlider, tempSlider, levelsRstBtn, levelsCmpBtn, levelsRstBtn: lrb, colorCmpBtn, allCmpBtn } = setup();
    blackSlider.value = '20'; blackSlider.dispatchEvent(new Event('input'));
    tempSlider.value = '50'; tempSlider.dispatchEvent(new Event('input'));
    levelsRstBtn.click();
    expect(levelsCmpBtn.disabled).toBe(true);
    expect(lrb.disabled).toBe(true);
    expect(colorCmpBtn.disabled).toBe(false); // color still dirty
    expect(allCmpBtn.disabled).toBe(false);   // overall still dirty
  });

  it('value display shows +N for positive black point... wait, black shows integer', () => {
    const { blackSlider, blackVal } = setup();
    blackSlider.value = '30'; blackSlider.dispatchEvent(new Event('input'));
    expect(blackVal.textContent).toBe('30');
  });

  it('value display shows +N for positive midtone', () => {
    const { midSlider, midVal } = setup();
    midSlider.value = '40'; midSlider.dispatchEvent(new Event('input'));
    expect(midVal.textContent).toBe('+40');
  });
});

// ── Color section ─────────────────────────────────────────────────────────────

describe('LagImageControls – color section', () => {
  it('applying temperature enables color and overall buttons only', () => {
    const { tempSlider, levelsCmpBtn, colorCmpBtn, colorRstBtn, allCmpBtn } = setup();
    tempSlider.value = '50'; tempSlider.dispatchEvent(new Event('input'));
    expect(levelsCmpBtn.disabled).toBe(true);   // levels untouched
    expect(colorCmpBtn.disabled).toBe(false);
    expect(colorRstBtn.disabled).toBe(false);
    expect(allCmpBtn.disabled).toBe(false);
  });

  it('color filter is applied to the video content', () => {
    const { tempSlider, contentEl } = setup();
    tempSlider.value = '50'; tempSlider.dispatchEvent(new Event('input'));
    expect(contentEl.style.filter).toMatch(/^url\(#lag-filter-/);
  });

  it('color compare (pointerdown) removes only color filter', () => {
    const { blackSlider, tempSlider, colorCmpBtn, contentEl } = setup();
    blackSlider.value = '20'; blackSlider.dispatchEvent(new Event('input'));
    tempSlider.value = '50'; tempSlider.dispatchEvent(new Event('input'));
    colorCmpBtn.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    // Levels filter should still be applied
    expect(contentEl.style.filter).toMatch(/^url\(#lag-filter-/);
  });

  it('color compare (pointerup) restores color filter', () => {
    const { tempSlider, colorCmpBtn, contentEl } = setup();
    tempSlider.value = '50'; tempSlider.dispatchEvent(new Event('input'));
    colorCmpBtn.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    colorCmpBtn.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
    expect(contentEl.style.filter).toMatch(/^url\(#lag-filter-/);
  });

  it('color reset clears only color', () => {
    const { blackSlider, tempSlider, colorRstBtn, levelsCmpBtn, colorCmpBtn } = setup();
    blackSlider.value = '20'; blackSlider.dispatchEvent(new Event('input'));
    tempSlider.value = '50'; tempSlider.dispatchEvent(new Event('input'));
    colorRstBtn.click();
    expect(colorCmpBtn.disabled).toBe(true);   // color cleared
    expect(levelsCmpBtn.disabled).toBe(false); // levels still dirty
  });

  it('value display shows +N for positive temperature', () => {
    const { tempSlider, tempVal } = setup();
    tempSlider.value = '60'; tempSlider.dispatchEvent(new Event('input'));
    expect(tempVal.textContent).toBe('+60');
  });
});

// ── Overall controls ──────────────────────────────────────────────────────────

describe('LagImageControls – overall compare and reset', () => {
  it('overall compare removes both filters simultaneously', () => {
    const { blackSlider, tempSlider, allCmpBtn, contentEl } = setup();
    blackSlider.value = '20'; blackSlider.dispatchEvent(new Event('input'));
    tempSlider.value = '50'; tempSlider.dispatchEvent(new Event('input'));
    allCmpBtn.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    expect(contentEl.style.filter).toBe('');
  });

  it('overall compare (pointerup) restores both filters', () => {
    const { blackSlider, tempSlider, allCmpBtn, contentEl } = setup();
    blackSlider.value = '20'; blackSlider.dispatchEvent(new Event('input'));
    tempSlider.value = '50'; tempSlider.dispatchEvent(new Event('input'));
    allCmpBtn.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    allCmpBtn.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
    expect(contentEl.style.filter).toMatch(/^url\(#lag-filter-/);
  });

  it('overall compare (pointercancel) restores both filters', () => {
    const { tempSlider, allCmpBtn, contentEl } = setup();
    tempSlider.value = '50'; tempSlider.dispatchEvent(new Event('input'));
    allCmpBtn.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    allCmpBtn.dispatchEvent(new PointerEvent('pointercancel', { bubbles: true }));
    expect(contentEl.style.filter).toMatch(/^url\(#lag-filter-/);
  });

  it('overall reset clears all values and filters', () => {
    const { blackSlider, tempSlider, allRstBtn, contentEl } = setup();
    blackSlider.value = '20'; blackSlider.dispatchEvent(new Event('input'));
    tempSlider.value = '50'; tempSlider.dispatchEvent(new Event('input'));
    allRstBtn.click();
    expect(contentEl.style.filter).toBe('');
  });

  it('overall reset disables all six buttons', () => {
    const { blackSlider, tempSlider, allRstBtn, levelsCmpBtn, levelsRstBtn, colorCmpBtn, colorRstBtn, allCmpBtn, allRstBtn: arb } = setup();
    blackSlider.value = '20'; blackSlider.dispatchEvent(new Event('input'));
    tempSlider.value = '50'; tempSlider.dispatchEvent(new Event('input'));
    allRstBtn.click();
    expect(levelsCmpBtn.disabled).toBe(true);
    expect(levelsRstBtn.disabled).toBe(true);
    expect(colorCmpBtn.disabled).toBe(true);
    expect(colorRstBtn.disabled).toBe(true);
    expect(allCmpBtn.disabled).toBe(true);
    expect(arb.disabled).toBe(true);
  });

  it('overall reset restores all slider positions to defaults', () => {
    const { blackSlider, whiteSlider, midSlider, tempSlider, tintSlider, satSlider, allRstBtn } = setup();
    blackSlider.value = '20'; blackSlider.dispatchEvent(new Event('input'));
    whiteSlider.value = '80'; whiteSlider.dispatchEvent(new Event('input'));
    midSlider.value = '-30'; midSlider.dispatchEvent(new Event('input'));
    tempSlider.value = '50'; tempSlider.dispatchEvent(new Event('input'));
    tintSlider.value = '-20'; tintSlider.dispatchEvent(new Event('input'));
    satSlider.value = '40'; satSlider.dispatchEvent(new Event('input'));
    allRstBtn.click();
    expect(blackSlider.value).toBe('0');
    expect(whiteSlider.value).toBe('100');
    expect(midSlider.value).toBe('0');
    expect(tempSlider.value).toBe('0');
    expect(tintSlider.value).toBe('0');
    expect(satSlider.value).toBe('0');
  });
});

// ── Histogram ─────────────────────────────────────────────────────────────────

describe('LagImageControls – histogram', () => {
  it('histogram canvas exists in the shadow DOM', () => {
    const { histogram } = setup();
    expect(histogram).not.toBeNull();
    expect(histogram.tagName.toLowerCase()).toBe('canvas');
  });

  it('histogram canvas has non-zero dimensions', () => {
    const { histogram } = setup();
    expect(histogram.width).toBeGreaterThan(0);
    expect(histogram.height).toBeGreaterThan(0);
  });

  it('opening the panel does not throw', () => {
    const { imgBtn } = setup();
    expect(() => imgBtn.click()).not.toThrow();
  });
});

// ── No player ─────────────────────────────────────────────────────────────────

describe('LagImageControls – absent player', () => {
  it('does not throw when no player is attached', () => {
    const el = document.createElement('lag-image-controls') as LagImageControls;
    document.body.appendChild(el);
    const slider = el.shadowRoot!.querySelector<HTMLInputElement>('.black-slider')!;
    slider.value = '30';
    expect(() => slider.dispatchEvent(new Event('input'))).not.toThrow();
  });
});
