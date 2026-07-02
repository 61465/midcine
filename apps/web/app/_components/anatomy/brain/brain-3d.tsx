'use client';

import { useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import type { BrainState } from './presets';

function BrainMesh({ state }: { state: BrainState }) {
  const leftRef = useRef<THREE.Mesh>(null);
  const rightRef = useRef<THREE.Mesh>(null);
  const cerebellumRef = useRef<THREE.Mesh>(null);
  const clockRef = useRef({ t: 0 });

  useFrame((_s, delta) => {
    clockRef.current.t += delta;
    const t = clockRef.current.t;
    // Base activity flicker: modulate emissive by dominant freq
    const activity = 0.3 + 0.4 * Math.abs(Math.sin(t * state.dominantFreq * 2 * Math.PI * 0.5));

    // Seizure — global sharp flicker
    const spikeFactor = state.spikes ? (Math.sin(t * 20) > 0.85 ? 1.0 : 0.2) : 1.0;

    const leftDim = state.affectedHemisphere === 'left';
    const rightDim = state.affectedHemisphere === 'right';

    if (leftRef.current) {
      const mat = leftRef.current.material as THREE.MeshStandardMaterial;
      const a = leftDim ? 0.05 : activity * spikeFactor;
      mat.emissive.setRGB(a * 0.9, a * 0.6, a * 0.3);
      mat.color.setRGB(0.9, 0.75, 0.7);
    }
    if (rightRef.current) {
      const mat = rightRef.current.material as THREE.MeshStandardMaterial;
      const a = rightDim ? 0.05 : activity * spikeFactor;
      mat.emissive.setRGB(a * 0.9, a * 0.6, a * 0.3);
      mat.color.setRGB(0.9, 0.75, 0.7);
    }
    if (cerebellumRef.current) {
      const mat = cerebellumRef.current.material as THREE.MeshStandardMaterial;
      mat.emissive.setRGB(activity * 0.3, activity * 0.2, activity * 0.15);
    }
  });

  return (
    <group>
      {/* Left hemisphere */}
      <mesh ref={leftRef} position={[-0.4, 0.2, 0]} scale={[1, 0.85, 1.1]}>
        <sphereGeometry args={[0.75, 48, 48]} />
        <meshStandardMaterial color="#e6c0b8" roughness={0.7} bumpScale={0.05} />
      </mesh>
      {/* Right hemisphere */}
      <mesh ref={rightRef} position={[0.4, 0.2, 0]} scale={[1, 0.85, 1.1]}>
        <sphereGeometry args={[0.75, 48, 48]} />
        <meshStandardMaterial color="#e6c0b8" roughness={0.7} bumpScale={0.05} />
      </mesh>
      {/* Cerebellum (posterior small) */}
      <mesh ref={cerebellumRef} position={[0, -0.4, -0.8]} scale={[1.2, 0.7, 0.9]}>
        <sphereGeometry args={[0.4, 32, 32]} />
        <meshStandardMaterial color="#d0a898" roughness={0.7} />
      </mesh>
      {/* Brainstem */}
      <mesh position={[0, -0.9, -0.4]}>
        <cylinderGeometry args={[0.15, 0.18, 0.5, 16]} />
        <meshStandardMaterial color="#b89080" roughness={0.7} />
      </mesh>
      {/* Longitudinal fissure hint */}
      <mesh position={[0, 0.5, 0]}>
        <boxGeometry args={[0.02, 0.5, 1.5]} />
        <meshStandardMaterial color="#8a5c53" />
      </mesh>
    </group>
  );
}

export function Brain3D({ state }: { state: BrainState }) {
  return (
    <div className="h-full w-full bg-gradient-to-b from-indigo-950 to-black">
      <Canvas camera={{ position: [2.5, 1.5, 3], fov: 45 }}>
        <ambientLight intensity={0.4} />
        <directionalLight position={[5, 5, 5]} intensity={1.0} />
        <directionalLight position={[-5, 3, -5]} intensity={0.4} color="#8ab4d8" />
        <pointLight position={[0, 3, 0]} intensity={0.6} color="#fbbf24" />
        <BrainMesh state={state} />
        <OrbitControls enablePan={false} minDistance={2.5} maxDistance={8} />
      </Canvas>
    </div>
  );
}
