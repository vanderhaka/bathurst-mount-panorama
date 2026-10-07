import * as THREE from 'three';
import { SUN_DIRECTION } from '@/world/sky';

export type ParticleKind = 'smoke' | 'dust' | 'gravel' | 'spark';

interface Particle { alive: boolean; x: number; y: number; z: number; vx: number; vy: number; vz: number; age: number; life: number; size: number; grow: number; r: number; g: number; b: number; alpha: number; drag: number; gravity: number }

const MAX = 1400;

const vertexShader = /* glsl */ `
  attribute vec3 aOffset;
  attribute vec4 aColour;
  attribute float aScale;
  varying vec4 vColour;
  varying vec3 vNormal;
  varying vec3 vNormalView;
  varying float vFogDepth;
  void main() {
    vColour = aColour;
    vNormal = normalize(normal);
    vNormalView = normalize(normalMatrix * normal);
    vec3 p = position * aScale + aOffset;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    vFogDepth = -mv.z;
    gl_Position = projectionMatrix * mv;
  }
`;

const fragmentShader = /* glsl */ `
  uniform vec3 sunDir;
  uniform vec3 fogColor;
  uniform float fogDensity;
  varying vec4 vColour;
  varying vec3 vNormal;
  varying vec3 vNormalView;
  varying float vFogDepth;
  void main() {
    float light = 0.55 + 0.45 * max(dot(normalize(vNormal), sunDir), 0.0);
    vec3 col = vColour.rgb * mix(light, 1.0, step(1.5, vColour.r + vColour.g));
    float fog = 1.0 - exp(-fogDensity * fogDensity * vFogDepth * vFogDepth);
    col = mix(col, fogColor, fog);
    // Fade puffs that are very close to the camera (cockpit view through smoke).
    float nearFade = smoothstep(1.2, 6.0, vFogDepth);
    // Soft edge: the puff thins out towards its silhouette (no hard plates).
    float soft = smoothstep(0.05, 0.85, abs(normalize(vNormalView).z));
    gl_FragColor = vec4(col, vColour.a * nearFade * soft);
    #include <colorspace_fragment>
  }
`;

/** Medium-poly particle puffs (instanced icosahedra) for tyre smoke, dust, gravel spray and sparks. */
export class Particles {
  readonly mesh: THREE.Mesh;
  private readonly pool: Particle[] = [];
  private readonly offset: THREE.InstancedBufferAttribute;
  private readonly colour: THREE.InstancedBufferAttribute;
  private readonly scale: THREE.InstancedBufferAttribute;
  private readonly geo: THREE.InstancedBufferGeometry;
  private next = 0;

  constructor(scene: THREE.Scene) {
    const base = new THREE.IcosahedronGeometry(1, 1);
    this.geo = new THREE.InstancedBufferGeometry();
    this.geo.index = base.index;
    this.geo.setAttribute('position', base.getAttribute('position'));
    this.geo.setAttribute('normal', base.getAttribute('normal'));
    this.offset = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.colour = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.scale = new THREE.InstancedBufferAttribute(new Float32Array(MAX), 1).setUsage(THREE.DynamicDrawUsage);
    this.geo.setAttribute('aOffset', this.offset);
    this.geo.setAttribute('aColour', this.colour);
    this.geo.setAttribute('aScale', this.scale);
    this.geo.instanceCount = 0;
    const fog = scene.fog as THREE.FogExp2 | null;
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        sunDir: { value: SUN_DIRECTION },
        fogColor: { value: fog ? fog.color : new THREE.Color(0xc9d8de) },
        fogDensity: { value: fog ? fog.density : 0 },
      },
      vertexShader, fragmentShader, transparent: true, depthWrite: false,
    });
    this.mesh = new THREE.Mesh(this.geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 5;
    this.mesh.name = 'particles';
    for (let i = 0; i < MAX; i++) this.pool.push({ alive: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, age: 0, life: 1, size: 1, grow: 0, r: 1, g: 1, b: 1, alpha: 1, drag: 0, gravity: 0 });
    scene.add(this.mesh);
  }

  emit(kind: ParticleKind, x: number, y: number, z: number, vx: number, vy: number, vz: number, intensity = 1): void {
    const p = this.pool[this.next];
    this.next = (this.next + 1) % MAX;
    const j = () => (Math.random() - 0.5) * 2;
    p.alive = true; p.age = 0;
    p.x = x; p.y = y; p.z = z;
    if (kind === 'smoke') {
      p.vx = vx * 0.35 + j() * 0.8; p.vy = vy + 0.6 + Math.random() * 0.8; p.vz = vz * 0.35 + j() * 0.8;
      p.life = 1.0 + Math.random() * 0.8; p.size = 0.3; p.grow = 0.8 + 0.6 * intensity; p.alpha = 0.18 + 0.22 * intensity;
      const c = 0.82 + Math.random() * 0.1; p.r = c; p.g = c; p.b = c * 1.02; p.drag = 1.6; p.gravity = -0.25;
    } else if (kind === 'dust' || kind === 'gravel') {
      p.vx = vx * 0.5 + j() * 1.5; p.vy = 0.8 + Math.random() * 1.6; p.vz = vz * 0.5 + j() * 1.5;
      p.life = 0.9 + Math.random() * 1.0; p.size = kind === 'gravel' ? 0.1 : 0.3; p.grow = kind === 'gravel' ? 0 : 1.05;
      p.alpha = kind === 'gravel' ? 1 : 0.26 * intensity;
      if (kind === 'gravel') { p.r = 0.55; p.g = 0.48; p.b = 0.38; p.gravity = 9.81; p.drag = 0.4; p.vy += 2; }
      else { p.r = 0.62; p.g = 0.52; p.b = 0.38; p.gravity = -0.1; p.drag = 1.2; }
    } else {
      p.vx = vx + j() * 5; p.vy = 1.5 + Math.random() * 3.5; p.vz = vz + j() * 5;
      p.life = 0.35 + Math.random() * 0.35; p.size = 0.045; p.grow = -0.05; p.alpha = 1;
      p.r = 3.0; p.g = 1.6; p.b = 0.5; p.drag = 0.6; p.gravity = 9.81;
    }
  }

  update(dt: number): void {
    let n = 0;
    const off = this.offset.array as Float32Array, col = this.colour.array as Float32Array, sc = this.scale.array as Float32Array;
    for (const p of this.pool) {
      if (!p.alive) continue;
      p.age += dt;
      if (p.age >= p.life) { p.alive = false; continue; }
      const k = Math.exp(-p.drag * dt);
      p.vx *= k; p.vz *= k; p.vy = p.vy * k - p.gravity * dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      const t = p.age / p.life;
      off[n * 3] = p.x; off[n * 3 + 1] = p.y; off[n * 3 + 2] = p.z;
      sc[n] = Math.max(0.01, p.size + p.grow * p.age);
      col[n * 4] = p.r; col[n * 4 + 1] = p.g; col[n * 4 + 2] = p.b;
      col[n * 4 + 3] = p.alpha * (1 - t) * Math.min(1, p.age * 10);
      n++;
    }
    this.geo.instanceCount = n;
    this.offset.needsUpdate = true;
    this.colour.needsUpdate = true;
    this.scale.needsUpdate = true;
  }
}
