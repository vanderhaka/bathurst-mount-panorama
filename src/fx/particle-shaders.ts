export const particleVertex = /* glsl */ `
attribute vec3 aOffset;
attribute vec4 aColour;
attribute vec3 aDirection;
attribute vec2 aShape;
attribute vec2 aStyle;
varying vec4 vColour;
varying vec2 vUv;
varying vec2 vStyle;
varying float vFogDepth;
void main() {
  vColour = aColour; vUv = position.xy; vStyle = aStyle;
  vec3 centre = aOffset;
  if (aStyle.x > 3.5) centre += normalize(aDirection) * aShape.y;
  vec4 mv = modelViewMatrix * vec4(centre, 1.0);
  vec3 axis = mat3(modelViewMatrix) * aDirection;
  vec2 along = normalize(axis.xy + vec2(0.00001, 0.00001));
  vec2 across = vec2(along.y, -along.x);
  float halfLength = aStyle.x < 2.5 ? aShape.y : mix(aShape.x, aShape.y, min(1.0, length(axis.xy) / max(0.0001, length(axis))));
  mv.xy += across * position.x * aShape.x + along * position.y * halfLength;
  vFogDepth = -mv.z;
  gl_Position = projectionMatrix * mv;
}`;

export const particleFragment = /* glsl */ `
uniform vec3 sunDir;
uniform vec3 fogColor;
uniform float fogDensity;
varying vec4 vColour;
varying vec2 vUv;
varying vec2 vStyle;
varying float vFogDepth;
void main() {
  float radial = dot(vUv, vUv);
  float soft = 1.0 - smoothstep(0.35, 1.0, radial);
  vec3 col = vColour.rgb;
  if (vStyle.x < 1.5) {
    float wisps = 0.78 + 0.22 * sin(vUv.x * 13.0 + vStyle.y) * sin(vUv.y * 17.0 - vStyle.y);
    soft *= exp(-radial * 1.6) * wisps;
    vec3 n = normalize(vec3(vUv, sqrt(max(0.01, 1.0 - radial))));
    vec3 worldNormal = vec3(dot(viewMatrix[0].xyz, n), dot(viewMatrix[1].xyz, n), dot(viewMatrix[2].xyz, n));
    col *= 0.65 + 0.35 * max(dot(worldNormal, sunDir), 0.0);
  } else if (vStyle.x > 3.5) {
    float taper = mix(0.85, 0.16, (vUv.y + 1.0) * 0.5);
    soft = (1.0 - smoothstep(taper * 0.5, taper, abs(vUv.x))) * (1.0 - smoothstep(0.5, 1.0, abs(vUv.y)));
    col = mix(vec3(0.3, 0.65, 3.8), col, smoothstep(-0.95, 0.2, vUv.y));
  }
  float alpha = vColour.a * soft * smoothstep(0.25, 1.2, vFogDepth);
  if (alpha < 0.003) discard;
  float fog = 1.0 - exp(-fogDensity * fogDensity * vFogDepth * vFogDepth);
  if (vStyle.x > 2.5) col *= 1.0 - fog;
  else col = mix(col, fogColor, fog);
  gl_FragColor = vec4(col, alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;
