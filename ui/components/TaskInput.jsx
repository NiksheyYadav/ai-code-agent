import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FiSend, FiEdit2, FiCheckCircle, FiAlertCircle, FiLoader, FiSparkles } from 'react-icons/fi';
import { Canvas, useFrame } from '@react-three/fiber';
import { Text } from '@react-three/drei';

// 3D Floating Button Background
const ButtonParticles = ({ isActive }) => {
  const particles = useRef();
  
  useFrame((state) => {
    if (particles.current) {
      particles.current.rotation.y = state.clock.getElapsedTime() * 0.1;
      particles.current.rotation.x = Math.sin(state.clock.getElapsedTime() * 0.5) * 0.1;
    }
  });

  return (
    <group ref={particles}>
      {[...Array(8)].map((_, i) => (
        <mesh key={i} position={[0, 0, 0]} scale={isActive ? 1.2 : 1}>
          <sphereGeometry args={[0.05, 8, 8]} />
          <meshBasicMaterial 
            color={isActive ? '#60a5fa' : '#4b5563'} 
            opacity={0.8}
            transparent
          />
        </mesh>
      ))}
    </group>
  );
};

// Animated Button Component
const ActionButton = ({ 
  id, 
  label, 
  icon, 
  isActive, 
  onClick,
  description 
}) => {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      className={`relative flex-1 flex items-center justify-center py-2 px-4 rounded-md font-medium transition-all overflow-hidden group`}
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.98 }}
      initial={false}
      animate={{
        backgroundColor: isActive ? 'rgba(79, 70, 229, 0.5)' : 'rgba(55, 65, 81, 0.3)',
        border: isActive ? '1px solid rgba(99, 102, 241, 0.5)' : '1px solid rgba(75, 85, 99, 0.3)',
        color: isActive ? '#ffffff' : '#9ca3af',
      }}
    >
      {/* Animated Background */}
      <motion.div 
        className="absolute inset-0 opacity-0 group-hover:opacity-30"
        style={{
          background: 'radial-gradient(circle at center, rgba(99, 102, 241, 0.8) 0%, transparent 70%)',
        }}
        animate={{
          opacity: isActive ? 0.2 : 0,
        }}
        transition={{ duration: 0.3 }}
      />
      
      {/* Button Content */}
      <div className="relative z-10 flex items-center">
        <motion.span
          animate={{
            scale: isActive ? [1, 1.2, 1] : 1,
            rotate: isActive ? [0, 10, -10, 0] : 0,
          }}
          transition={{ duration: 0.5 }}
        >
          {icon}
        </motion.span>
        <motion.span 
          className="hidden sm:inline ml-2"
          animate={{
            x: isActive ? [0, 2, -2, 0] : 0,
          }}
          transition={{ duration: 0.5 }}
        >
          {label}
        </motion.span>
      </div>
      
      {/* Tooltip */}
      <motion.div 
        className="absolute -top-10 left-1/2 -translate-x-1/2 bg-gray-900 text-white text-xs px-2 py-1 rounded whitespace-nowrap pointer-events-none opacity-0"
        initial={false}
        animate={{
          opacity: isActive ? 1 : 0,
          y: isActive ? -5 : 0,
        }}
        transition={{ duration: 0.2 }}
      >
        {description}
        <div className="absolute bottom-0 left-1/2 w-2 h-2 bg-gray-900 transform -translate-x-1/2 translate-y-1/2 rotate-45" />
      </motion.div>
    </motion.button>
  );
};

const TaskInput = ({ onSubmit, isLoading, lastError, onClearError }) => {
  const [task, setTask] = useState('');
  const [action, setAction] = useState('generate'); // 'generate', 'edit', 'fix'
  const [isFocused, setIsFocused] = useState(false);
  const inputRef = useRef(null);
  const buttonRef = useRef(null);
  const [buttonHover, setButtonHover] = useState(false);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (task.trim() && !isLoading) {
      onSubmit({ task: task.trim(), action });
    }
  };

  useEffect(() => {
    if (lastError) {
      const timer = setTimeout(() => {
        onClearError();
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [lastError, onClearError]);

  const getButtonConfig = () => [
    {
      id: 'generate',
      label: 'Generate',
      icon: <FiSend className="w-4 h-4 sm:w-5 sm:h-5" />,
      description: 'Generate new code based on the task',
      isActive: action === 'generate'
    },
    {
      id: 'edit',
      label: 'Edit',
      icon: <FiEdit2 className="w-4 h-4 sm:w-5 sm:h-5" />,
      description: 'Edit existing code based on the task',
      isActive: action === 'edit'
    },
    {
      id: 'fix',
      label: 'Fix',
      icon: <FiCheckCircle className="w-4 h-4 sm:w-5 sm:h-5" />,
      description: 'Fix issues in the code',
      isActive: action === 'fix'
    }
  ];

  return (
    <div className="w-full space-y-4">
      {/* Action Buttons */}
      <motion.div 
        className="flex space-x-2 p-1 bg-gray-900/30 rounded-xl backdrop-blur-sm border border-gray-800/50 shadow-lg"
        initial={false}
        animate={{
          boxShadow: '0 10px 30px -10px rgba(0, 0, 0, 0.3)'
        }}
      >
        {getButtonConfig().map(({ id, label, icon, description, isActive }) => (
          <ActionButton
            key={id}
            id={id}
            label={label}
            icon={icon}
            description={description}
            isActive={isActive}
            onClick={() => setAction(id)}
          />
        ))}
      </motion.div>
      
      {/* Input Form */}
      <motion.form 
        onSubmit={handleSubmit}
        className="relative"
        initial={false}
        animate={{
          scale: isFocused ? 1.005 : 1,
        }}
        transition={{ type: 'spring', stiffness: 400, damping: 20 }}
      >
        {/* Animated Background */}
        <motion.div 
          className="absolute inset-0 rounded-xl overflow-hidden pointer-events-none"
          initial={false}
          animate={{
            background: isFocused 
              ? 'linear-gradient(135deg, rgba(79, 70, 229, 0.1) 0%, rgba(99, 102, 241, 0.05) 100%)' 
              : 'linear-gradient(135deg, rgba(31, 41, 55, 0.3) 0%, rgba(17, 24, 39, 0.3) 100%)',
            border: isFocused 
              ? '1px solid rgba(99, 102, 241, 0.3)' 
              : '1px solid rgba(55, 65, 81, 0.5)',
            boxShadow: isFocused 
              ? '0 4px 30px -10px rgba(79, 70, 229, 0.5)' 
              : '0 4px 20px -10px rgba(0, 0, 0, 0.2)',
          }}
          transition={{ duration: 0.3 }}
        >
          <div className="absolute inset-0 bg-grid-pattern opacity-5" />
        </motion.div>
        
        {/* Textarea */}
        <motion.textarea
          ref={inputRef}
          value={task}
          onChange={(e) => setTask(e.target.value)}
          placeholder={`What would you like to ${action}?`}
          className="w-full p-4 pr-14 bg-gray-900/50 backdrop-blur-sm rounded-xl border-transparent focus:ring-0 focus:ring-offset-0 focus:border-transparent transition-all duration-300 text-white placeholder-gray-500 resize-none relative z-10"
          rows={4}
          disabled={isLoading}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          style={{
            background: 'transparent',
            boxShadow: 'inset 0 1px 1px rgba(255, 255, 255, 0.05)'
          }}
        />
        
        {/* Submit Button */}
        <motion.button
          ref={buttonRef}
          type="submit"
          className={`absolute top-3 right-3 p-2 rounded-lg z-20 ${
            isLoading || !task.trim() 
              ? 'text-gray-600 cursor-not-allowed' 
              : 'text-blue-400 hover:text-white hover:bg-blue-500/20'
          } transition-all duration-200`}
          disabled={isLoading || !task.trim()}
          title="Submit"
          onMouseEnter={() => setButtonHover(true)}
          onMouseLeave={() => setButtonHover(false)}
          whileHover={!isLoading && task.trim() ? { scale: 1.1 } : {}}
          whileTap={!isLoading && task.trim() ? { scale: 0.95 } : {}}
        >
          <AnimatePresence mode="wait">
            {isLoading ? (
              <motion.span
                key="loading"
                initial={{ opacity: 0, rotate: -180 }}
                animate={{ opacity: 1, rotate: 0 }}
                exit={{ opacity: 0, rotate: 180 }}
                className="block"
              >
                <FiLoader className="w-5 h-5 animate-spin" />
              </motion.span>
            ) : (
              <motion.span
                key="send"
                initial={{ opacity: 0, y: 5 }}
                animate={{ 
                  opacity: task.trim() ? 1 : 0.5, 
                  y: 0,
                  scale: buttonHover && task.trim() ? 1.1 : 1
                }}
                className="flex items-center justify-center"
              >
                <FiSend className="w-5 h-5" />
              </motion.span>
            )}
          </AnimatePresence>
        </motion.button>
        
        {/* Character Counter */}
        <motion.div 
          className="absolute bottom-2 right-3 text-xs text-gray-500 z-20"
          initial={false}
          animate={{
            opacity: task.length > 0 ? 1 : 0.5,
            y: task.length > 0 ? 0 : 5
          }}
        >
          {task.length}/1000
        </motion.div>
      </motion.form>
      
      {/* Error Message */}
      <AnimatePresence>
        {lastError && (
          <motion.div 
            className="p-3 bg-red-500/20 border border-red-500/30 rounded-lg flex items-start text-sm text-red-300"
            initial={{ opacity: 0, y: -10, height: 0 }}
            animate={{ opacity: 1, y: 0, height: 'auto' }}
            exit={{ opacity: 0, y: -10, height: 0 }}
            transition={{ duration: 0.3 }}
          >
            <FiAlertCircle className="flex-shrink-0 mt-0.5 mr-2" />
            <span>{lastError}</span>
            <button 
              onClick={onClearError}
              className="ml-auto text-red-200 hover:text-white"
              aria-label="Dismiss error"
            >
              <FiX />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
      
      {/* Decorative Elements */}
      <div className="absolute -z-10 opacity-20">
        <Canvas>
          <ambientLight intensity={0.5} />
          <ButtonParticles isActive={isFocused} />
        </Canvas>
      </div>
    </div>
  );
};

export default TaskInput;
