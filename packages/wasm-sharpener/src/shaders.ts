// WebGL2 shaders for rendering a texture to a fullscreen quad.
// gl_VertexID drives the quad without any VBO, so no vertex buffer setup needed.

export const VERT = /* glsl */`#version 300 es
out vec2 vUv;
void main() {
  // 4-vertex TRIANGLE_STRIP: IDs 0,1,2,3 → UVs (0,0),(1,0),(0,1),(1,1)
  vec2 uv = vec2(float(gl_VertexID & 1), float((gl_VertexID >> 1) & 1));
  vUv = uv;
  gl_Position = vec4(uv * 2.0 - 1.0, 0.0, 1.0);
}
`;

// Passthrough – just sample the texture.
// Y is NOT flipped here: the input/output textures are oriented consistently
// (video uploaded with UNPACK_FLIP_Y_WEBGL=1, readPixels and texSubImage2D with 0).
export const FRAG = /* glsl */`#version 300 es
precision mediump float;
in vec2 vUv;
uniform sampler2D uTex;
out vec4 fragColor;
void main() {
  fragColor = texture(uTex, vUv);
}
`;
