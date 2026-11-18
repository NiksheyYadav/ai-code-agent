import React, { Suspense } from 'react';
import dynamic from 'next/dynamic';
import { Canvas } from '@react-three/fiber';

// Dynamically import client-side only components with no SSR
const Particles = dynamic(() => import('./Particles'), { ssr: false });

// Loading fallback component for the Canvas
const Loader = () => (
  <div className="absolute inset-0 bg-gradient-to-br from-gray-900 to-gray-800" />
);

const WebGLBackground = () => {

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      width: '100%',
      height: '100%',
      zIndex: -1,
      pointerEvents: 'none',
      background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
      opacity: 0.8
    }}>
      <Suspense fallback={<Loader />}>
        <Canvas
          camera={{ position: [0, 0, 20], fov: 45 }}
          gl={{
            antialias: true,
            alpha: true,
            powerPreference: 'high-performance',
            stencil: false,
            depth: false,
            preserveDrawingBuffer: false
          }}
          dpr={typeof window !== 'undefined' ? Math.min(window.devicePixelRatio, 2) : 1}
          onCreated={({ gl }) => {
            gl.setClearColor(0x000000, 0);
            if (typeof window !== 'undefined') {
              gl.setPixelRatio(Math.min(window.devicePixelRatio, 2));
            }
          }}
        >
          <ambientLight intensity={0.2} />
          <pointLight position={[10, 10, 10]} intensity={1} />
          <Particles />
        </Canvas>
      </Suspense>
    </div>
  );
};

export default WebGLBackground;
