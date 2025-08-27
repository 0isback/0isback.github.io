import * as THREE from 'three';
import { OrbitControls } from 'OrbitControls';
import { GROUND_TOP_Y } from './config.js';

export function createScene() {
  const app = document.getElementById('app');
  const renderer = new THREE.WebGLRenderer({ antialias:true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  app.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 4000);
  camera.position.set(-75, 80, -150);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.enablePan = false;
  controls.dollyToCursor = false;
  controls.minDistance = 30;
  controls.maxDistance = 200;
  controls.target.set(0, GROUND_TOP_Y * 0.6, 0);
  controls.minPolarAngle = 0.0;
  controls.maxPolarAngle = THREE.MathUtils.degToRad(88);
  controls.update();

  // Lights
  scene.add(new THREE.AmbientLight(0xffffff, 0.55));
  const dir = new THREE.DirectionalLight(0xffffff, 0.6);
  dir.position.set(80, 120, 60);
  scene.add(dir);

  return { renderer, scene, camera, controls, dir };
}
