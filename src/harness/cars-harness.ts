// Placeholder: the car-model builder replaces this file.
import * as THREE from 'three';
import { createHarnessScene } from '@/harness/harness-scene';

const h = createHarnessScene();
const box = new THREE.Mesh(new THREE.BoxGeometry(1.96, 1.2, 4.97), new THREE.MeshStandardMaterial({ color: 0xc8102e, roughness: 0.3, metalness: 0.2 }));
box.position.y = 0.6;
box.castShadow = true;
h.scene.add(box);
h.markReady({ placeholder: true }, 10);
