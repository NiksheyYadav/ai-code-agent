import { AnimatePresence, motion } from 'framer-motion';
import { highlight, languages } from 'prismjs';
import 'prismjs/components/prism-javascript';
import 'prismjs/components/prism-json';
import 'prismjs/components/prism-jsx';
import 'prismjs/components/prism-markdown';
import 'prismjs/components/prism-python';
import 'prismjs/themes/prism-tomorrow.css';
import { useCallback, useEffect, useState } from 'react';
import { FiCheck, FiCode, FiCopy, FiDownload, FiFileText, FiRefreshCw, FiSave, FiX } from 'react-icons/fi';
import Editor from 'react-simple-code-editor';



const CodeEditor = ({ file, onSave, onClose, onCodeChange }) => {
  const [code, setCode] = useState(file?.content || '');
  const [isSaving, setIsSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [copied, setCopied] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

  useEffect(() => {
    setCode(file?.content || '');
    setHasChanges(false);
  }, [file]);

  const handleCodeChange = (code) => {
    setCode(code);
    setHasChanges(true);
    if (onCodeChange) onCodeChange(code);
  };

  // Determine language for syntax highlighting
  const getLanguage = useCallback((filename) => {
    const extension = filename.split('.').pop().toLowerCase();
    switch(extension) {
      case 'js':
        return 'javascript';
      case 'jsx':
        return 'jsx';
      case 'py':
        return 'python';
      case 'json':
        return 'json';
      case 'md':
        return 'markdown';
      default:
        return 'javascript';
    }
  }, []);

  const highlightWithLineNumbers = (code, language) => {
    const lang = languages[language] || languages.javascript;
    return highlight(code, lang, language)
      .split('\n')
      .map((line, i) => `<span class='editor-line-number'>${i + 1}</span>${line}`)
      .join('\n');
  };

  const handleSave = async () => {
    if (!hasChanges) return;
    
    setIsSaving(true);
    try {
      await onSave(file.path, code);
      setHasChanges(false);
    } catch (error) {
      console.error('Error saving file:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const blob = new Blob([code], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = file.path.split('/').pop() || 'code.py';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  if (!file) {
    return (
      <div className="flex items-center justify-center h-full text-gray-500">
        <div className="text-center">
          <FiFileText className="w-12 h-12 mx-auto mb-4 opacity-30" />
          <p>No file selected</p>
        </div>
      </div>
    );
  }

  return (
    <motion.div 
      className="flex flex-col h-full bg-gray-900/80 rounded-xl overflow-hidden border border-gray-700/50 shadow-xl"
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.98 }}
      transition={{ duration: 0.2 }}
    >
      <div className="flex items-center justify-between px-4 py-3 bg-gray-800/80 border-b border-gray-700/50">
        <div className="flex items-center space-x-2">
          <FiCode className="text-blue-400" />
          <span className="text-sm font-medium text-gray-200 truncate max-w-xs">
            {file.path}
          </span>
        </div>
        <div className="flex items-center space-x-2">
          <div className="flex items-center space-x-1">
            <button
              onClick={handleCopy}
              className="p-1.5 rounded-md text-gray-400 hover:text-white hover:bg-gray-700/50 transition-colors"
              title="Copy to clipboard"
            >
              {copied ? <FiCheck className="w-4 h-4 text-green-400" /> : <FiCopy className="w-4 h-4" />}
            </button>
            <button
              onClick={handleDownload}
              className="p-1.5 rounded-md text-gray-400 hover:text-white hover:bg-gray-700/50 transition-colors"
              title="Download file"
            >
              <FiDownload className="w-4 h-4" />
            </button>
          </div>
          <button
            onClick={handleSave}
            disabled={!hasChanges || isSaving}
            className={`px-3 py-1 text-sm rounded-md flex items-center space-x-1.5 transition-colors ${
              hasChanges && !isSaving
                ? 'bg-blue-600 text-white hover:bg-blue-700'
                : 'bg-gray-700/50 text-gray-500 cursor-not-allowed'
            }`}
          >
            {isSaving ? (
              <>
                <FiRefreshCw className="animate-spin w-3.5 h-3.5" />
                <span>Saving...</span>
              </>
            ) : (
              <>
                <FiSave className="w-3.5 h-3.5" />
                <span>Save</span>
              </>
            )}
          </button>
          <button 
            onClick={onClose}
            className="p-1.5 rounded-md text-gray-400 hover:text-white hover:bg-gray-700/50 transition-colors"
          >
            <FiX className="w-4 h-4" />
          </button>
        </div>
      </div>
      
      <div 
        className="relative flex-1 overflow-auto"
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        <AnimatePresence>
          {isHovered && (
            <motion.div 
            className="absolute top-2 right-2 z-10 flex space-x-1"
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
          >
            <button 
              onClick={handleCopy}
              className="p-1.5 bg-gray-800/80 backdrop-blur-sm rounded text-xs text-gray-300 hover:text-white hover:bg-gray-700/80 transition-colors"
              title="Copy code"
            >
              {copied ? <FiCheck className="w-3.5 h-3.5" /> : <FiCopy className="w-3.5 h-3.5" />}
            </button>
          </motion.div>
          )}
        </AnimatePresence>
      
      <div className="relative flex-1 overflow-auto bg-gray-900 rounded-b-lg">
        <Editor
          value={code}
          onValueChange={handleCodeChange}
          highlight={(code) => highlightWithLineNumbers(code, getLanguage(file.name))}
          padding={16}
          className="font-mono text-sm min-h-full"
          style={{
            backgroundColor: '#1a202c',
            color: '#e2e8f0',
            fontSize: '14px',
            lineHeight: '1.5',
            minHeight: '100%',
            outline: 'none',
          }}
          textareaClassName="focus:outline-none"
          preClassName="m-0"
        />
        
        
        <div className="px-4 py-2 text-xs text-gray-500 bg-gray-800/50 border-t border-gray-700/50 flex justify-between">
          <span className="truncate max-w-xs">{file.path}</span>
          <span>{code.split('\n').length} lines • {code.length} chars</span>
        </div>
      </div>
      </div>
    </motion.div>
  );
};

export default CodeEditor;
