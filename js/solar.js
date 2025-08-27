import * as THREE from 'three';
import { R } from './config.js';

export function horizontalFrom(phi, delta, H){
  const sinφ=Math.sin(phi), cosφ=Math.cos(phi);
  const sinδ=Math.sin(delta), cosδ=Math.cos(delta);
  const cosH=Math.cos(H), sinH=Math.sin(H);
  const xE = cosδ * sinH;
  const yU = sinφ * sinδ + cosφ * cosδ * cosH;
  const zN = cosφ * sinδ - sinφ * cosδ * cosH;
  return { alt: Math.asin(yU), az: Math.atan2(xE, zN) };
}
export function positionOnDome(alt, az, radius=R){
  const rp = radius * Math.cos(alt);
  const y  = radius * Math.sin(alt);
  const x  = rp * Math.sin(az);
  const z  = -rp * Math.cos(az);
  return new THREE.Vector3(x,y,z);
}
