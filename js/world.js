import * as THREE from 'three';
import { R, BLOCK, HALF, GROUND_Y } from './config.js';
import { makeBoxWithAtlasUV } from './atlas.js';

export function createGround(scene, blockMat, atlas){
  const grassGeo = makeBoxWithAtlasUV(BLOCK,BLOCK,BLOCK, {
    top:atlas.tiles.grass_top, bottom:atlas.tiles.dirt, sides:atlas.tiles.grass_side
  });
  const dirtGeo  = makeBoxWithAtlasUV(BLOCK,BLOCK,BLOCK, {
    top:atlas.tiles.dirt, bottom:atlas.tiles.dirt, sides:atlas.tiles.dirt
  });

  const rBlocks = Math.floor(R / BLOCK);
  const r2 = rBlocks * rBlocks;
  const mat4 = new THREE.Matrix4();

  const surface = [];
  for (let ix=-rBlocks; ix<=rBlocks; ix++){
    for (let iz=-rBlocks; iz<=rBlocks; iz++){
      if (ix*ix+iz*iz <= r2) surface.push([ix*BLOCK+HALF, GROUND_Y+HALF, iz*BLOCK+HALF]);
    }
  }
  const groundSurface = new THREE.InstancedMesh(grassGeo, blockMat, surface.length);
  for (let i=0;i<surface.length;i++){ mat4.makeTranslation(...surface[i]); groundSurface.setMatrixAt(i, mat4); }
  scene.add(groundSurface);

  function isInside(ix,iz){ return ix*ix+iz*iz <= r2; }
  const edges=[];
  for (let ix=-rBlocks; ix<=rBlocks; ix++){
    for (let iz=-rBlocks; iz<=rBlocks; iz++){
      if (!isInside(ix,iz)) continue;
      const outside = !isInside(ix+1,iz)||!isInside(ix-1,iz)||!isInside(ix,iz+1)||!isInside(ix,iz-1);
      if (outside) edges.push([ix*BLOCK+HALF, iz*BLOCK+HALF]);
    }
  }
  const WALL_DOWN=1;
  const wallMesh = new THREE.InstancedMesh(dirtGeo, blockMat, edges.length*WALL_DOWN);
  let wi=0;
  for (let i=0;i<edges.length;i++){
    const [x,z]=edges[i];
    for (let d=1; d<=WALL_DOWN; d++){
      mat4.makeTranslation(x, GROUND_Y+HALF - d*BLOCK, z);
      wallMesh.setMatrixAt(wi++, mat4);
    }
  }
  scene.add(wallMesh);

  return { groundSurface, wallMesh };
}
