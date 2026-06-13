import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Link } from "react-router-dom";
import { Upload, Search, Filter, MoreHorizontal, FileText, Image, Archive, Shield } from "lucide-react";
import api from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";

// Document interface
interface Document {
  id: string;
  name: string;
  type: string;
  size: string;
  status: 'processed' | 'processing' | 'failed' | 'uploaded' | 'reprocessing';
  uploadedAt: string;
  category: string;
}

const DashboardSection = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [recentDocuments, setRecentDocuments] = useState<Document[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [stats, setStats] = useState({
    totalDocuments: 0,
    processingQueue: 0,
    storageUsed: "0 GB",
    pendingReview: 0
  });

  // Fetch real documents from API
  useEffect(() => {
    const fetchDocuments = async () => {
      try {
        console.log('🔍 Fetching documents for dashboard...');
        const response = await api.get('/documents');
        
        console.log('📄 Documents response:', response.data);
        
        let documents = [];
        if (Array.isArray(response.data)) {
          documents = response.data;
        } else if (response.data.documents && Array.isArray(response.data.documents)) {
          documents = response.data.documents;
        } else if (response.data.data && Array.isArray(response.data.data)) {
          documents = response.data.data;
        }
        
        setRecentDocuments(documents.slice(0, 4)); // Show only recent 4
        
        // Calculate stats from real data
        const totalDocs = documents.length;
        const processingCount = documents.filter((d: Document) => d.status === 'processing').length;
        const pendingReview = documents.filter((d: Document) => !['processed', 'processing', 'failed'].includes(d.status)).length;
        
        // Calculate total size (assuming size is string like "2.4 MB")
        let totalSizeMB = 0;
        documents.forEach((doc: Document) => {
          const sizeStr = doc.size || "0 KB";
          const value = parseFloat(sizeStr);
          if (sizeStr.includes("MB")) {
            totalSizeMB += value;
          } else if (sizeStr.includes("KB")) {
            totalSizeMB += value / 1024;
          } else if (sizeStr.includes("GB")) {
            totalSizeMB += value * 1024;
          }
        });
        
        setStats({
          totalDocuments: totalDocs,
          processingQueue: processingCount,
          storageUsed: totalSizeMB > 1024 ? `${(totalSizeMB / 1024).toFixed(1)} GB` : `${totalSizeMB.toFixed(1)} MB`,
          pendingReview
        });
        
      } catch (error) {
        console.error("❌ Failed to fetch documents:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchDocuments();
  }, []);

  const getStatusBadge = (status: string) => {
    switch(status) {
      case 'processed':
        return <Badge className="bg-green-600 text-white">Processed</Badge>;
      case 'processing':
        return <Badge variant="secondary" className="bg-yellow-600 text-white">Processing</Badge>;
      case 'failed':
        return <Badge variant="destructive">Failed</Badge>;
      default:
        return <Badge variant="outline">Uploaded</Badge>;
    }
  };

  return (
    <section className="py-20 bg-background">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center space-y-4 mb-16">
          <div className="inline-flex items-center px-3 py-1 rounded-full bg-accent/10 text-accent text-sm font-medium">
            📊 Intelligent Dashboard
          </div>
          <h2 className="text-3xl lg:text-5xl font-bold tracking-tight">
            Complete visibility into your
            <span className="text-gradient block">document ecosystem</span>
          </h2>
          <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
            Monitor processing status, track analytics, and manage your entire document 
            repository from one centralized dashboard.
          </p>
        </div>

        <div className="max-w-6xl mx-auto">
          {/* Dashboard Header */}
          <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 mb-8">
            <div>
              <h3 className="text-2xl font-semibold mb-2">Document Management</h3>
              <p className="text-muted-foreground">Manage, search, and organize your enterprise documents</p>
            </div>
            <div className="flex items-center gap-3">
              <Link to="/dashboard">
                <Button variant="outline" size="sm">
                  <Filter className="h-4 w-4 mr-2" />
                  Filter
                </Button>
              </Link>
              <Link to="/dashboard">
                <Button variant="outline" size="sm">
                  <Search className="h-4 w-4 mr-2" />
                  Search
                </Button>
              </Link>
              <Link to="/signup">
                <Button size="sm" className="gradient-primary">
                  <Upload className="h-4 w-4 mr-2" />
                  Upload Documents
                </Button>
              </Link>
            </div>
          </div>

          {/* Analytics Cards with Real Data */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            <Card className="shadow-card">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Documents</CardTitle>
                <FileText className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.totalDocuments}</div>
                <p className="text-xs text-muted-foreground">Uploaded documents</p>
              </CardContent>
            </Card>

            <Card className="shadow-card">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Processing Queue</CardTitle>
                <Archive className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.processingQueue}</div>
                <p className="text-xs text-muted-foreground">Documents in queue</p>
              </CardContent>
            </Card>

            <Card className="shadow-card">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Storage Used</CardTitle>
                <Shield className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.storageUsed}</div>
                <p className="text-xs text-muted-foreground">Total storage</p>
              </CardContent>
            </Card>

            <Card className="shadow-card">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Pending Review</CardTitle>
                <Image className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.pendingReview}</div>
                <p className="text-xs text-muted-foreground">Uploaded or reprocessing</p>
              </CardContent>
            </Card>
          </div>

          {/* Main Dashboard Content */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Document List with Real Data */}
            <div className="lg:col-span-2">
              <Card className="shadow-card">
                <CardHeader>
                  <CardTitle>Recent Documents</CardTitle>
                </CardHeader>
                <CardContent>
                  {isLoading ? (
                    <div className="text-center py-8 text-muted-foreground">Loading documents...</div>
                  ) : recentDocuments.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <FileText className="h-12 w-12 mx-auto mb-3 opacity-50" />
                      <p>No documents found</p>
                      <p className="text-sm">Upload your first document to get started</p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {recentDocuments.map((doc) => (
                        <div
                          key={doc.id}
                          className="flex flex-col sm:flex-row sm:items-center gap-4 p-4 rounded-lg border hover:bg-secondary/50 transition-colors"
                        >
                          <div className="flex items-center space-x-4 flex-1 min-w-0">
                            <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                              <FileText className="h-5 w-5 text-primary" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <h4 className="font-medium truncate">{doc.name}</h4>
                              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
                                <span>{doc.type || 'Unknown'}</span>
                                <span className="hidden sm:inline">•</span>
                                <span>{doc.size || 'N/A'}</span>
                                <span className="hidden sm:inline">•</span>
                                <span>{doc.uploadedAt ? new Date(doc.uploadedAt).toLocaleDateString() : 'Unknown date'}</span>
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center justify-between sm:justify-end space-x-3">
                            {getStatusBadge(doc.status)}
                            <Button variant="ghost" size="sm">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Analytics Preview */}
            <div className="space-y-6">
              <Card className="shadow-card">
                <CardHeader>
                  <CardTitle>Processing Analytics</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3 text-sm">
                    <div className="flex items-center justify-between rounded-lg border p-3">
                      <span>Processed recent</span>
                      <span className="font-semibold">{recentDocuments.filter((doc) => doc.status === 'processed').length}</span>
                    </div>
                    <div className="flex items-center justify-between rounded-lg border p-3">
                      <span>Processing queue</span>
                      <span className="font-semibold">{stats.processingQueue}</span>
                    </div>
                    <div className="flex items-center justify-between rounded-lg border p-3">
                      <span>Pending review</span>
                      <span className="font-semibold">{stats.pendingReview}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="shadow-card">
                <CardHeader>
                  <CardTitle>Quick Actions</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <Link to="/signup">
                    <Button variant="outline" className="w-full justify-start">
                      <Upload className="h-4 w-4 mr-2" />
                      Bulk Upload Documents
                    </Button>
                  </Link>
                  <Link to="/dashboard">
                    <Button variant="outline" className="w-full justify-start">
                      <Search className="h-4 w-4 mr-2" />
                      Advanced Search
                    </Button>
                  </Link>
                  <Button
                    variant="outline"
                    className="w-full justify-start"
                    onClick={() => toast({ title: 'Coming soon', description: 'Security settings will be enabled in a future release.' })}
                  >
                    <Shield className="h-4 w-4 mr-2" />
                    Security Settings
                  </Button>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default DashboardSection;
