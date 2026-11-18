import { useState, useEffect } from 'react';
import { FiChevronRight, FiChevronDown, FiFile, FiFolder, FiFolderPlus, FiRefreshCw } from 'react-icons/fi';

const FileIcon = ({ type }) => {
  return type === 'directory' ? (
    <FiFolder className="text-sky-400 mr-2 flex-shrink-0" />
  ) : (
    <FiFile className="text-gray-400 mr-2 flex-shrink-0" />
  );
};

const TreeNode = ({ node, onFileSelect, selectedFile }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const hasChildren = node.children && node.children.length > 0;
  const isSelected = selectedFile && selectedFile.path === node.path;

  const toggleExpand = (e) => {
    e.stopPropagation();
    if (hasChildren) {
      setIsExpanded(!isExpanded);
    }
  };

  const handleClick = () => {
    if (node.type === 'file') {
      onFileSelect(node);
    } else if (hasChildren) {
      setIsExpanded(!isExpanded);
    }
  };

  return (
    <div className="my-1">
      <div
        className={`flex items-center py-1 px-2 rounded-md cursor-pointer transition-colors ${isSelected ? 'bg-indigo-600 bg-opacity-50 text-white' : 'hover:bg-gray-700 hover:bg-opacity-50'}`}
        onClick={handleClick}
      >
        <div onClick={toggleExpand} className="w-5 h-5 mr-1 flex items-center justify-center">
          {hasChildren && (isExpanded ? <FiChevronDown size={14} /> : <FiChevronRight size={14} />)}
        </div>
        <FileIcon type={node.type} />
        <span className="truncate text-sm">{node.name}</span>
      </div>
      {isExpanded && hasChildren && (
        <div className="pl-4 border-l border-gray-700 ml-2">
          {node.children.map((child) => (
            <TreeNode key={child.path} node={child} onFileSelect={onFileSelect} selectedFile={selectedFile} />
          ))}
        </div>
      )}
    </div>
  );
};

const FileTree = ({ files, onFileSelect, selectedFile, onRefresh }) => {
  const [treeData, setTreeData] = useState([]);

  useEffect(() => {
    if (!files) return;
    
    // If files is already an array (structured format), use it directly
    if (Array.isArray(files)) {
      setTreeData(files);
    } else if (typeof files === 'string') {
      // Fallback for string format (legacy)
      const buildTree = (paths) => {
        const root = [];
        const level = { '': { node: { children: root } }};
        
        paths.split('\n').forEach((line) => {
          const trimmed = line.trim();
          if (!trimmed) return;
          
          const isDir = trimmed.endsWith('/');
          const parts = trimmed.replace(/\/$/, '').split('/');
          let path = '';
          
          parts.reduce((parent, part, index) => {
            path = path ? `${path}/${part}` : part;
            
            if (!level[path]) {
              const isLastPart = index === parts.length - 1;
              const node = {
                name: part,
                path: isDir && !isLastPart ? `${path}/` : path,
                type: isDir && !isLastPart ? 'directory' : 'file',
                children: []
              };
              
              level[path] = { node };
              if (parent && parent.node) {
                if (!parent.node.children) {
                  parent.node.children = [];
                }
                parent.node.children.push(node);
              }
            }
            
            return level[path];
          }, level['']);
        });
        
        return root;
      };
      
      setTreeData(buildTree(files));
    }
  }, [files]);

  return (
    <div className="h-full flex flex-col">
      <div className="flex justify-between items-center mb-2 px-1">
        <h3 className="text-base font-semibold text-gray-300">Files</h3>
        <button onClick={onRefresh} className="text-gray-400 hover:text-white transition-transform transform hover:rotate-180" title="Refresh file tree">
          <FiRefreshCw className="w-4 h-4" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto pr-1">
        {treeData.length > 0 ? (
          treeData.map((node) => (
            <TreeNode key={node.path} node={node} onFileSelect={onFileSelect} selectedFile={selectedFile} />
          ))
        ) : (
          <div className="text-gray-500 text-center py-4 text-sm">No files yet. Describe something and press Generate.</div>
        )}
      </div>
    </div>
  );
};

export default FileTree;
