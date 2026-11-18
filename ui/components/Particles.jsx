import React, { useRef, useMemo } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';

const Particles = ({ count = 2000 }) => {
  const mesh = useRef();
  const { size, viewport } = useThree();
  const aspect = size.width / viewport.width;

  const dummy = useMemo(() => new THREE.Object3D(), []);
  
  // Generate some random positions, speed factors and timings
  const particles = useMemo(() => {
    const temp = [];
    for (let i = 0; i < count; i++) {
      const t = Math.random() * 100;
      const factor = 20 + Math.random() * 100;
      const speed = 0.01 + Math.random() / 200;
      const xFactor = -50 + Math.random() * 100;
      const yFactor = -20 + Math.random() * 40;
      const zFactor = -40 + Math.random() * 40;
      
      temp.push({ t, factor, speed, xFactor, yFactor, zFactor, mx: 0, my: 0 });
    }
    return temp;
  }, [count]);

  useFrame((state) => {
    // Run through the particles array and update positions
    particles.forEach((particle, i) => {
      let { t, factor, speed, xFactor, yFactor, zFactor } = particle;
      
      // Update particle position based on time and factors
      t = particle.t += speed / 2;
      const a = Math.cos(t) + Math.sin(t * 1) / 10;
      const b = Math.sin(t) + Math.cos(t * 2) / 10;
      
      // Move particles with mouse
      particle.mx += (state.mouse.x * state.viewport.width - particle.mx) * 0.01;
      particle.my += (state.mouse.y * state.viewport.height - particle.my) * 0.01;

      // Update the dummy object
      dummy.position.set(
        (particle.mx / 10) * (a * 0.5) + (xFactor * Math.cos(t * 0.5)),
        (particle.my / 10) * (b * 0.5) + (yFactor * Math.sin(t * 0.5)),
        (particle.my / 10) * (b * 0.5) + (zFactor * Math.cos(t * 0.5))
      );
      
      const s = 0.2 + Math.cos(t) * 0.1;
      dummy.scale.set(s, s, s);
      dummy.rotation.set(s * 5, s * 5, s * 5);
      dummy.updateMatrix();
      
      // Apply the matrix to the instanced item
      mesh.current.setMatrixAt(i, dummy.matrix);
    });
    
    mesh.current.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={mesh} args={[null, null, count]}>
      <dodecahedronGeometry args={[0.2, 0]} />
      <meshPhongMaterial color="#3b82f6" />
    </instancedMesh>
  );
};

export default Particles;
