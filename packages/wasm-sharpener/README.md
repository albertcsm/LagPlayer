# @lagplayer/wasm-sharpener

A `@lagplayer/player` addon that applies per-frame image sharpening using a WebAssembly kernel and a WebGL2 rendering pipeline. Pixel data moves through WASM linear memory directly — no intermediate JS heap allocations on the hot path.

## How it works

Each decoded video frame goes through this pipeline:

```
Frame N:
  requestVideoFrameCallback
  → texImage2D(videoElement)             GPU-to-GPU: decoder output → WebGL texture
  → FBO bind → readPixels(pbo[N%2], 0)  async DMA: GPU → PBO  (non-blocking, returns immediately)
  → getBufferSubData(pbo[(N+1)%2], …)   system-RAM read: PBO[N-1] → WASM heap  (fast, no stall)
  → wasm.sharpen(inPtr, outPtr, …)       Laplacian kernel in WASM, CPU-side  (1-frame delayed)
  → texSubImage2D(wasmView)              WASM linear memory → GPU texture
  → drawArrays(TRIANGLE_STRIP, 0, 4)    GPU render to canvas overlay
```

**Two copies total** (GPU→WASM, WASM→GPU). No `ImageData` allocation, no JS `ArrayBuffer` copies on the hot path.

### PBO double-buffering

`readPixels` into a bound `PIXEL_PACK_BUFFER` is asynchronous — the GPU performs a DMA transfer in the background and the call returns immediately. Two PBOs are ping-ponged: frame N writes into `pbo[N%2]`; that same frame reads from `pbo[(N+1)%2]` (filled during frame N−1) via `getBufferSubData`, which is fast because the data is already in system RAM. This introduces one frame of visual latency but eliminates the ~20 ms GPU sync stall of synchronous `readPixels`.

The output is rendered onto a WebGL canvas in the player's video layer (z-index 15), which sits above the video but below UI controls. Letterboxing matches the video's aspect ratio. The original `<video>` element remains underneath; transparent canvas areas let the black bars show through naturally.

### WASM memory layout

`getBufferSubData` and `texSubImage2D` both receive a `Uint8ClampedArray` view backed by `wasm.memory.buffer` at the pointer returned by `__new`. The PBO-to-WASM transfer and the WASM-to-GPU upload both operate directly on WASM linear memory; no intermediate JS `ArrayBuffer` copy is needed.

If the video is resized, `__new` allocates fresh buffers and the views are recreated from the current `memory.buffer` (handles the case where WASM memory grew during allocation). The PBOs are also re-sized with `bufferData(…, STREAM_READ)` and the ping-pong cycle restarts.

### Sharpening kernel

5-tap discrete Laplacian applied per channel (RGB; alpha is copied unchanged):

```
         [ 0  −a   0 ]
kernel = [−a  1+4a −a ]   where a = amount
         [ 0  −a   0 ]
```

- `amount = 0` → identity (kernel sums to 1, uniform regions unchanged)
- `amount = 1` → standard sharpening (`[0,−1,0,−1,5,−1,0,−1,0]`)
- `amount = 3` → aggressive sharpening

Border pixels clamp to the nearest edge pixel. Output is clamped to `[0, 255]`.

## Setup

### 1. Build the WASM binary

The compiled `.wasm` file must exist before the Vite dev server or build starts:

```bash
npm run build:wasm -w packages/wasm-sharpener
```

This runs `asc` with `--runtime stub --exportRuntime -O3 --noAssert`. The output is `assembly/build/release.wasm` (~900 bytes).

Rebuild whenever `assembly/index.ts` changes.

### 2. Add the Vite alias (demo/app)

In your app's `vite.config.ts`, resolve the package to its TypeScript source so Vite handles HMR and WASM serving:

```ts
import { resolve } from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@lagplayer/wasm-sharpener': resolve(__dirname, '../../packages/wasm-sharpener/src/index.ts'),
    },
  },
});
```

### 3. Wire up the addon

```ts
import '@lagplayer/player';
import { WasmSharpener } from '@lagplayer/wasm-sharpener';

const player = document.querySelector('lag-player') as LagPlayer;
const sharpener = new WasmSharpener();

await sharpener.init(player);

// later, on teardown:
sharpener.destroy();
```

`init` is async because it loads and compiles the WASM module and creates the WebGL context.

## API

### `WasmSharpener`

```ts
class WasmSharpener {
  init(player: LagPlayer): Promise<void>;
  destroy(): void;
}
```

`init` registers the rendering canvas (via `player.registerVideoLayer`), attaches the settings panel (via `player.registerOverlay`), and injects a `◈` toolbar button. Calling `init` again before `destroy` will silently tear down the previous instance first.

`destroy` cancels the frame loop, removes the canvas and panel from the player, and releases the WebGL context.

### Settings panel

The `◈` toolbar button toggles a settings panel with:

| Control | Range | Default | Effect |
|---|---|---|---|
| Enabled | toggle | on | Pass-through to unsharpened video when off |
| Amount | 0 – 3 | 1.0 | Kernel strength; 0 = identity, 1 = standard sharpening |

When disabled, the canvas is cleared to transparent so the original video shows through.

## Player extension points used

| Player API | Purpose |
|---|---|
| `registerVideoLayer(canvas)` | Attach the WebGL canvas below UI controls (z-index 15) |
| `registerOverlay(panel)` | Attach the settings panel above controls (z-index 25) |
| `registerControlButton(config)` | Add `◈` button to the controls bar |
| `videoElement` | Access the `<video>` element for `requestVideoFrameCallback` and `texImage2D` |

Note: this addon does **not** use `registerFrameCallback` or `captureFrame`. It drives its own frame loop directly via `videoElement.requestVideoFrameCallback` to avoid the downscaled `ImageData` copy that those APIs produce.

## Performance notes

- **readPixels stall eliminated by PBO double-buffering.** The async DMA path means `getBufferSubData` reads from data that is already in system RAM (~0–2 ms vs the ~20 ms synchronous stall). One frame of visual latency is introduced.
- **The WASM kernel is single-threaded.** Throughput is roughly proportional to pixel count. 1080p at 30 fps is comfortable on a modern machine; 4K is likely to drop frames.
- **Future optimisations:** WebAssembly SIMD (process 4 pixels at a time with `v128` ops), asynchronous readback via `PIXEL_PACK_BUFFER`, or moving the kernel to a WebGL/WebGPU compute shader to eliminate the GPU→CPU round-trip entirely.

## File layout

```
packages/wasm-sharpener/
  assembly/
    index.ts              AssemblyScript source — sharpening kernel
    build/
      release.wasm        Compiled output (built by npm run build:wasm)
  src/
    index.ts              Package entry — re-exports WasmSharpener
    WasmSharpener.ts      Addon class — lifecycle, UI panel, frame loop
    WasmPipeline.ts       WebGL2 pipeline — textures, FBO, WASM memory
    shaders.ts            GLSL vertex and fragment shaders
    vite-env.d.ts         Vite import type declarations
  package.json
  tsconfig.json
  README.md
```
