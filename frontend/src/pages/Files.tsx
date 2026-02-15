import { useEffect, useState, lazy, Suspense } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useServerStore } from '../stores/serverStore';
import api from '../lib/api';
import toast from 'react-hot-toast';
import { cn, formatBytes } from '../lib/utils';
import type { FileEntry } from '../types';
import {
  FolderIcon,
  DocumentIcon,
  DocumentTextIcon,
  ArrowUpTrayIcon,
  FolderPlusIcon,
  DocumentPlusIcon,
  TrashIcon,
  PencilIcon,
  ArrowDownTrayIcon,
  ChevronRightIcon,
  HomeIcon,
  ArrowLeftIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';

const CodeEditor = lazy(() => import('../components/CodeEditor'));

function getFileIcon(entry: FileEntry) {
  if (entry.type === 'directory') return <FolderIcon className="w-5 h-5 text-accent-400" />;
  const ext = entry.name.split('.').pop()?.toLowerCase() || '';
  if (['yml', 'yaml', 'json', 'properties', 'toml', 'cfg', 'conf', 'ini', 'txt', 'log', 'md'].includes(ext)) {
    return <DocumentTextIcon className="w-5 h-5 text-success-400" />;
  }
  if (['jar', 'zip', 'gz', 'tar'].includes(ext)) {
    return <DocumentIcon className="w-5 h-5 text-warning-400" />;
  }
  return <DocumentIcon className="w-5 h-5 text-dark-400" />;
}

export default function Files() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { servers, fetchServers } = useServerStore();

  const [currentPath, setCurrentPath] = useState('');
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [editFile, setEditFile] = useState<{ path: string; content: string; name: string } | null>(null);
  const [editContent, setEditContent] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [renameEntry, setRenameEntry] = useState<FileEntry | null>(null);
  const [renameName, setRenameName] = useState('');
  const [showNewFile, setShowNewFile] = useState(false);
  const [newFileName, setNewFileName] = useState('');

  const selectedId = id || servers[0]?.id;

  useEffect(() => {
    fetchServers();
  }, [fetchServers]);

  const loadFiles = async (path: string = '') => {
    if (!selectedId) return;
    setIsLoading(true);
    try {
      const { data } = await api.get(`/servers/${selectedId}/files`, { params: { path } });
      setFiles(data);
      setCurrentPath(path);
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to load files');
    }
    setIsLoading(false);
  };

  useEffect(() => {
    loadFiles('');
  }, [selectedId]);

  const pathParts = currentPath ? currentPath.split('/').filter(Boolean) : [];

  const navigateToPath = (index: number) => {
    const path = pathParts.slice(0, index + 1).join('/');
    loadFiles(path);
  };

  const handleFileClick = async (entry: FileEntry) => {
    if (entry.type === 'directory') {
      loadFiles(entry.path);
    } else {
      // Check if editable
      const editable = ['yml', 'yaml', 'json', 'properties', 'toml', 'cfg', 'conf', 'ini', 'txt', 'log', 'md', 'sh', 'bat', 'cmd'];
      const ext = entry.name.split('.').pop()?.toLowerCase() || '';
      if (editable.includes(ext) && entry.size < 1024 * 1024) {
        try {
          const { data } = await api.get(`/servers/${selectedId}/files/read`, { params: { path: entry.path } });
          setEditFile({ path: entry.path, content: data.content, name: entry.name });
          setEditContent(data.content);
        } catch (err: any) {
          toast.error('Failed to open file');
        }
      } else {
        // Download
        window.open(`/api/servers/${selectedId}/files/download?path=${encodeURIComponent(entry.path)}`, '_blank');
      }
    }
  };

  const handleSave = async () => {
    if (!editFile) return;
    setIsSaving(true);
    try {
      await api.put(`/servers/${selectedId}/files/write`, { path: editFile.path, content: editContent });
      toast.success('File saved');
      setEditFile(null);
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to save');
    }
    setIsSaving(false);
  };

  const handleDelete = async (entry: FileEntry) => {
    if (!confirm(`Delete ${entry.name}? This cannot be undone.`)) return;
    try {
      await api.delete(`/servers/${selectedId}/files`, { params: { path: entry.path } });
      toast.success('Deleted');
      loadFiles(currentPath);
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to delete');
    }
  };

  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) return;
    try {
      const path = currentPath ? `${currentPath}/${newFolderName}` : newFolderName;
      await api.post(`/servers/${selectedId}/files/mkdir`, { path });
      toast.success('Folder created');
      setShowNewFolder(false);
      setNewFolderName('');
      loadFiles(currentPath);
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to create folder');
    }
  };

  const handleRename = async () => {
    if (!renameEntry || !renameName.trim()) return;
    try {
      await api.post(`/servers/${selectedId}/files/rename`, {
        oldPath: renameEntry.path,
        newPath: renameName,
      });
      toast.success('Renamed');
      setRenameEntry(null);
      loadFiles(currentPath);
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to rename');
    }
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const formData = new FormData();
    formData.append('file', file);
    formData.append('path', currentPath);
    try {
      await api.post(`/servers/${selectedId}/files/upload`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      toast.success('Uploaded');
      loadFiles(currentPath);
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Upload failed');
    }
    e.target.value = '';
  };

  const handleCreateFile = async () => {
    if (!newFileName.trim()) return;
    try {
      const filePath = currentPath ? `${currentPath}/${newFileName}` : newFileName;
      await api.put(`/servers/${selectedId}/files/write`, { path: filePath, content: '' });
      toast.success('File created');
      setShowNewFile(false);
      setNewFileName('');
      loadFiles(currentPath);
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to create file');
    }
  };

  // Sort: directories first, then alphabetical
  const sortedFiles = [...files].sort((a, b) => {
    if (a.type === 'directory' && b.type !== 'directory') return -1;
    if (a.type !== 'directory' && b.type === 'directory') return 1;
    return a.name.localeCompare(b.name);
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-dark-50">Files</h1>
          {servers.length > 1 && (
            <select
              className="input py-1.5 text-sm w-48"
              value={selectedId || ''}
              onChange={(e) => navigate(`/files/${e.target.value}`)}
            >
              {servers.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          )}
        </div>
        <div className="flex gap-2">
          <button className="btn-secondary btn-sm" onClick={() => setShowNewFile(true)}>
            <DocumentPlusIcon className="w-4 h-4" />
            New File
          </button>
          <button className="btn-secondary btn-sm" onClick={() => setShowNewFolder(true)}>
            <FolderPlusIcon className="w-4 h-4" />
            New Folder
          </button>
          <label className="btn-primary btn-sm cursor-pointer">
            <ArrowUpTrayIcon className="w-4 h-4" />
            Upload
            <input type="file" className="hidden" onChange={handleUpload} />
          </label>
        </div>
      </div>

      {/* Breadcrumb */}
      <div className="flex items-center gap-1 text-sm overflow-x-auto">
        <button
          className="flex items-center gap-1 text-dark-400 hover:text-accent-400 transition-colors"
          onClick={() => loadFiles('')}
        >
          <HomeIcon className="w-4 h-4" />
          Root
        </button>
        {pathParts.map((part, i) => (
          <span key={i} className="flex items-center gap-1">
            <ChevronRightIcon className="w-3 h-3 text-dark-600" />
            <button
              className={cn(
                'hover:text-accent-400 transition-colors',
                i === pathParts.length - 1 ? 'text-dark-200 font-medium' : 'text-dark-400'
              )}
              onClick={() => navigateToPath(i)}
            >
              {part}
            </button>
          </span>
        ))}
      </div>

      {/* New folder input */}
      {showNewFolder && (
        <div className="flex items-center gap-2">
          <input
            className="input flex-1"
            placeholder="Folder name..."
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCreateFolder()}
            autoFocus
          />
          <button className="btn-primary btn-sm" onClick={handleCreateFolder}>Create</button>
          <button className="btn-ghost btn-sm" onClick={() => { setShowNewFolder(false); setNewFolderName(''); }}>
            <XMarkIcon className="w-4 h-4" />
          </button>
        </div>
      )}

      {showNewFile && (
        <div className="flex items-center gap-2">
          <input
            className="input flex-1"
            placeholder="File name... (e.g. config.yml)"
            value={newFileName}
            onChange={(e) => setNewFileName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCreateFile()}
            autoFocus
          />
          <button className="btn-primary btn-sm" onClick={handleCreateFile}>Create</button>
          <button className="btn-ghost btn-sm" onClick={() => { setShowNewFile(false); setNewFileName(''); }}>
            <XMarkIcon className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* File list */}
      {isLoading ? (
        <div className="card text-center py-12">
          <div className="w-8 h-8 border-4 border-accent-500 border-t-transparent rounded-full animate-spin mx-auto" />
        </div>
      ) : (
        <div className="border border-dark-700 rounded-xl overflow-hidden">
          {currentPath && (
            <button
              className="flex items-center gap-2 w-full px-4 py-3 text-sm text-dark-400 hover:bg-dark-800/50 border-b border-dark-800"
              onClick={() => {
                const parent = pathParts.slice(0, -1).join('/');
                loadFiles(parent);
              }}
            >
              <ArrowLeftIcon className="w-4 h-4" />
              Back
            </button>
          )}

          {sortedFiles.length === 0 ? (
            <div className="text-center py-12 text-dark-500">
              <FolderIcon className="w-12 h-12 mx-auto mb-3 text-dark-700" />
              <p>This directory is empty</p>
            </div>
          ) : (
            sortedFiles.map((entry) => (
              <div
                key={entry.path}
                className="flex items-center justify-between px-4 py-2.5 hover:bg-dark-800/40 border-b border-dark-800 last:border-0 group"
              >
                <button
                  className="flex items-center gap-3 flex-1 text-left min-w-0"
                  onClick={() => handleFileClick(entry)}
                >
                  {getFileIcon(entry)}
                  <span className="text-sm text-dark-200 truncate hover:text-accent-400 transition-colors">
                    {entry.name}
                  </span>
                </button>
                <div className="flex items-center gap-3">
                  {entry.type === 'file' && (
                    <span className="text-xs text-dark-500">{formatBytes(entry.size)}</span>
                  )}
                  <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={(e) => { e.stopPropagation(); setRenameEntry(entry); setRenameName(entry.name); }}
                      className="btn-ghost p-1 text-dark-400"
                      title="Rename"
                    >
                      <PencilIcon className="w-3.5 h-3.5" />
                    </button>
                    {entry.type === 'file' && (
                      <a
                        href={`/api/servers/${selectedId}/files/download?path=${encodeURIComponent(entry.path)}`}
                        className="btn-ghost p-1 text-dark-400"
                        title="Download"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <ArrowDownTrayIcon className="w-3.5 h-3.5" />
                      </a>
                    )}
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDelete(entry); }}
                      className="btn-ghost p-1 text-danger-400"
                      title="Delete"
                    >
                      <TrashIcon className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* File Editor Modal */}
      {editFile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setEditFile(null)} />
          <div className="relative bg-dark-900 border border-dark-700 rounded-xl w-full max-w-5xl h-[85vh] flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b border-dark-700">
              <div className="flex items-center gap-2">
                <DocumentTextIcon className="w-4 h-4 text-accent-400" />
                <span className="text-sm font-medium text-dark-200">{editFile.name}</span>
                <span className="text-xs text-dark-500">{editFile.path}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-dark-500">Ctrl+S to save</span>
                <button className="btn-primary btn-sm" onClick={handleSave} disabled={isSaving}>
                  {isSaving ? 'Saving...' : 'Save'}
                </button>
                <button className="btn-ghost btn-sm" onClick={() => setEditFile(null)}>
                  <XMarkIcon className="w-4 h-4" />
                </button>
              </div>
            </div>
            <div className="flex-1 min-h-0">
              <Suspense fallback={
                <div className="flex items-center justify-center h-full bg-dark-950">
                  <div className="w-8 h-8 border-4 border-accent-500 border-t-transparent rounded-full animate-spin" />
                </div>
              }>
                <CodeEditor
                  value={editContent}
                  onChange={setEditContent}
                  fileName={editFile.name}
                  onSave={handleSave}
                />
              </Suspense>
            </div>
          </div>
        </div>
      )}

      {/* Rename Modal */}
      {renameEntry && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setRenameEntry(null)} />
          <div className="relative bg-dark-900 border border-dark-700 rounded-xl p-6 w-full max-w-sm">
            <h3 className="text-lg font-semibold text-dark-50 mb-4">Rename</h3>
            <input
              className="input mb-4"
              value={renameName}
              onChange={(e) => setRenameName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleRename()}
              autoFocus
            />
            <div className="flex gap-3">
              <button className="btn-secondary flex-1" onClick={() => setRenameEntry(null)}>Cancel</button>
              <button className="btn-primary flex-1" onClick={handleRename}>Rename</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
