import * as THREE from 'three';
import { GROUND_TOP_Y, SHADOW_MAX_DISTANCE, SOFT_RADIUS_TEXELS } from './config.js';

export function createShadowMaterial(atlasTex, texelSize){
  const uniforms = {
    map:         { value: atlasTex },
    lightDir:    { value: new THREE.Vector3(0,-1,0) },
    groundY:     { value: GROUND_TOP_Y },
    opacity:     { value: 0.35 },
    biasY:       { value: 0.02 },
    maxDistance: { value: SHADOW_MAX_DISTANCE },
    sunFade:     { value: 1.0 },
    texelSize:   { value: texelSize },
    softRadius:  { value: SOFT_RADIUS_TEXELS }
  };

  const vert = `
    precision mediump float;
    uniform vec3  lightDir;
    uniform float groundY;
    uniform float biasY;
    uniform float maxDistance;
    varying vec2 vUv;
    void main(){
      mat4 inst = mat4(1.0);
      #ifdef USE_INSTANCING
        inst = instanceMatrix;
      #endif
      vec4 worldPos = modelMatrix * inst * vec4(position, 1.0);
      float denom = lightDir.y;
      vec3 proj = worldPos.xyz;
      if (abs(denom) > 1e-4) {
        float t = (groundY - worldPos.y) / denom;
        t = max(t, 0.0);
        vec3 hit = worldPos.xyz + lightDir * t;
        vec3 delta = hit - worldPos.xyz;
        float dist = length(delta);
        if (dist > maxDistance) {
          delta *= maxDistance / dist;
          hit = worldPos.xyz + delta;
        }
        proj = hit;
      }
      proj.y = groundY + biasY;
      vUv = uv;
      gl_Position = projectionMatrix * viewMatrix * vec4(proj,1.0);
    }`;

  const frag = `
    precision mediump float;
    uniform sampler2D map;
    uniform float opacity;
    uniform float sunFade;
    uniform vec2  texelSize;
    uniform float softRadius;
    varying vec2 vUv;
    float sampleAlpha(vec2 u){ return texture2D(map, u).a; }
    void main(){
      float a;
      if (softRadius <= 0.0001) {
        a = sampleAlpha(vUv);
      } else {
        vec2 o = texelSize * softRadius;
        float a0 = sampleAlpha(vUv);
        float a1 = sampleAlpha(vUv + vec2( o.x, 0.0));
        float a2 = sampleAlpha(vUv + vec2(-o.x, 0.0));
        float a3 = sampleAlpha(vUv + vec2(0.0,  o.y));
        float a4 = sampleAlpha(vUv + vec2(0.0, -o.y));
        a = (a0 + a1 + a2 + a3 + a4) * 0.2;
      }
      if (a < 0.02) discard;
      gl_FragColor = vec4(0.0,0.0,0.0, a*opacity*sunFade);
    }`;

  return new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.clone(uniforms),
    vertexShader: vert,
    fragmentShader: frag,
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1
  });
}

export function makeShadowFrom(sourceInstanced, baseMat, atlasTex, texelSize){
  const mat = baseMat.clone();
  mat.uniforms.map.value         = atlasTex;
  mat.uniforms.groundY.value     = GROUND_TOP_Y;
  mat.uniforms.biasY.value       = 0.02;
  mat.uniforms.maxDistance.value = mat.uniforms.maxDistance.value;
  mat.uniforms.sunFade.value     = 1.0;
  mat.uniforms.texelSize.value.copy(texelSize);

  const capacity =
    (sourceInstanced.instanceMatrix && sourceInstanced.instanceMatrix.count) ||
    sourceInstanced.count || 0;

  const shadow = new THREE.InstancedMesh(sourceInstanced.geometry, mat, capacity);

  const tmp = new THREE.Matrix4();
  const pos = new THREE.Vector3();
  let keep = 0;
  for (let i=0;i<sourceInstanced.count;i++){
    sourceInstanced.getMatrixAt(i, tmp);
    tmp.decompose(pos, new THREE.Quaternion(), new THREE.Vector3());
    if (pos.y > GROUND_TOP_Y) shadow.setMatrixAt(keep++, tmp);
  }
  shadow.count = keep;
  shadow.instanceMatrix.needsUpdate = true;
  shadow.renderOrder = 0.5;
  return shadow;
}

// 잎이 바뀔 때 그림자 인스턴스 재동기화
export function resyncShadowFrom(shadow, source){
  const tmp = new THREE.Matrix4();
  const pos = new THREE.Vector3();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  let keep = 0;

  const capacity =
    (shadow.instanceMatrix && shadow.instanceMatrix.count) ||
    shadow.count || 0;

  const n = Math.min(source.count, capacity);
  for (let i = 0; i < n; i++) {
    source.getMatrixAt(i, tmp);
    tmp.decompose(pos, q, s);
    if (pos.y > GROUND_TOP_Y) {
      shadow.setMatrixAt(keep++, tmp);
    }
  }
  shadow.count = keep;
  shadow.instanceMatrix.needsUpdate = true;
}

export function setShadowUniforms(shadows, apply){
  for (const s of shadows){
    apply(s.material.uniforms);
  }
}
export function updateShadowLightDir(dir, shadows){
  const L = dir.position.clone().normalize().multiplyScalar(-1);
  setShadowUniforms(shadows, u => u.lightDir.value.copy(L));
}
