import { useEffect, useRef } from 'react';
import { motion, useAnimation, AnimatePresence } from 'framer-motion';
import { useInView } from 'framer-motion';
import * as THREE from 'three';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Text3D, Float, Text, useTexture } from '@react-three/drei';

// 3D Text Component using Three.js
const ThreeDText = ({ children, position = [0, 0, 0], size = 1, color = '#ffffff' }) => {
  const mesh = useRef();
  
  useFrame(({ clock }) => {
    if (mesh.current) {
      // Subtle floating animation
      mesh.current.position.y = position[1] + Math.sin(clock.getElapsedTime() * 0.5) * 0.05;
      // Subtle rotation
      mesh.current.rotation.y = Math.sin(clock.getElapsedTime() * 0.3) * 0.1;
    }
  });

  return (
    <group position={position} ref={mesh}>
      <Text3D
        font="/fonts/helvetiker_regular.typeface.json"
        size={size * 0.5}
        height={0.1}
        curveSegments={12}
        bevelEnabled
        bevelThickness={0.02}
        bevelSize={0.02}
        bevelOffset={0}
        bevelSegments={5}
      >
        {children}
        <meshStandardMaterial 
          color={color}
          metalness={0.8}
          roughness={0.2}
          emissive={color}
          emissiveIntensity={0.2}
        />
      </Text3D>
    </group>
  );
};

// 2D Animated Text Component
const AnimatedText2D = ({ text, delay = 0, className = '' }) => {
  const controls = useAnimation();
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, amount: 0.5 });

  useEffect(() => {
    if (isInView) {
      controls.start({
        opacity: 1,
        y: 0,
        transition: {
          delay: delay * 0.1,
          duration: 0.8,
          ease: [0.16, 1, 0.3, 1],
        },
      });
    }
  }, [isInView, controls, delay]);

  return (
    <motion.span
      ref={ref}
      className={`inline-block ${className}`}
      initial={{ opacity: 0, y: 20 }}
      animate={controls}
    >
      {text.split('').map((char, i) => (
        <motion.span
          key={i}
          className="inline-block"
          whileHover={{
            y: -5,
            color: '#60a5fa',
            transition: { duration: 0.2 },
          }}
        >
          {char === ' ' ? '\u00A0' : char}
        </motion.span>
      ))}
    </motion.span>
  );
};

// Gradient Text Component
const GradientText = ({ text, className = '' }) => {
  return (
    <span 
      className={`bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-purple-500 ${className}`}
    >
      {text}
    </span>
  );
};

// Main AnimatedText Component
export default function AnimatedText({ 
  text, 
  type = '2d', // '2d' or '3d' or 'gradient'
  className = '',
  delay = 0,
  size = 1,
  color = '#ffffff'
}) {
  if (type === '3d') {
    return (
      <div className={`h-32 w-full ${className}`}>
        <Canvas camera={{ position: [0, 0, 5], fov: 45 }}>
          <ambientLight intensity={0.5} />
          <pointLight position={[10, 10, 10]} />
          <ThreeDText position={[0, 0, 0]} size={size} color={color}>
            {text}
          </ThreeDText>
        </Canvas>
      </div>
    );
  }

  if (type === 'gradient') {
    return <GradientText text={text} className={className} />;
  }

  // Default to 2D animated text
  return (
    <AnimatedText2D 
      text={text} 
      delay={delay} 
      className={className} 
    />
  );
}

// HOC for section headers
export const AnimatedSectionHeader = ({ title, subtitle, className = '' }) => {
  return (
    <div className={`mb-8 text-center ${className}`}>
      <h2 className="text-3xl md:text-4xl font-bold mb-2">
        <AnimatedText text={title} type="gradient" />
      </h2>
      {subtitle && (
        <p className="text-gray-400 text-lg">
          <AnimatedText text={subtitle} delay={2} />
        </p>
      )}
    </div>
  );
};
