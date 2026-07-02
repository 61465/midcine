'use client';

import { useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Sphere, Torus } from '@react-three/drei';
import * as THREE from 'three';
import type { Rhythm } from './presets';

// Beat waveform: quick systole contraction then slower diastole relaxation.
// Returns a scale factor in [0.85, 1.15] over one cardiac cycle t ∈ [0, 1].
function beatScale(t: number): number {
  // Simplified pressure-volume curve
  if (t < 0.1) return 1 + 0.15 * Math.sin((t / 0.1) * Math.PI * 0.5); // rapid contraction
  if (t < 0.35) return 1.15 - 0.3 * ((t - 0.1) / 0.25); // systolic peak → deep contraction
  if (t < 0.55) return 0.85 + 0.1 * ((t - 0.35) / 0.2); // isovolumetric relaxation
  return 0.95 + 0.05 * Math.sin(((t - 0.55) / 0.45) * Math.PI); // diastolic filling
}

function HeartMesh({ rhythm, bpm }: { rhythm: Rhythm; bpm: number }) {
  const ventricleRef = useRef<THREE.Group>(null);
  const anteriorRef = useRef<THREE.Mesh>(null);
  // Track cycle progress + irregularity offset for afib
  const cycleRef = useRef({ t: 0, cycleLen: 60 / bpm, jitter: 1 });

  useFrame((_state, delta) => {
    const state = cycleRef.current;
    state.t += delta / (state.cycleLen * state.jitter);
    if (state.t >= 1) {
      state.t = 0;
      // Re-pick cycle length: for afib jitter widely; otherwise steady
      state.cycleLen = 60 / bpm;
      state.jitter = rhythm.irregular ? 0.6 + Math.random() * 0.9 : 1;
    }
    const s = beatScale(state.t);
    if (ventricleRef.current) {
      ventricleRef.current.scale.set(s, s * 1.05, s);
    }
    // STEMI: infarcted region does not contract (stays big/dim)
    if (anteriorRef.current) {
      const infarct = rhythm.paralyzedRegion === 'anterior';
      const localS = infarct ? 1.0 : s;
      anteriorRef.current.scale.set(localS, localS, localS);
      (anteriorRef.current.material as THREE.MeshStandardMaterial).color.set(
        infarct ? '#5a2020' : '#c1272d',
      );
    }
  });

  return (
    <group ref={ventricleRef}>
      {/* Left ventricle — main pumping chamber */}
      <Sphere args={[1.0, 32, 32]} position={[0, 0, 0]}>
        <meshStandardMaterial color="#c1272d" roughness={0.5} metalness={0.1} />
      </Sphere>
      {/* Right ventricle — smaller, offset */}
      <Sphere args={[0.7, 24, 24]} position={[0.9, -0.2, 0]}>
        <meshStandardMaterial color="#a01820" roughness={0.5} />
      </Sphere>
      {/* Anterior wall segment (used for STEMI infarct highlight) */}
      <mesh ref={anteriorRef} position={[0, 0.6, 0.75]}>
        <sphereGeometry args={[0.35, 20, 20]} />
        <meshStandardMaterial color="#c1272d" roughness={0.6} />
      </mesh>
      {/* Aorta (arch) */}
      <group position={[-0.2, 1.0, 0]} rotation={[0, 0, Math.PI / 4]}>
        <Torus args={[0.4, 0.15, 16, 32, Math.PI]}>
          <meshStandardMaterial color="#e8b5b5" roughness={0.5} />
        </Torus>
      </group>
      {/* Pulmonary artery */}
      <mesh position={[0.4, 1.1, 0.1]} rotation={[Math.PI / 6, 0, -Math.PI / 6]}>
        <cylinderGeometry args={[0.18, 0.18, 0.9, 16]} />
        <meshStandardMaterial color="#8ab4d8" roughness={0.5} />
      </mesh>
    </group>
  );
}

export function Heart3D({ rhythm, bpm }: { rhythm: Rhythm; bpm: number }) {
  return (
    <div className="h-full w-full bg-gradient-to-b from-gray-900 to-black">
      <Canvas camera={{ position: [3, 1, 3.5], fov: 45 }}>
        <ambientLight intensity={0.5} />
        <directionalLight position={[5, 5, 5]} intensity={1.2} />
        <directionalLight position={[-5, 3, -5]} intensity={0.5} color="#8ab4d8" />
        <HeartMesh rhythm={rhythm} bpm={bpm} />
        <OrbitControls enablePan={false} minDistance={2.5} maxDistance={8} autoRotate={false} />
      </Canvas>
    </div>
  );
}
