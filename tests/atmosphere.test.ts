import * as THREE from 'three';
import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_GRAPHICS, getGraphics, importGraphics, QUALITY, resetGraphics, setGraphics, sunDirection } from '@/config/graphics';
import { BATHURST_LOCATION, raceDay, solarPosition } from '@/world/solar-position';
import { createAerialPerspective, heightDensity } from '@/world/aerial-perspective';
import { createSky } from '@/world/sky';

afterEach(() => resetGraphics());

describe('race-day sunlight', () => {
  it('uses the second Sunday in October, with an explicit AEDT clock', () => {
    expect(raceDay(2026)).toBe('2026-10-11');
    expect(raceDay(2025)).toBe('2025-10-12');
    expect(raceDay(2023)).toBe('2023-10-08');
    expect(DEFAULT_GRAPHICS.timeOfDay).toBe(15);
  });

  it('puts the afternoon sun in the north-west at its astronomical elevation', () => {
    const sun = solarPosition(BATHURST_LOCATION, '2026-10-11', 15, 11);
    expect(sun.elevationDeg).toBeGreaterThan(49);
    expect(sun.elevationDeg).toBeLessThan(53);
    expect(sun.azimuthDeg).toBeGreaterThan(299);
    expect(sun.azimuthDeg).toBeLessThan(305);
    const [x, y, z] = sunDirection(DEFAULT_GRAPHICS);
    expect(x).toBeLessThan(0);
    expect(y).toBeGreaterThan(0.7);
    expect(z).toBeLessThan(0);
    expect(Math.hypot(x, y, z)).toBeCloseTo(1, 12);
  });

  it('moves from east to west when the live time changes', () => {
    setGraphics({ timeOfDay: 9 });
    expect(sunDirection()[0]).toBeGreaterThan(0);
    setGraphics({ timeOfDay: 17 });
    expect(sunDirection()[0]).toBeLessThan(0);
    expect(sunDirection()[1]).toBeLessThan(sunDirection(DEFAULT_GRAPHICS)[1]);
  });

  it('accounts for longitude and the timezone, including leap-year dates', () => {
    const local = solarPosition(BATHURST_LOCATION, '2024-10-13', 15, 11);
    const shifted = solarPosition({ ...BATHURST_LOCATION, longitude: BATHURST_LOCATION.longitude + 15 }, '2024-10-13', 15, 12);
    expect(shifted.elevationDeg).toBeCloseTo(local.elevationDeg, 10);
    expect(shifted.azimuthDeg).toBeCloseTo(local.azimuthDeg, 10);
  });

  it('rejects invalid clocks and tone names without poisoning graphics state', () => {
    expect(importGraphics('{"timeOfDay":1e400,"toneMapping":"Bogus"}')).toBe(false);
    expect(getGraphics().timeOfDay).toBe(15);
    expect(getGraphics().toneMapping).toBe(DEFAULT_GRAPHICS.toneMapping);
    expect(importGraphics('{"timeOfDay":17.5,"toneMapping":"Neutral"}')).toBe(true);
    expect(getGraphics().toneMapping).toBe('Neutral');
  });
});

describe('atmosphere tiers and live updates', () => {
  it('keeps bloom and the physical scattering shader on High', () => {
    expect(QUALITY.low.bloom).toBe(false);
    expect(QUALITY.medium.bloom).toBe(false);
    expect(QUALITY.high.bloom).toBe(true);
    expect(QUALITY.low.physicalSky).toBe(false);
    expect(QUALITY.medium.physicalSky).toBe(false);
    expect(QUALITY.high.physicalSky).toBe(true);
  });

  it('updates sky scattering, sun and cloud coverage without rebuilding geometry', () => {
    const sky = createSky(new THREE.Scene(), 9000, 'high');
    const geometry = sky.dome.geometry;
    sky.apply({ ...DEFAULT_GRAPHICS, timeOfDay: 17, skyTurbidity: 5, cloudCoverage: 0.2 });
    const material = sky.dome.material as THREE.ShaderMaterial;
    expect(material.uniforms.turbidity.value).toBe(5);
    expect(material.uniforms.cloudCoverage.value).toBe(0.2);
    expect(material.uniforms.sunPosition.value.x).toBeLessThan(0);
    expect(sky.dome.geometry).toBe(geometry);
    sky.setQuality('medium');
    expect((sky.dome.material as THREE.ShaderMaterial).uniforms.sunDir.value.x).toBeLessThan(0);
  });

  it('makes the valley atmosphere denser than the mountain air', () => {
    expect(heightDensity(0, 0.004)).toBe(1);
    expect(heightDensity(174, 0.004)).toBeCloseTo(0.4986, 3);
    expect(heightDensity(-60, 0.004)).toBeGreaterThan(1);
    expect(heightDensity(10000, 0.004)).toBeGreaterThan(0);
  });

  it('preserves existing material hooks and bypasses aerial perspective on Low', () => {
    const scene = new THREE.Scene();
    const mat = new THREE.MeshStandardMaterial();
    mat.onBeforeCompile = (shader) => { shader.uniforms.existing = { value: 42 }; };
    scene.add(new THREE.Mesh(new THREE.BoxGeometry(), mat));
    const haze = createAerialPerspective(scene);
    haze.prepare(new THREE.PerspectiveCamera());
    const shader = { vertexShader: THREE.ShaderLib.standard.vertexShader, fragmentShader: THREE.ShaderLib.standard.fragmentShader, uniforms: {} as Record<string, THREE.IUniform> };
    mat.onBeforeCompile(shader as Parameters<THREE.Material['onBeforeCompile']>[0], {} as THREE.WebGLRenderer);
    expect(shader.uniforms.existing.value).toBe(42);
    expect(shader.fragmentShader.indexOf('bathurstHazeColour')).toBeLessThan(shader.fragmentShader.indexOf('#include <tonemapping_fragment>'));
    expect(shader.vertexShader).toContain('instanceMatrix * bathurstFogPosition');
    const highKey = mat.customProgramCacheKey();
    const highVersion = mat.version;
    haze.setEnabled(false);
    expect(mat.customProgramCacheKey()).not.toBe(highKey);
    expect(mat.version).toBeGreaterThan(highVersion);
  });
});
