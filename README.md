# LagPlayer

**LagPlayer** — *Locally Augmented Graphics Player* — is a web-component video player built for in-browser video processing and image enhancement. The name is a deliberate pun on playback lag: the very thing well-behaved players try to eliminate. We try too — but doing image frame processing locally in the browser has a cost, and some lag may be unavoidable.

LagPlayer is extensible with addons and built as a Vite monorepo.

## Packages

```
packages/player   @lagplayer/player   — standalone core, no addon dependencies
packages/<addon>  @lagplayer/<addon>  — optional addons, each depends on @lagplayer/player
apps/demo         —                  — React demo app
```

`@lagplayer/player` has no knowledge of any specific addon. Each addon in `packages/` reaches into the player through its public extension interface.

## Monorepo commands

```
npm test      # run tests in all packages
npm run dev   # start the demo app (apps/demo)
npm run build # build player then demo
```

## Demo app

Drop video files into `apps/demo/assets/` and they will appear as sample buttons on the demo landing page. That directory is gitignored — restart the dev server after adding files so Vite picks them up.

## Using the player

Import the package for its side-effect (registers the custom element), then drop it into HTML:

```ts
import '@lagplayer/player';
```

```html
<lag-player src="video.mp4" autoplay muted loop></lag-player>
```

Standard video attributes (`src`, `autoplay`, `loop`, `muted`, `poster`) are forwarded to the inner `<video>` element. The player renders its own controls overlay and exposes a fullscreen button.

## Using addons

Each addon registers its own custom element. Place it inside `<lag-player>` so it stays visible in fullscreen:

```html
<lag-player id="player" src="video.mp4">
  <lag-some-addon></lag-some-addon>
</lag-player>
```

The player has no built-in addon concept, so the app is responsible for wiring them together:

```ts
const player = document.getElementById('player') as LagPlayer;
const addon  = player.querySelector('lag-some-addon') as SomeAddon;

addon.init(player);   // registers renderers / buttons / callbacks
// on teardown:
addon.destroy();
```

## Player extension interface

Addons interact with the player through these public methods on `LagPlayer`:

| Method | Purpose |
|---|---|
| `registerFilterRenderer(renderer)` | Register a custom SVG filter type so the pipeline can render it |
| `setFilter(config)` | Apply (or update) a named filter with params and pipeline order |
| `removeFilter(id)` | Remove a filter by id |
| `registerControlButton(config)` | Inject a button into the controls bar; returns a cleanup function |
| `showControls()` | Show the controls bar immediately with a fast fade-in |
| `hideControls()` | Hide the controls bar with a slow fade-out (no-op while paused) |
| `registerOverlay(el)` | Append an element into the overlay container (above the video, below the controls bar); returns a cleanup function |
| `registerFrameCallback(fn)` | Subscribe to decoded video frames as `ImageData`; returns a cleanup function |
| `captureFrame()` | One-shot synchronous frame capture; returns `ImageData \| null` |

### FilterConfig

```ts
interface FilterConfig {
  id: string;            // unique name for this filter instance
  type: string;          // matches a registered FilterRenderer
  order?: number;        // pipeline position (lower = applied first)
  enabled?: boolean;     // false to bypass without removing
  params: Record<string, number>;
}
```

### FilterRenderer

```ts
interface FilterRenderer {
  readonly type: string;
  render(params: Record<string, number>, input: string, output: string): SVGElement[];
}
```

A renderer emits SVG filter primitives (e.g. `feColorMatrix`, `feComponentTransfer`). The pipeline chains them by wiring each primitive's `result` into the next primitive's `in`.

## Writing a custom addon

```ts
import type { LagPlayer, FilterRenderer } from '@lagplayer/player';

const myRenderer: FilterRenderer = {
  type: 'myFilter',
  render(params, input, output) {
    const el = document.createElementNS('http://www.w3.org/2000/svg', 'feColorMatrix');
    el.setAttribute('in', input);
    el.setAttribute('result', output);
    // …configure el from params…
    return [el];
  },
};

class MyAddon extends HTMLElement {
  private cleanup?: () => void;

  init(player: LagPlayer) {
    player.registerFilterRenderer(myRenderer);

    const removeBtn = player.registerControlButton({
      icon: '★',
      title: 'My Addon',
      onClick: (btn) => { /* toggle panel */ },
    });

    this.cleanup = removeBtn;
  }

  destroy() {
    this.cleanup?.();
  }
}
```

## Bundled components

Some features are shipped as part of `@lagplayer/player` itself rather than as separate addon packages. These live in `packages/player/src/components/` and follow the same addon contract — they only touch the player through its public extension interface — but the player auto-initialises them in `connectedCallback`/`disconnectedCallback`.

**Current bundled components:**

| Component | File | Button | Description |
|---|---|---|---|
| `MediaInfo` | `components/MediaInfo.ts` | `ⓘ` | Overlay panel showing resolution, frame rate, render FPS, and dropped frame count |
| `PlaybackSpeed` | `components/PlaybackSpeed.ts` | `1×` (updates to current rate) | Speed picker with presets: 0.5×, 0.8×, 0.9×, 1×, 1.1×, 1.25×, 2× |
| `ControlsAutoHide` | `components/ControlsAutoHide.ts` | — | Hides the controls bar 2 s after the last pointer/touch activity; shows instantly on click or touch, with a slower fade-out |

### File layout

Each component lives in its own directory of three files:

```
components/
  MediaInfo.ts    — class with init(player) / destroy(); imports css and html as raw strings
  MediaInfo.css   — shadow DOM styles (:host rules for positioning and theme)
  MediaInfo.html  — panel markup (no <style> tag; injected by the .ts file)
```

The `.ts` file combines them into a shadow root:

```ts
import css from './MediaInfo.css?raw';
import html from './MediaInfo.html?raw';

panel.attachShadow({ mode: 'open' }).innerHTML = `<style>${css}</style>${html}`;
```

### Adding a new bundled component

1. Create `src/components/MyComponent.ts`, `MyComponent.css`, `MyComponent.html`.
2. Implement `init(player: LagPlayer)` and `destroy()` using only the public extension interface.
3. Use `player.registerOverlay(el)` for any panel that needs to be positioned over the video.
4. In `LagPlayer`, add `private readonly myComponent = new MyComponent()` and wire `init`/`destroy` through `connectedCallback`/`disconnectedCallback`.
