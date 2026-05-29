// Laplacian sharpening kernel — optimised for the interior hot path.
//
// Kernel: center = 1 + 4*amount, each of 4 neighbours = -amount
// At amount=0 the kernel is identity; at amount=1 it is the standard 5-tap sharpener.
// RGB channels are sharpened; alpha is copied unchanged.
//
// Strategy:
//   1. Copy the 1-pixel border from input to output unchanged (border pixels are
//      ~0.3% of a 1080p frame — no worth paying 4 clamping branches per interior pixel).
//   2. Process all interior pixels on a branch-free hot path using i32 fixed-point
//      arithmetic (avoids 15 u8→f32 + 3 f32→u8 conversions per pixel) with the
//      channel loop unrolled so the compiler sees three independent instruction streams.
export function sharpen(
  inPtr: usize,
  outPtr: usize,
  width: i32,
  height: i32,
  amount: f32,
): void {
  if (width < 2 || height < 2) return;

  const stride: i32 = width << 2;

  // Kernel weights in Q8 fixed-point (×256) so the hot loop stays in i32 arithmetic.
  // After accumulating: (centerWeight * p - neighborWeight * Σneighbors + 128) >> 8
  // The +128 before the right-shift rounds to nearest instead of truncating.
  // Overflow check at amount=3: centerWeight * 255 = (13×256)×255 = 848 640 < 2³⁰ ✓
  const centerWeight:   i32 = i32((1.0 + 4.0 * amount) * 256.0 + 0.5);
  const neighborWeight: i32 = i32(amount               * 256.0 + 0.5);

  // ── Border: copy top and bottom rows unchanged ──────────────────────────────
  for (let x: i32 = 0; x < width; x++) {
    let p: usize = usize(x << 2);
    store<u32>(outPtr + p, load<u32>(inPtr + p));
    p = usize((height - 1) * stride + (x << 2));
    store<u32>(outPtr + p, load<u32>(inPtr + p));
  }
  // Copy left and right column pixels (excluding corners already done above)
  for (let y: i32 = 1; y < height - 1; y++) {
    let p: usize = usize(y * stride);
    store<u32>(outPtr + p, load<u32>(inPtr + p));
    p = usize(y * stride + ((width - 1) << 2));
    store<u32>(outPtr + p, load<u32>(inPtr + p));
  }

  // ── Interior: branch-free, i32 fixed-point, unrolled channels ───────────────
  for (let y: i32 = 1; y < height - 1; y++) {
    const row:  usize = usize(y       * stride);
    const prev: usize = usize((y - 1) * stride);
    const next: usize = usize((y + 1) * stride);

    for (let x: i32 = 1; x < width - 1; x++) {
      const p: usize = row  + usize(x << 2);
      const l: usize = p - 4;
      const r: usize = p + 4;
      const t: usize = prev + usize(x << 2);
      const b: usize = next + usize(x << 2);

      let v: i32;

      // R
      v = centerWeight * i32(load<u8>(inPtr + p))
        - neighborWeight * (i32(load<u8>(inPtr + l)) + i32(load<u8>(inPtr + r))
                 + i32(load<u8>(inPtr + t)) + i32(load<u8>(inPtr + b)));
      store<u8>(outPtr + p, u8(min(255, max(0, (v + 128) >> 8))));

      // G
      v = centerWeight * i32(load<u8>(inPtr + p + 1))
        - neighborWeight * (i32(load<u8>(inPtr + l + 1)) + i32(load<u8>(inPtr + r + 1))
                 + i32(load<u8>(inPtr + t + 1)) + i32(load<u8>(inPtr + b + 1)));
      store<u8>(outPtr + p + 1, u8(min(255, max(0, (v + 128) >> 8))));

      // B
      v = centerWeight * i32(load<u8>(inPtr + p + 2))
        - neighborWeight * (i32(load<u8>(inPtr + l + 2)) + i32(load<u8>(inPtr + r + 2))
                 + i32(load<u8>(inPtr + t + 2)) + i32(load<u8>(inPtr + b + 2)));
      store<u8>(outPtr + p + 2, u8(min(255, max(0, (v + 128) >> 8))));

      // Alpha passthrough
      store<u8>(outPtr + p + 3, load<u8>(inPtr + p + 3));
    }
  }
}
