'use client';

import { useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import type { KidneyState } from './presets';

function KidneyMesh({ state }: { state: KidneyState }) {
  const leftRef = useRef<THREE.Mesh>(null);
  const rightRef = useRef<THREE.Mesh>(null);
  const stoneRef = useRef<THREE.Mesh>(null);
  const clockRef = useRef(0);

  useFrame((_s, delta) => {
    clockRef.current += delta;
    const t = clockRef.current;
    // Filtration flicker — proportional to GFR (0 = no glow, 1 = strong)
    const activity = Math.max(0, Math.min(1, state.gfr / 105));
    // Subtle pulse at ~72 BPM (systemic)
    const pulse = 0.3 + 0.7 * Math.abs(Math.sin(t * 1.2 * 2 * Math.PI));
    const glow = activity * pulse;

    if (leftRef.current) {
      const mat = leftRef.current.material as THREE.MeshStandardMaterial;
      const dim = state.affected === 'left' || state.affected === 'bilateral';
      mat.emissive.setRGB(dim ? glow * 0.1 : glow * 0.4, dim ? glow * 0.05 : glow * 0.2, 0);
      mat.color.setRGB(dim ? 0.5 : 0.75, dim ? 0.3 : 0.4, dim ? 0.25 : 0.3);
    }
    if (rightRef.current) {
      const mat = rightRef.current.material as THREE.MeshStandardMaterial;
      const dim = state.affected === 'right' || state.affected === 'bilateral';
      mat.emissive.setRGB(dim ? glow * 0.1 : glow * 0.4, dim ? glow * 0.05 : glow * 0.2, 0);
      mat.color.setRGB(dim ? 0.5 : 0.75, dim ? 0.3 : 0.4, dim ? 0.25 : 0.3);
    }
    if (stoneRef.current && state.stones) {
      stoneRef.current.rotation.y += delta * 0.5;
    }
  });

  return (
    <group>
      {/* Left kidney (bean shape approximation: elongated ellipsoid + indent) */}
      <mesh
        ref={leftRef}
        position={[-1.0, 0, 0]}
        rotation={[0, 0, Math.PI / 20]}
        scale={[0.6, 1.0, 0.7]}
      >
        <sphereGeometry args={[0.8, 32, 32]} />
        <meshStandardMaterial color="#c05a4a" roughness={0.6} />
      </mesh>
      {/* Right kidney */}
      <mesh
        ref={rightRef}
        position={[1.0, 0, 0]}
        rotation={[0, 0, -Math.PI / 20]}
        scale={[0.6, 1.0, 0.7]}
      >
        <sphereGeometry args={[0.8, 32, 32]} />
        <meshStandardMaterial color="#c05a4a" roughness={0.6} />
      </mesh>
      {/* Ureters to bladder */}
      <mesh position={[-0.5, -1.1, 0]} rotation={[0, 0, Math.PI / 8]}>
        <cylinderGeometry args={[0.06, 0.06, 1.3, 12]} />
        <meshStandardMaterial color="#d4a898" roughness={0.7} />
      </mesh>
      <mesh position={[0.5, -1.1, 0]} rotation={[0, 0, -Math.PI / 8]}>
        <cylinderGeometry args={[0.06, 0.06, 1.3, 12]} />
        <meshStandardMaterial color="#d4a898" roughness={0.7} />
      </mesh>
      {/* Bladder */}
      <mesh position={[0, -1.9, 0]} scale={[1, 0.7, 0.9]}>
        <sphereGeometry args={[0.4, 24, 24]} />
        <meshStandardMaterial color="#ffd08a" roughness={0.6} />
      </mesh>
      {/* Stone (if present) */}
      {state.stones && (
        <mesh ref={stoneRef} position={[state.affected === 'right' ? 1.0 : -1.0, -0.3, 0]}>
          <dodecahedronGeometry args={[0.12, 0]} />
          <meshStandardMaterial
            color="#f0e0a0"
            emissive="#a08040"
            emissiveIntensity={0.3}
            roughness={0.3}
          />
        </mesh>
      )}
    </group>
  );
}

export function Kidney3D({ state }: { state: KidneyState }) {
  return (
    <div className="h-full w-full bg-gradient-to-b from-amber-950 to-black">
      <Canvas camera={{ position: [0, 0.5, 4], fov: 45 }}>
        <ambientLight intensity={0.5} />
        <directionalLight position={[5, 5, 5]} intensity={1.1} />
        <directionalLight position={[-5, 3, -5]} intensity={0.4} color="#fbbf24" />
        <KidneyMesh state={state} />
        <OrbitControls enablePan={false} minDistance={2.5} maxDistance={8} />
      </Canvas>
    </div>
  );
}
