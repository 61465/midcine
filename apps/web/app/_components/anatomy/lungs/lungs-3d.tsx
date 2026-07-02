'use client';

import { useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import type { LungState } from './presets';

function LungsMesh({ state, rr }: { state: LungState; rr: number }) {
  const leftRef = useRef<THREE.Mesh>(null);
  const rightRef = useRef<THREE.Mesh>(null);
  const cycleRef = useRef({ t: 0 });

  useFrame((_s, delta) => {
    // One full cycle = 60/rr seconds
    const cycleLen = 60 / rr;
    cycleRef.current.t = (cycleRef.current.t + delta / cycleLen) % 1;
    const t = cycleRef.current.t;
    // I:E ratio — inspiration takes t < iFrac, expiration the rest
    const iFrac = 1 / (1 + state.ieRatio);
    const phase = t < iFrac ? t / iFrac : 1 - (t - iFrac) / (1 - iFrac);
    const expand = 1 + phase * 0.15 * state.tidalVolume;

    // Left lung
    if (leftRef.current) {
      const asymScale = state.sideAsymmetric === 'left' ? 0.6 : 1.0;
      leftRef.current.scale.set(1, expand * asymScale, 1);
      (leftRef.current.material as THREE.MeshStandardMaterial).color.set(
        state.sideAsymmetric === 'left' ? '#8a5c73' : '#e8a5b5',
      );
    }
    // Right lung (3 lobes → slightly larger)
    if (rightRef.current) {
      const asymScale = state.sideAsymmetric === 'right' ? 0.65 : 1.0;
      rightRef.current.scale.set(1.05, expand * asymScale, 1.05);
      (rightRef.current.material as THREE.MeshStandardMaterial).color.set(
        state.sideAsymmetric === 'right' ? '#8a5c73' : '#e8a5b5',
      );
    }
  });

  return (
    <group>
      {/* Trachea */}
      <mesh position={[0, 1.6, 0]}>
        <cylinderGeometry args={[0.15, 0.15, 1.2, 16]} />
        <meshStandardMaterial color="#c49a9a" roughness={0.7} />
      </mesh>
      {/* Bronchi split */}
      <mesh position={[-0.35, 1.0, 0]} rotation={[0, 0, Math.PI / 5]}>
        <cylinderGeometry args={[0.1, 0.1, 0.7, 12]} />
        <meshStandardMaterial color="#c49a9a" roughness={0.7} />
      </mesh>
      <mesh position={[0.35, 1.0, 0]} rotation={[0, 0, -Math.PI / 5]}>
        <cylinderGeometry args={[0.1, 0.1, 0.7, 12]} />
        <meshStandardMaterial color="#c49a9a" roughness={0.7} />
      </mesh>
      {/* Left lung (2 lobes → smaller than right) */}
      <mesh ref={leftRef} position={[-0.9, 0.2, 0]}>
        <sphereGeometry args={[0.75, 32, 32]} />
        <meshStandardMaterial color="#e8a5b5" roughness={0.6} metalness={0.05} />
      </mesh>
      {/* Right lung (3 lobes → slightly larger) */}
      <mesh ref={rightRef} position={[0.95, 0.2, 0]}>
        <sphereGeometry args={[0.82, 32, 32]} />
        <meshStandardMaterial color="#e8a5b5" roughness={0.6} metalness={0.05} />
      </mesh>
      {/* Diaphragm hint */}
      <mesh position={[0, -0.9, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.5, 1.6, 32]} />
        <meshStandardMaterial color="#8b5a5a" side={THREE.DoubleSide} transparent opacity={0.5} />
      </mesh>
    </group>
  );
}

export function Lungs3D({ state, rr }: { state: LungState; rr: number }) {
  return (
    <div className="h-full w-full bg-gradient-to-b from-slate-900 to-black">
      <Canvas camera={{ position: [3, 1.5, 4], fov: 45 }}>
        <ambientLight intensity={0.5} />
        <directionalLight position={[5, 5, 5]} intensity={1.1} />
        <directionalLight position={[-5, 3, -5]} intensity={0.5} color="#8ab4d8" />
        <LungsMesh state={state} rr={rr} />
        <OrbitControls enablePan={false} minDistance={2.5} maxDistance={8} />
      </Canvas>
    </div>
  );
}
