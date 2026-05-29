import { VERT, FRAG } from './shaders.js';

interface WasmExports {
  sharpen(inPtr: number, outPtr: number, width: number, height: number, amount: number): void;
  __new(size: number, id: number): number;
  memory: WebAssembly.Memory;
}

function compileShader(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const s = gl.createShader(type)!;
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS))
    throw new Error(gl.getShaderInfoLog(s) ?? 'shader compile failed');
  return s;
}

function linkProgram(gl: WebGL2RenderingContext, vert: string, frag: string): WebGLProgram {
  const p = gl.createProgram()!;
  gl.attachShader(p, compileShader(gl, gl.VERTEX_SHADER, vert));
  gl.attachShader(p, compileShader(gl, gl.FRAGMENT_SHADER, frag));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS))
    throw new Error(gl.getProgramInfoLog(p) ?? 'program link failed');
  return p;
}

export class WasmPipeline {
  private readonly gl: WebGL2RenderingContext;
  private readonly program: WebGLProgram;
  private readonly fbo: WebGLFramebuffer;
  private readonly inputTex: WebGLTexture;
  private readonly outputTex: WebGLTexture;
  private readonly wasm: WasmExports;

  // PBO double-buffering: readPixels writes into pbos[writeIdx] asynchronously (DMA, no stall).
  // The next frame reads pbos[readIdx] via getBufferSubData — data is already in system memory.
  private readonly pbos: [WebGLBuffer, WebGLBuffer];
  private pboIndex = 0;  // which PBO to write into this frame
  private pboReady = false;  // false until the first async readback has been issued

  private inputPtr = 0;
  private outputPtr = 0;
  private inputView: Uint8ClampedArray | null = null;
  private outputView: Uint8ClampedArray | null = null;
  private bufW = 0;
  private bufH = 0;

  private constructor(canvas: HTMLCanvasElement, wasm: WasmExports) {
    this.wasm = wasm;

    const gl = canvas.getContext('webgl2', { alpha: true, premultipliedAlpha: false, antialias: false });
    if (!gl) throw new Error('WebGL2 not available');
    this.gl = gl;

    this.program = linkProgram(gl, VERT, FRAG);
    gl.useProgram(this.program);
    gl.uniform1i(gl.getUniformLocation(this.program, 'uTex'), 0);

    this.fbo = gl.createFramebuffer()!;
    this.inputTex  = this.createTex();
    this.outputTex = this.createTex();
    this.pbos = [gl.createBuffer()!, gl.createBuffer()!];
  }

  static async create(canvas: HTMLCanvasElement, wasmUrl: string): Promise<WasmPipeline> {
    const imports = {
      env: {
        abort(_msg: number, _file: number, line: number, col: number): void {
          console.error(`WASM abort at ${line}:${col}`);
        },
      },
    };

    let instance: WebAssembly.Instance;
    try {
      ({ instance } = await WebAssembly.instantiateStreaming(fetch(wasmUrl), imports));
    } catch {
      const buf = await (await fetch(wasmUrl)).arrayBuffer();
      ({ instance } = await WebAssembly.instantiate(buf, imports));
    }

    return new WasmPipeline(canvas, instance.exports as unknown as WasmExports);
  }

  // Upload video → GPU async readback → WASM sharpen (1-frame delayed) → GPU upload → render.
  processFrame(video: HTMLVideoElement, amount: number): void {
    const vw = video.videoWidth, vh = video.videoHeight;
    if (!vw || !vh) return;

    this.syncCanvasSize();
    this.ensureBuffers(vw, vh);

    const gl = this.gl;
    const writeIdx = this.pboIndex;
    const readIdx  = 1 - this.pboIndex;

    // 1. Video frame → inputTex (GPU-to-GPU, flip Y so texture is right-side-up)
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 1);
    gl.bindTexture(gl.TEXTURE_2D, this.inputTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video);

    // 2. inputTex → pbos[writeIdx] via async DMA (non-blocking — returns before GPU finishes)
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.inputTex, 0);
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, this.pbos[writeIdx]);
    gl.readPixels(0, 0, vw, vh, gl.RGBA, gl.UNSIGNED_BYTE, 0);  // 0 = byte offset into PBO
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    if (this.pboReady) {
      // 3. pbos[readIdx] → WASM heap (data from previous frame; DMA completed ~16 ms ago)
      //    getBufferSubData is fast here: no GPU sync stall, data is already in system RAM
      gl.bindBuffer(gl.PIXEL_PACK_BUFFER, this.pbos[readIdx]);
      gl.getBufferSubData(gl.PIXEL_PACK_BUFFER, 0, this.inputView!);
      gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);

      // 4. WASM sharpening (CPU, 1-frame delayed pixel data)
      this.wasm.sharpen(this.inputPtr, this.outputPtr, vw, vh, amount);

      // 5. WASM output → outputTex (CPU→GPU, no Y-flip — same orientation as async readback)
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 0);
      gl.bindTexture(gl.TEXTURE_2D, this.outputTex);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, vw, vh, gl.RGBA, gl.UNSIGNED_BYTE, this.outputView!);

      // 6. Render outputTex to canvas, letterboxed to preserve video aspect ratio
      const cw = gl.canvas.width, ch = gl.canvas.height;
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);

      const va = vw / vh, ca = cw / ch;
      let vpW = cw, vpH = ch, vpX = 0, vpY = 0;
      if (va > ca) {
        vpH = Math.round(cw / va);
        vpY = Math.round((ch - vpH) / 2);
      } else {
        vpW = Math.round(ch * va);
        vpX = Math.round((cw - vpW) / 2);
      }

      gl.viewport(vpX, vpY, vpW, vpH);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.outputTex);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }

    this.pboIndex = readIdx;  // swap ping-pong
    this.pboReady = true;
  }

  clear(): void {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
  }

  destroy(): void {
    const gl = this.gl;
    gl.deleteBuffer(this.pbos[0]);
    gl.deleteBuffer(this.pbos[1]);
    gl.deleteTexture(this.inputTex);
    gl.deleteTexture(this.outputTex);
    gl.deleteFramebuffer(this.fbo);
    gl.deleteProgram(this.program);
  }

  private createTex(): WebGLTexture {
    const gl = this.gl;
    const t = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  }

  private syncCanvasSize(): void {
    const canvas = this.gl.canvas as HTMLCanvasElement;
    const dpr = window.devicePixelRatio || 1;
    const w = Math.round(canvas.offsetWidth  * dpr);
    const h = Math.round(canvas.offsetHeight * dpr);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width  = w;
      canvas.height = h;
    }
  }

  private ensureBuffers(w: number, h: number): void {
    if (w === this.bufW && h === this.bufH) return;
    this.bufW = w;
    this.bufH = h;
    // Dimensions changed — PBO contents are stale, restart the ping-pong cycle.
    this.pboReady = false;
    this.pboIndex = 0;

    const size = w * h * 4;

    // Allocate directly in WASM linear memory (stub runtime bump allocator).
    this.inputPtr  = this.wasm.__new(size, 0);
    this.outputPtr = this.wasm.__new(size, 0);

    // Create views after both allocs — WASM memory may have grown, so use current .buffer.
    const mem = this.wasm.memory.buffer;
    this.inputView  = new Uint8ClampedArray(mem, this.inputPtr,  size);
    this.outputView = new Uint8ClampedArray(mem, this.outputPtr, size);

    // (Re)size GPU textures to the video dimensions
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.inputTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.bindTexture(gl.TEXTURE_2D, this.outputTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);

    // (Re)size both PBOs to fit the new frame dimensions
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, this.pbos[0]);
    gl.bufferData(gl.PIXEL_PACK_BUFFER, size, gl.STREAM_READ);
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, this.pbos[1]);
    gl.bufferData(gl.PIXEL_PACK_BUFFER, size, gl.STREAM_READ);
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
  }
}
