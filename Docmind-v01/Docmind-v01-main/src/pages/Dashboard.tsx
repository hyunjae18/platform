import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Link, useNavigate } from 'react-router-dom';
import { 
  Search, 
  FileText, 
  Upload, 
  FolderOpen, 
  Settings, 
  LogOut, 
  Bell,
  Grid3X3,
  List,
  Calendar,
  Clock,
  CheckCircle,
  AlertCircle,
  Trash2,
  Copy,
  Check,
  Download,
  ExternalLink,
  RefreshCw
} from 'lucide-react';
import api from '@/lib/api';
import { useToast } from '@/hooks/use-toast';

interface Document {
  id: string;
  documentId?: string;
  name: string;
  filename?: string;
  type: string;
  fileType?: string;
  size: string;
  fileSize?: number;
  status: 'processed' | 'processing' | 'failed' | 'uploaded' | 'reprocessing';
  uploadedAt: string;
  processedAt?: string;
  category: string;          // kept internally, not displayed
  documentType?: string;
  extractedText?: string;
  rawText?: string;
  score?: number;
  metadata?: Record<string, any>;
  errorMessage?: string;
  errorAt?: string;
  errorUserId?: string;
  reprocessCount?: number;
}

interface NotificationItem {
  id: string;
  title: string;
  message: string;
  level: 'info' | 'success' | 'warning' | 'error';
  read: boolean;
  link?: string;
  createdAt: string;
}

interface DocumentModalData {
  open: boolean;
  document: Document | null;
}

const Dashboard = () => {
  const { user, logout } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [documents, setDocuments] = useState<Document[]>([]);
  const [allDocuments, setAllDocuments] = useState<Document[]>([]);
  const [isLoadingDocs, setIsLoadingDocs] = useState(true);
  const [isSearching, setIsSearching] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [modal, setModal] = useState<DocumentModalData>({ open: false, document: null });
  const [copiedText, setCopiedText] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const searchTimeoutRef = useRef<NodeJS.Timeout>();
  
  // Helper to extract document type from API response
  const extractDocumentType = (doc: any): string => {
    if (doc.documentType) return doc.documentType;
    if (doc.document_type) return doc.document_type;
    if (doc.classification?.predicted_class) return doc.classification.predicted_class;
    if (doc.metadata?.documentType) return doc.metadata.documentType;
    if (doc.category && doc.category !== 'Uncategorized') return doc.category;
    return 'General';
  };

  // Normalize a raw document object from any API endpoint
  const normalizeDocument = (doc: any): Document => {
    const documentType = extractDocumentType(doc);
    
    return {
      id: doc.id || doc.documentId,
      documentId: doc.documentId || doc.id,
      name: doc.name || doc.filename || 'Unknown',
      filename: doc.filename || doc.name,
      type: doc.type || doc.fileType || 'unknown',
      fileType: doc.fileType || doc.type,
      size: doc.size ? doc.size : doc.fileSize ? `${(doc.fileSize / 1024).toFixed(0)} KB` : 'N/A',
      fileSize: doc.fileSize,
      status: doc.status || 'processed',
      uploadedAt: doc.uploadedAt || doc.createdAt || new Date().toISOString(),
      processedAt: doc.processedAt,
      category: doc.category || 'Uncategorized',   // not displayed
      documentType: documentType,
      extractedText: doc.extractedText || doc.rawText || doc.text || '',
      rawText: doc.rawText || doc.extractedText,
      metadata: doc.metadata || {},
      score: doc.score || 0,
      errorMessage: doc.errorMessage,
      errorAt: doc.errorAt,
      errorUserId: doc.errorUserId,
      reprocessCount: doc.reprocessCount,
    };
  };

  // FETCH ALL DOCUMENTS
  const fetchAllDocuments = async () => {
    setIsLoadingDocs(true);
    try {
      const token = localStorage.getItem('docmind_token') || localStorage.getItem('token');
      
      if (!token) {
        toast({ title: "Error", description: "Please login again", variant: "destructive" });
        navigate('/login');
        return;
      }
      
      const response = await api.get('/documents');
      
      let documentsArray = [];
      if (Array.isArray(response.data)) {
        documentsArray = response.data;
      } else if (response.data && Array.isArray(response.data.documents)) {
        documentsArray = response.data.documents;
      } else if (response.data && Array.isArray(response.data.data)) {
        documentsArray = response.data.data;
      } else if (response.data && response.data.results && Array.isArray(response.data.results)) {
        documentsArray = response.data.results;
      } else {
        documentsArray = [];
      }
      
      const normalizedDocs = documentsArray.map(normalizeDocument);
      
      setAllDocuments(normalizedDocs);
      setDocuments(normalizedDocs);
      
      try {
        const notifResponse = await api.get('/notifications');
        setNotifications(notifResponse.data || []);
      } catch (notifError) {
        console.warn('Could not fetch notifications:', notifError);
        setNotifications([]);
      }
      
    } catch (error: any) {
      console.error("Failed to fetch documents:", error);
      toast({
        title: "Error",
        description: error.response?.data?.message || "Could not load documents.",
        variant: "destructive"
      });
      setDocuments([]);
      setAllDocuments([]);
    } finally {
      setIsLoadingDocs(false);
    }
  };
  
  // Fetch single document details
  const fetchDocumentDetails = async (documentId: string): Promise<Document | null> => {
    try {
      const response = await api.get(`/documents/${documentId}`);
      const doc = response.data;
      return normalizeDocument(doc);
    } catch (error) {
      console.error('Failed to fetch document details:', error);
      return null;
    }
  };

  const openOriginalDocument = async (doc: Document) => {
    const documentId = doc.documentId || doc.id;
    try {
      const response = await api.get(`/archive/${encodeURIComponent(documentId)}`, {
        responseType: 'blob',
      });
      const blob = new Blob([response.data], {
        type: response.headers['content-type'] || doc.type || 'application/octet-stream',
      });
      const url = URL.createObjectURL(blob);
      const opened = window.open(url, '_blank', 'noopener,noreferrer');
      if (!opened) {
        const link = document.createElement('a');
        link.href = url;
        link.download = doc.name || documentId;
        link.click();
      }
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (error: any) {
      toast({
        title: 'File unavailable',
        description: error.response?.data?.message || 'Could not open the archived original file.',
        variant: 'destructive',
      });
    }
  };

  useEffect(() => {
    if (user) {
      fetchAllDocuments();
    }
  }, [user]);
  
  // DELETE DOCUMENT
  const deleteDocument = async (documentId: string, event: React.MouseEvent) => {
    event.stopPropagation();
    
    if (!confirm('Are you sure you want to delete this document? This action cannot be undone.')) {
      return;
    }
    
    try {
      await api.delete(`/documents/${documentId}`);
      
      setAllDocuments(prev => prev.filter(doc => doc.id !== documentId && doc.documentId !== documentId));
      setDocuments(prev => prev.filter(doc => doc.id !== documentId && doc.documentId !== documentId));
      
      toast({
        title: "Document Deleted",
        description: "The document has been removed successfully.",
      });
    } catch (error: any) {
      console.error('Delete failed:', error);
      toast({
        title: "Delete Failed",
        description: error.response?.data?.message || "Could not delete document",
        variant: "destructive"
      });
    }
  };
  
  // REPROCESS FAILED DOCUMENT
  const reprocessDocument = async (documentId: string, event: React.MouseEvent) => {
    event.stopPropagation();

    try {
      toast({ title: 'Reprocessing...', description: 'Sending job back to the pipeline.' });
      await api.post(`/admin/documents/${documentId}/reprocess`);
      await fetchAllDocuments();
      toast({ title: 'Reprocess triggered', description: 'The document has been queued again.' });
    } catch (error: any) {
      toast({
        title: 'Reprocess failed',
        description: error.response?.data?.message || 'Could not reprocess this document.',
        variant: 'destructive',
      });
    }
  };
  
  // SEMANTIC SEARCH
  const performSemanticSearch = async (query: string) => {
    if (!query.trim()) {
      setDocuments(allDocuments);
      return;
    }

    setIsSearching(true);
    try {
      console.log(`Performing semantic search for: "${query}"`);
      
      const response = await api.post('/search/query', {
        query: query,
        top_k: 20,
        search_type: 'semantic'
      });
      
      let results = [];
      if (response.data.results && Array.isArray(response.data.results)) {
        results = response.data.results;
      }
      
      const searchResults: Document[] = results
        .filter((result: any) => Number(result.score || 0) >= 0.5)
        .map((result: any) => {
          const originalDoc = allDocuments.find(d => d.documentId === result.documentId || d.id === result.documentId);
          const documentType = extractDocumentType(result);
          const finalDocumentType = documentType !== 'General' ? documentType : originalDoc?.documentType || 'General';
          
          return {
            id: result.documentId || result.id,
            documentId: result.documentId || result.id,
            name: result.filename || result.name || originalDoc?.name || 'Unknown',
            filename: result.filename || result.name,
            type: originalDoc?.type || result.fileType || result.type || 'unknown',
            fileType: originalDoc?.fileType || result.fileType || result.type,
            size: originalDoc?.size || (result.fileSize ? `${(result.fileSize / 1024).toFixed(0)} KB` : 'N/A'),
            fileSize: result.fileSize,
            status: 'processed',
            uploadedAt: originalDoc?.uploadedAt || result.processed_at || result.uploadedAt || new Date().toISOString(),
            processedAt: result.processed_at,
            category: originalDoc?.category || 'Uncategorized',
            documentType: finalDocumentType,
            extractedText: result.raw_text || result.text || originalDoc?.extractedText || '',
            rawText: result.raw_text || result.text,
            score: result.score || 0,
            metadata: originalDoc?.metadata || {}
          };
        })
        .sort((a, b) => (b.score || 0) - (a.score || 0));
      
      setDocuments(searchResults);
      
      if (searchResults.length === 0) {
        toast({
          title: "No matches found",
          description: `No documents found for "${query}"`,
        });
      } else {
        toast({
          title: "Search complete",
          description: `Found ${searchResults.length} results`,
        });
      }
      
    } catch (error: any) {
      console.error('Search failed:', error);
      toast({
        title: "Search failed",
        description: error.response?.data?.detail || "Could not perform search",
        variant: "destructive"
      });
    } finally {
      setIsSearching(false);
    }
  };

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setSearchQuery(value);
    
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }
    
    searchTimeoutRef.current = setTimeout(() => {
      performSemanticSearch(value);
    }, 500);
  };
  
  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('file', file);

    try {
        toast({ title: "Uploading...", description: "Please wait." });
        const response = await api.post('/documents/upload', formData, {
            headers: { 'Content-Type': 'multipart/form-data' }
        });
        
        await fetchAllDocuments();
        if (response.data?.warning) {
          toast({
            title: "Document uploaded with warning",
            description: response.data.warning,
            variant: "destructive"
          });
        } else if (response.data?.ocr_applied === false) {
          toast({
            title: "Document uploaded",
            description: "The original was archived, but no OCR text was extracted yet."
          });
        } else {
          toast({ title: "Document uploaded", description: "OCR, archive, and indexing pipeline started." });
        }
    } catch (error) {
        console.error('Upload failed:', error);
        toast({ title: "Upload failed", description: "Server error.", variant: "destructive" });
    } finally {
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };
  
  const handleDocumentClick = async (doc: Document) => {
    setModal({ open: true, document: doc });
    const freshDoc = await fetchDocumentDetails(doc.id || doc.documentId || '');
    if (freshDoc) {
      setModal({ open: true, document: freshDoc });
    }
  };
  
  const handleCloseModal = () => {
    setModal({ open: false, document: null });
    setCopiedText(false);
  };
  
  const handleCopyText = async () => {
    if (modal.document?.extractedText) {
      await navigator.clipboard.writeText(modal.document.extractedText);
      setCopiedText(true);
      toast({ title: "Copied!", description: "Text copied to clipboard" });
      setTimeout(() => setCopiedText(false), 2000);
    }
  };
  
  const unreadCount = notifications.filter((item) => !item.read).length;

  const markNotificationRead = async (notificationId: string) => {
    try {
      await api.post(`/notifications/${notificationId}/read`);
      setNotifications((current) =>
        current.map((item) => (item.id === notificationId ? { ...item, read: true } : item)),
      );
    } catch (error) {
      console.error('Could not mark notification as read', error);
    }
  };
  
  const handleLogout = () => {
    logout();
    navigate('/');
  };

  // Document Types aggregation (for sidebar)
  const typeCounts = allDocuments.reduce(
    (acc, doc) => {
      const docType = doc.documentType || 'General';
      acc[docType] = (acc[docType] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  const sortedTypes = Object.entries(typeCounts).sort((a, b) => b[1] - a[1]);

  const stats = {
    totalDocuments: allDocuments.length,
    processed: allDocuments.filter(d => d.status === 'processed').length,
    processing: allDocuments.filter(d => ['processing', 'reprocessing'].includes(d.status)).length,
    pending: allDocuments.filter(d => !['processed', 'processing', 'reprocessing', 'failed'].includes(d.status)).length,
    failed: allDocuments.filter(d => d.status === 'failed').length,
  };

  // Color function for score badges
  const getScoreColor = (score: number) => {
    if (score >= 0.8) return 'text-green-600 bg-green-50 border-green-200';
    if (score >= 0.6) return 'text-blue-600 bg-blue-50 border-blue-200';
    if (score >= 0.4) return 'text-yellow-600 bg-yellow-50 border-yellow-200';
    if (score >= 0.2) return 'text-orange-600 bg-orange-50 border-orange-200';
    return 'text-gray-600 bg-gray-50 border-gray-200';
  };

  const getProgressColor = (score: number) => {
    if (score >= 0.8) return 'bg-green-600';
    if (score >= 0.6) return 'bg-blue-600';
    if (score >= 0.4) return 'bg-yellow-600';
    if (score >= 0.2) return 'bg-orange-600';
    return 'bg-gray-600';
  };

  const formatDate = (dateString: string) => {
    try {
      return new Date(dateString).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return dateString || 'Unknown date';
    }
  };

  const getFileIcon = (fileType: string) => {
    const type = fileType?.toLowerCase() || '';
    if (type.includes('pdf')) return '📄';
    if (type.includes('image') || type.includes('jpg') || type.includes('png') || type.includes('webp')) return '🖼️';
    if (type.includes('text') || type.includes('txt')) return '📝';
    if (type.includes('doc')) return '📃';
    return '📁';
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center justify-between">
            <div className="flex items-center space-x-4">
              <Link to="/" className="flex items-center space-x-2">
                <h1 className="text-xl font-bold text-gradient">DocMind</h1>
              </Link>
              <Badge variant="secondary" className="hidden sm:inline-flex">
                {user?.enterpriseId ?? 'Enterprise'}
              </Badge>
            </div>

            <div className="flex items-center space-x-4">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="relative">
                    <Bell className="h-4 w-4" />
                    {unreadCount > 0 ? (
                      <span className="absolute -right-1 -top-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] text-white">
                        {unreadCount}
                      </span>
                    ) : null}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-80 bg-popover" align="end">
                  <DropdownMenuLabel>Notifications</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {notifications.length === 0 ? (
                    <div className="px-2 py-3 text-sm text-muted-foreground">No notifications yet.</div>
                  ) : notifications.slice(0, 6).map((item) => (
                    <DropdownMenuItem
                      key={item.id}
                      className="flex flex-col items-start gap-1 py-3"
                      onClick={() => {
                        void markNotificationRead(item.id);
                        if (item.link) navigate(item.link);
                      }}
                    >
                      <div className="flex w-full items-center justify-between gap-2">
                        <span className="font-medium">{item.title}</span>
                        {!item.read ? <span className="h-2 w-2 rounded-full bg-primary" /> : null}
                      </div>
                      <span className="text-xs text-muted-foreground whitespace-normal">{item.message}</span>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
              
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className="relative h-8 w-8 rounded-full">
                    <Avatar className="h-8 w-8">
                      <AvatarImage src={user?.avatar} alt={user?.name} />
                      <AvatarFallback>{user?.name?.charAt(0)}</AvatarFallback>
                    </Avatar>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-56 bg-popover" align="end" forceMount>
                  <DropdownMenuLabel className="font-normal">
                    <div className="flex flex-col space-y-1">
                      <p className="text-sm font-medium leading-none">{user?.name}</p>
                      <p className="text-xs leading-none text-muted-foreground">
                        {user?.email}
                      </p>
                    </div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => navigate('/settings')}>
                    <Settings className="mr-2 h-4 w-4" />
                    <span>Settings</span>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={handleLogout}>
                    <LogOut className="mr-2 h-4 w-4" />
                    <span>Log out</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          onChange={handleFileUpload}
          accept=".pdf,.png,.jpg,.jpeg,.txt,.webp"
        />
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          {/* Sidebar */}
          <div className="lg:col-span-1">
            <div className="space-y-6">
              <div>
                <h2 className="text-lg font-semibold mb-4">Quick Actions</h2>
                <div className="space-y-2">
                  <Button 
                    className="w-full justify-start gradient-primary" 
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Upload className="mr-2 h-4 w-4" />
                    Upload Document
                  </Button>
                  <Button
                    variant="outline"
                    className="w-full justify-start"
                    onClick={() => {
                      setSearchQuery('');
                      fetchAllDocuments();
                    }}
                  >
                    <FolderOpen className="mr-2 h-4 w-4" />
                    Browse Files
                  </Button>
                  <Button
                    variant="outline"
                    className="w-full justify-start"
                    onClick={() => navigate('/free-trial')}
                  >
                    <FileText className="mr-2 h-4 w-4" />
                    Processing Lab
                  </Button>
                  <Button
                    variant="outline"
                    className="w-full justify-start"
                    onClick={() => navigate('/support')}
                  >
                    <Bell className="mr-2 h-4 w-4" />
                    Support Center
                  </Button>
                  
                  {/* Admin Console Button - shown only for admin users */}
                  {user?.role === 'admin' && (
                    <Button
                      variant="outline"
                      className="w-full justify-start"
                      onClick={() => navigate('/admin')}
                    >
                      <Settings className="mr-2 h-4 w-4" />
                      Admin Console
                    </Button>
                  )}
                </div>
              </div>

              {/* Document Types Section (only type, no category) */}
              <div>
                <h3 className="text-md font-medium mb-3">Document Types</h3>
                <div className="space-y-1 max-h-60 overflow-y-auto">
                  {sortedTypes.length === 0 ? (
                    <p className="text-sm text-muted-foreground px-2">No types yet</p>
                  ) : (
                    sortedTypes.map(([type, count]) => (
                      <Button
                        key={type}
                        variant="ghost"
                        className="w-full justify-start text-sm"
                        onClick={() => {
                          setSearchQuery('');
                          setDocuments(allDocuments.filter((doc) => (doc.documentType || 'General') === type));
                        }}
                      >
                        <FileText className="mr-2 h-3 w-3" />
                        {type} ({count})
                      </Button>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Main Content */}
          <div className="lg:col-span-3">
            <div className="space-y-6">
              {/* Welcome Section */}
              <div>
                <h1 className="text-3xl font-bold tracking-tight">
                  Welcome back, {user?.name?.split(' ')[0] || 'User'}
                </h1>
                <p className="text-muted-foreground">
                  Semantic search - find documents by meaning
                </p>
              </div>

              {/* Stats Cards */}
              <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Total Documents</CardTitle>
                    <FileText className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{stats.totalDocuments}</div>
                  </CardContent>
                </Card>
                
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Processed</CardTitle>
                    <CheckCircle className="h-4 w-4 text-green-600" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-green-600">{stats.processed}</div>
                  </CardContent>
                </Card>
                
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Processing</CardTitle>
                    <Clock className="h-4 w-4 text-yellow-600" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-yellow-600">{stats.processing}</div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Pending</CardTitle>
                    <Clock className="h-4 w-4 text-blue-600" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-blue-600">{stats.pending}</div>
                  </CardContent>
                </Card>
                
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Failed</CardTitle>
                    <AlertCircle className="h-4 w-4 text-red-600" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-red-600">{stats.failed}</div>
                  </CardContent>
                </Card>
              </div>

              {/* Document Management */}
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle>Recent Documents</CardTitle>
                      <CardDescription>
                        Search by meaning - just type what you're looking for
                      </CardDescription>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => setViewMode(viewMode === 'grid' ? 'list' : 'grid')}
                      >
                        {viewMode === 'grid' ? <List className="h-4 w-4" /> : <Grid3X3 className="h-4 w-4" />}
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  {/* Search Bar */}
                  <div className="flex flex-col space-y-3 mb-4">
                    <div className="relative flex-1">
                      <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="Search by meaning (semantic search)..."
                        value={searchQuery}
                        onChange={handleSearchChange}
                        className="pl-9"
                      />
                      {isSearching && (
                        <div className="absolute right-3 top-2.5">
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary"></div>
                        </div>
                      )}
                    </div>
                    
                    {searchQuery && (
                      <div className="text-xs text-muted-foreground flex items-center justify-between">
                        <span>🔍 Semantic search - finding documents by meaning</span>
                        <Badge variant="outline" className="text-xs">
                          {documents.length} results
                        </Badge>
                      </div>
                    )}
                  </div>

                  {isLoadingDocs ? (
                    <div className="text-center py-8 text-muted-foreground">Loading documents...</div>
                  ) : documents.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <FileText className="h-12 w-12 mx-auto mb-3 opacity-50" />
                      <p>No documents found</p>
                      <p className="text-sm">Upload your first document to get started</p>
                    </div>
                  ) : (
                    <div className={`grid gap-4 ${viewMode === 'grid' ? 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3' : 'grid-cols-1'}`}>
                      {documents.map((doc) => (
                        <div 
                          key={doc.id || doc.documentId} 
                          className="border rounded-lg p-4 hover:shadow-md transition-all cursor-pointer hover:border-primary/50 group"
                          onClick={() => handleDocumentClick(doc)}
                        >
                          <div className="flex items-start justify-between">
                            <div className="flex items-center space-x-2 flex-1">
                              <span className="text-2xl">{getFileIcon(doc.type)}</span>
                              <div className="flex-1 min-w-0">
                                <h4 className="font-medium text-sm break-words">{doc.name}</h4>
                                <p className="text-xs text-muted-foreground">{doc.size} • {doc.type}</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <Badge 
                                variant={
                                  doc.status === 'processed' ? 'default' : 
                                  doc.status === 'processing' ? 'secondary' : 'destructive'
                                }
                                className="flex-shrink-0"
                              >
                                {doc.status || 'uploaded'}
                              </Badge>
                              {doc.status === 'failed' && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="text-amber-600 hover:text-amber-700"
                                  onClick={(e) => reprocessDocument(doc.id || doc.documentId || '', e)}
                                  title="Reprocess this failed document"
                                >
                                  <RefreshCw className="h-4 w-4" />
                                </Button>
                              )}
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-red-500 hover:text-red-700 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-opacity"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  deleteDocument(doc.id || doc.documentId || '', e);
                                }}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                          <div className="mt-3 flex items-center justify-between flex-wrap gap-2">
                            <div className="flex items-center gap-2">
                              {doc.documentType && (
                                <Badge variant="secondary" className="text-xs">
                                  📄 {doc.documentType}
                                </Badge>
                              )}
                            </div>
                            <div className="flex items-center text-xs text-muted-foreground">
                              <Calendar className="h-3 w-3 mr-1" />
                              {formatDate(doc.uploadedAt)}
                            </div>
                          </div>
                          {doc.score !== undefined && doc.score > 0 && (
                            <div className="mt-2">
                              <div className="flex items-center justify-between text-xs mb-1">
                                <span className="text-muted-foreground">Relevance:</span>
                                <span className={`font-medium px-2 py-0.5 rounded-full ${getScoreColor(doc.score)}`}>
                                  {(doc.score * 100).toFixed(0)}%
                                </span>
                              </div>
                              <div className="w-full bg-gray-200 rounded-full h-1.5">
                                <div 
                                  className={`h-1.5 rounded-full ${getProgressColor(doc.score)}`}
                                  style={{ width: `${Math.min((doc.score || 0) * 100, 100)}%` }}
                                />
                              </div>
                            </div>
                          )}
                          {doc.extractedText && viewMode === 'grid' && (
                            <p className="text-xs text-muted-foreground mt-2 line-clamp-2 break-words">
                              {doc.extractedText.substring(0, 100)}...
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </div>

      {/* Document Details Modal */}
      <Dialog open={modal.open} onOpenChange={handleCloseModal}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          {modal.document && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-xl">
                  <span className="text-2xl">{getFileIcon(modal.document.type)}</span>
                  <span className="break-words">{modal.document.name}</span>
                </DialogTitle>
                <DialogDescription>
                  Document details and extracted content
                </DialogDescription>
              </DialogHeader>
              
              <div className="space-y-4 mt-4">
                {/* Document Metadata Grid (no Category row) */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 bg-muted/30 rounded-lg">
                  <div>
                    <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Document Name</div>
                    <div className="text-sm font-medium break-words mt-1">{modal.document.name}</div>
                  </div>
                  
                  <div>
                    <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Document Type</div>
                    <Badge variant="outline" className="mt-1">
                      {modal.document.documentType || 'General'}
                    </Badge>
                  </div>
                  
                  <div>
                    <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Uploaded</div>
                    <div className="text-sm mt-1 flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      {formatDate(modal.document.uploadedAt)}
                    </div>
                  </div>
                  
                  <div>
                    <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Processed</div>
                    <div className="text-sm mt-1 flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {modal.document.processedAt ? formatDate(modal.document.processedAt) : 'Processing completed'}
                    </div>
                  </div>
                  
                  <div>
                    <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">File Type</div>
                    <div className="text-sm mt-1">{modal.document.type || 'Unknown'}</div>
                  </div>
                  
                  <div>
                    <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">File Size</div>
                    <div className="text-sm mt-1">{modal.document.size || 'N/A'}</div>
                  </div>
                  
                  <div>
                    <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Status</div>
                    <Badge variant={modal.document.status === 'processed' ? 'default' : 'secondary'} className="mt-1">
                      {modal.document.status || 'processed'}
                    </Badge>
                  </div>
                </div>
                
                {/* Error message for failed documents */}
                {modal.document?.status === 'failed' && modal.document.errorMessage && (
                  <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
                    <p className="font-medium">Processing error</p>
                    <p className="mt-1">{modal.document.errorMessage}</p>
                  </div>
                )}
                
                {/* Extracted Text Section */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-semibold text-lg">Extracted Text</h3>
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={handleCopyText}
                      className="gap-1"
                    >
                      {copiedText ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                      {copiedText ? "Copied!" : "Copy Text"}
                    </Button>
                  </div>
                  <div className="bg-muted/30 rounded-lg p-4 max-h-96 overflow-y-auto border">
                    {modal.document.extractedText ? (
                      <div className="space-y-0.5">
                        {modal.document.extractedText.split('\n').map((line, idx) => (
                          line.trim() ? (
                            <p key={idx} className="text-sm font-mono leading-relaxed break-words border-b border-gray-100 last:border-0 py-1">
                              {line.trim()}
                            </p>
                          ) : null
                        ))}
                      </div>
                    ) : (
                      <div className="text-center text-muted-foreground py-8">
                        <FileText className="h-12 w-12 mx-auto mb-2 opacity-50" />
                        <p>No extracted text available.</p>
                      </div>
                    )}
                  </div>
                </div>
                
                {/* Action Buttons */}
                <div className="flex justify-end gap-2 pt-2">
                  <Button variant="outline" onClick={handleCloseModal}>
                    Close
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => modal.document && void openOriginalDocument(modal.document)}
                  >
                    <ExternalLink className="h-4 w-4 mr-2" />
                    Open Original
                  </Button>
                  {modal.document.extractedText && (
                    <Button 
                      variant="default"
                      onClick={() => {
                        const blob = new Blob([modal.document.extractedText || ''], { type: 'text/plain' });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = `${modal.document.name}_extracted.txt`;
                        a.click();
                        URL.revokeObjectURL(url);
                        toast({ title: "Downloaded", description: "Text saved as .txt file" });
                      }}
                    >
                      <Download className="h-4 w-4 mr-2" />
                      Download Text
                    </Button>
                  )}
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Dashboard;
