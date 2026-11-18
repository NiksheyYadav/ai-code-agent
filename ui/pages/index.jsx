import { useState, useEffect, useCallback, useMemo } from 'react';
import Head from 'next/head';
import dynamic from 'next/dynamic';
import { motion, AnimatePresence } from 'framer-motion';
import { FiCode, FiFolder, FiSave, FiPlay, FiEdit, FiTool, FiMenu, FiX } from 'react-icons/fi';

import CodeEditor from '../components/CodeEditor';
import FileTree from '../components/FileTree';
import AnimatedText from '../components/AnimatedText';
import { apiFetch, getApiKey, setApiKey } from '../lib/api';

// Dynamically import the WebGL background to prevent SSR issues
const WebGLBackground = dynamic(() => import('../components/WebGLBackground'), {
  ssr: false,
});

export default function Home() {
  const [task, setTask] = useState('');
  const [fileTree, setFileTree] = useState([]);
  const [activeFile, setActiveFile] = useState(null);
  const [code, setCode] = useState('');
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const [apiKey, setApiKeyState] = useState('');
  // `loaded` is the last content handed to the editor; `code` is the live buffer.
  const [loaded, setLoaded] = useState(null);
  const editorFile = useMemo(
    () => (loaded ? { path: loaded.path, name: loaded.path.split('/').pop(), content: loaded.content } : null),
    [loaded]
  );

  useEffect(() => {
    setApiKeyState(getApiKey());
  }, []);

  const fetchFileTree = useCallback(async () => {
    setIsLoading(true);
    setError('');
    try {
      const data = await apiFetch('/api/tree');
      setFileTree(Array.isArray(data) ? data : []);
    } catch (e) {
      setFileTree([]);
      setError(e.message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchFileTree();
  }, [fetchFileTree]);

  const handleApiKeyChange = (value) => {
    setApiKeyState(value);
    setApiKey(value.trim());
  };

  const handleFileClick = useCallback(async (path) => {
    if (!path) return;
    setIsLoading(true);
    setError('');
    try {
      const data = await apiFetch(`/api/files/content?path=${encodeURIComponent(path)}`);
      setActiveFile(path);
      setCode(data.content || '');
      setLoaded({ path, content: data.content || '' });
    } catch (e) {
      setError(`Failed to load ${path}: ${e.message}`);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const handleSaveFile = useCallback(async () => {
    if (!activeFile) return;
    setIsLoading(true);
    setError('');
    try {
      await apiFetch('/api/files/save', { method: 'POST', body: { path: activeFile, content: code } });
    } catch (e) {
      setError(e.message || 'Failed to save the file.');
    } finally {
      setIsLoading(false);
    }
  }, [activeFile, code]);

  const handleApiCall = useCallback(async (endpoint) => {
    setIsLoading(true);
    setError('');
    try {
      // Edit/fix act on the file open in the editor (including unsaved changes).
      const body = { prompt: task };
      if (endpoint !== 'generate') {
        body.file_path = activeFile;
        body.content = code;
      }
      const result = await apiFetch(`/api/${endpoint}`, { method: 'POST', body });
      if (result.file_path) setActiveFile(result.file_path);
      if (typeof result.code === 'string') {
        setCode(result.code);
        if (result.file_path) setLoaded({ path: result.file_path, content: result.code });
      }
      await fetchFileTree();
    } catch (e) {
      setError(e.message || `The ${endpoint} request failed.`);
    } finally {
      setIsLoading(false);
    }
  }, [task, activeFile, code, fetchFileTree]);


  return (
    <div className="min-h-screen bg-gray-900 text-white font-sans flex flex-col items-center overflow-x-hidden">
      <Head>
        <title>CodeNex AI - AI Ready</title>
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <motion.header 
        initial={{ y: -100, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
        className="fixed top-0 left-0 right-0 z-50 bg-gray-900/50 backdrop-blur-lg border-b border-gray-800/50"
      >
        <div className="w-full max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center space-x-4">
              <FiCode className="h-8 w-8 text-blue-400" />
              <span className="text-xl font-bold tracking-tight">CodeNex AI</span>
            </div>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => handleApiKeyChange(e.target.value)}
              onBlur={fetchFileTree}
              placeholder="API key"
              aria-label="API key"
              autoComplete="off"
              className="ml-auto mr-3 w-40 px-3 py-1.5 text-sm bg-white/5 border border-white/10 rounded-lg text-gray-200 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
            />
            <button 
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className="p-2 rounded-md text-gray-400 hover:text-white hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-white"
            >
              {isSidebarOpen ? <FiX /> : <FiMenu />}
            </button>
          </div>
        </div>
      </motion.header>

      <main className="flex-1 flex flex-col w-full min-h-screen">
        {/* Background elements */}
        <div className="fixed inset-0 z-[-1] opacity-10">
          <div className="absolute inset-0 bg-[linear-gradient(to_right,#4f4f4f2e_1px,transparent_1px),linear-gradient(to_bottom,#4f4f4f2e_1px,transparent_1px)] bg-[size:14px_24px]"></div>
          <div className="absolute inset-0 bg-[radial-gradient(circle_500px_at_50%_200px,#3b82f633,transparent)]"></div>
        </div>
        <div className="fixed top-0 left-0 w-full h-full z-[-2]">
          <WebGLBackground />
        </div>

        {/* Hero Section - Centered Content */}
        <div className="flex-1 flex flex-col items-center justify-center w-full px-4 sm:px-6 lg:px-8">
          <div className="relative z-10 text-center w-full max-w-4xl">
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, ease: 'easeOut' }}
              className="mx-auto"
            >
              <h1 className="text-5xl md:text-7xl font-bold tracking-tighter mb-4 bg-clip-text text-transparent bg-gradient-to-br from-blue-400 via-purple-400 to-pink-500">
                <AnimatedText text="CodeNex AI" />
              </h1>
              <p className="text-lg md:text-xl text-gray-300 max-w-2xl mx-auto mb-6">
                <AnimatedText text="AI-Powered Code Generation & Analysis" delay={0.2} />
              </p>
              <div className="flex items-center justify-center space-x-3 text-sm text-gray-400">
                <span className="inline-block w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
                <span>Active</span>
              </div>
            </motion.div>
          </div>
        </div>
        
        <div className="relative z-10 flex-1 flex flex-row overflow-hidden w-full mb-8">
          <AnimatePresence>
            {isSidebarOpen && (
              <motion.div
                initial={{ x: '-100%', opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                exit={{ x: '-100%', opacity: 0 }}
                transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                className="w-72 lg:w-80 flex-shrink-0 mr-4 h-[calc(100vh-12rem)]"
              >
                <div className="h-full bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-5 shadow-2xl flex flex-col transform transition-all duration-300 hover:shadow-blue-500/20 hover:border-blue-400/30">
                  <motion.h2 
                    className="text-xl font-bold mb-5 flex items-center text-gray-200"
                    initial={{ x: -10, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    transition={{ delay: 0.2 }}
                  >
                    <FiFolder className="mr-3 text-blue-400" />
                    Project Files
                  </motion.h2>
                  <div className="overflow-y-auto flex-grow custom-scrollbar pr-2 hover:pr-1 transition-all duration-300">
                    <FileTree files={fileTree} onFileSelect={(node) => handleFileClick(node.path)} selectedFile={activeFile ? { path: activeFile } : null} onRefresh={fetchFileTree} />
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="flex-1 flex flex-col overflow-hidden">
            <motion.div 
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.2 }}
              className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6 mb-6 shadow-2xl"
            >
              <textarea
                id="taskInput"
                name="taskInput"
                className="w-full p-4 bg-white/5 border border-white/10 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 text-gray-200 placeholder-gray-400 resize-none transition-all duration-300"
                rows="3"
                placeholder="Enter your task or prompt here..."
                value={task}
                onChange={(e) => setTask(e.target.value)}
                aria-label="Task input field"
              />
              <div className="flex items-center justify-between mt-5">
                <div className="flex space-x-3">
                  <motion.button
                    onClick={() => handleApiCall('generate')}
                    disabled={!task.trim() || isLoading}
                    whileHover={!task.trim() || isLoading ? {} : { scale: 1.05, y: -2 }}
                    whileTap={!task.trim() || isLoading ? {} : { scale: 0.98 }}
                    className={`px-5 py-2.5 rounded-xl font-medium text-sm tracking-wide transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 ${
                      !task.trim() || isLoading
                        ? 'bg-gray-600/50 text-gray-400 cursor-not-allowed'
                        : 'bg-gradient-to-r from-blue-500 to-blue-600 text-white shadow-lg shadow-blue-500/20 hover:shadow-blue-500/30'
                    }`}
                  >
                    <span className="flex items-center justify-center">
                      {isLoading ? (
                        <>
                          <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                          </svg>
                          Generating...
                        </>
                      ) : (
                        <>
                          <FiPlay className="mr-2" />
                          Generate
                        </>
                      )}
                    </span>
                  </motion.button>
                  
                  <motion.button 
                    onClick={() => handleApiCall('edit')} 
                    disabled={isLoading || !activeFile}
                    whileHover={isLoading || !activeFile ? {} : { scale: 1.05, y: -2 }}
                    whileTap={isLoading || !activeFile ? {} : { scale: 0.98 }}
                    className={`px-5 py-2.5 rounded-xl font-medium text-sm tracking-wide transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 ${
                      isLoading || !activeFile
                        ? 'bg-gray-600/50 text-gray-400 cursor-not-allowed'
                        : 'bg-gradient-to-r from-green-500 to-green-600 text-white shadow-lg shadow-green-500/20 hover:shadow-green-500/30'
                    }`}
                  >
                    <FiEdit className="inline mr-2" />
                    Edit
                  </motion.button>
                  
                  <motion.button 
                    onClick={() => handleApiCall('fix')} 
                    disabled={isLoading || !activeFile}
                    whileHover={isLoading || !activeFile ? {} : { scale: 1.05, y: -2 }}
                    whileTap={isLoading || !activeFile ? {} : { scale: 0.98 }}
                    className={`px-5 py-2.5 rounded-xl font-medium text-sm tracking-wide transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 ${
                      isLoading || !activeFile
                        ? 'bg-gray-600/50 text-gray-400 cursor-not-allowed'
                        : 'bg-gradient-to-r from-red-500 to-red-600 text-white shadow-lg shadow-red-500/20 hover:shadow-red-500/30'
                    }`}
                  >
                    <FiTool className="inline mr-2" />
                    Fix
                  </motion.button>
                </div>
                
                <motion.button 
                  onClick={handleSaveFile} 
                  disabled={isLoading || !activeFile}
                  whileHover={isLoading || !activeFile ? {} : { scale: 1.05, y: -2 }}
                  whileTap={isLoading || !activeFile ? {} : { scale: 0.98 }}
                  className={`px-5 py-2.5 rounded-xl font-medium text-sm tracking-wide transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500 ${
                    isLoading || !activeFile
                      ? 'bg-gray-600/50 text-gray-400 cursor-not-allowed'
                      : 'bg-gradient-to-r from-purple-500 to-purple-600 text-white shadow-lg shadow-purple-500/20 hover:shadow-purple-500/30'
                  }`}
                >
                  <FiSave className="inline mr-2" />
                  Save File
                </motion.button>
              </div>
              {error && <p className="text-red-400 mt-2">Error: {error}</p>}
              {isLoading && <p className="text-blue-400 mt-2">Processing...</p>}
            </motion.div>

            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.4 }}
              className="flex-1 overflow-hidden bg-gray-800/50 backdrop-blur-md border border-gray-700/50 rounded-lg shadow-lg"
            >
              <CodeEditor
                file={editorFile}
                onCodeChange={setCode}
                onSave={async (path, content) => {
                  try {
                    await apiFetch('/api/files/save', { method: 'POST', body: { path, content } });
                    setError('');
                  } catch (e) {
                    setError(e.message || 'Failed to save the file.');
                    throw e;
                  }
                }}
                onClose={() => {
                  setLoaded(null);
                  setActiveFile(null);
                  setCode('');
                }}
              />
            </motion.div>
          </div>
        </div>
      </main>
    </div>
  );
}
