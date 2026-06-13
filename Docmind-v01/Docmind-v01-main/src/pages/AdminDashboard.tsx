import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import api from '@/lib/api';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Activity,
  AlertCircle,
  ArrowLeft,
  Database,
  ExternalLink,
  HardDrive,
  RefreshCw,
  Server,
  Settings,
  Shield,
  Trash2,
  UserCog,
  Users,
} from 'lucide-react';

// ========== MOCK DATA FLAG ==========
const useMockData = false;   // Set to false to use real backend
// ====================================

type UserRole = 'admin' | 'member';
type UserStatus = 'active' | 'invited' | 'disabled';
type ApprovalStatus = 'approved' | 'pending' | 'rejected';

interface AdminUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  requestedRole: UserRole;
  status: UserStatus;
  approvalStatus: ApprovalStatus;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
  avatar?: string;
}

interface AdminStats {
  generatedAt: string;
  overview: {
    totalUsers: number;
    activeUsers: number;
    disabledUsers: number;
    adminUsers: number;
    pendingApprovals: number;
    totalDocuments: number;
    processedDocuments: number;
    processingDocuments: number;
    pendingDocuments?: number;
    failedDocuments: number;
  };
  storage: {
    path: string;
    totalBytes: number;
    freeBytes: number;
    usedBytes: number;
    usagePercent: number;
    documentBytes: number;
    totalLabel: string;
    freeLabel: string;
    usedLabel: string;
    documentLabel: string;
  };
  services: Array<{
    name: string;
    status: string;
    detail: string;
  }>;
}

interface SupportMessage {
  id: string;
  name: string;
  email: string;
  subject: string;
  message: string;
  channel: 'form' | 'chat' | 'email';
  status: 'open' | 'answered';
  response?: string;
  createdAt: string;
}

interface FailedDocument {
  id: string;
  documentId: string;
  name: string;
  status: string;
  errorMessage: string;
  errorAt: string | null;
  errorUserId: string;
  reprocessCount: number;
  uploadedAt: string;
  enterpriseId: string;
}

// ---------- MOCK DATA ----------
const mockStats: AdminStats = {
  generatedAt: new Date().toISOString(),
  overview: {
    totalUsers: 18,
    activeUsers: 10,
    disabledUsers: 8,
    adminUsers: 2,
    pendingApprovals: 3,
    totalDocuments: 900,
    processedDocuments: 780,
    processingDocuments: 120,
    failedDocuments: 120,
  },
   storage: {
    path: '/mnt/truenas/documents',
    totalBytes: 400 * 1024 * 1024 * 1024,   // 400 GB in bytes
    freeBytes: 120 * 1024 * 1024 * 1024,    // 120 GB free
    usedBytes: 280 * 1024 * 1024 * 1024,    // 280 GB used
    usagePercent: 45,
    documentBytes: 250 * 1024 * 1024 * 1024, // 250 GB of actual documents
    totalLabel: '400 GB',
    freeLabel: '240 GB',
    usedLabel: '160 GB',
    documentLabel: '160 GB',
  },
  services: [
    { name: 'API Gateway', status: 'online', detail: 'All routes healthy' },
    { name: 'OCR Service', status: 'online', detail: '3 instances, avg 2.3 sec/doc' },
    { name: 'Classification', status: 'online', detail: '2 instances, 98% uptime' },
    { name: 'Semantic Search', status: 'online', detail: 'Elasticsearch' },
    { name: 'Archive Service', status: 'online', detail: 'MinIO + MongoDB' },
    { name: 'RabbitMQ', status: 'online', detail: 'Queue depth 12 messages' },
    { name: 'Metadata Extractor', status: 'online', detail: '2 instances' },
  ],
};

const mockUsers: AdminUser[] = [
  {
    id: '1',
    name: 'Ahmed Benali',
    email: 'ahmed@docmind.com',
    role: 'admin',
    requestedRole: 'admin',
    status: 'active',
    approvalStatus: 'approved',
    lastLoginAt: '2026-06-04T08:30:00Z',
    createdAt: '2026-05-10T10:00:00Z',
    updatedAt: '2026-06-04T08:30:00Z',
  },
  {
    id: '2',
    name: 'Fatima Zohra',
    email: 'fatima@docmind.com',
    role: 'member',
    requestedRole: 'admin',
    status: 'active',
    approvalStatus: 'pending',
    lastLoginAt: '2026-06-03T14:20:00Z',
    createdAt: '2026-05-15T11:00:00Z',
    updatedAt: '2026-06-03T14:20:00Z',
  },
  {
    id: '3',
    name: 'Youssef Mansouri',
    email: 'youssef@docmind.com',
    role: 'member',
    requestedRole: 'member',
    status: 'active',
    approvalStatus: 'approved',
    lastLoginAt: '2026-06-04T09:15:00Z',
    createdAt: '2026-05-20T09:00:00Z',
    updatedAt: '2026-06-04T09:15:00Z',
  },
  {
    id: '4',
    name: 'Lina Khelifa',
    email: 'lina@docmind.com',
    role: 'member',
    requestedRole: 'member',
    status: 'invited',
    approvalStatus: 'approved',
    lastLoginAt: null,
    createdAt: '2026-06-01T16:00:00Z',
    updatedAt: '2026-06-01T16:00:00Z',
  },
  {
    id: '5',
    name: 'Mehdi Bouazizi',
    email: 'mehdi@docmind.com',
    role: 'member',
    requestedRole: 'member',
    status: 'disabled',
    approvalStatus: 'rejected',
    lastLoginAt: '2026-05-30T11:00:00Z',
    createdAt: '2026-05-25T13:00:00Z',
    updatedAt: '2026-06-02T09:00:00Z',
  },
];

const mockSupportMessages: SupportMessage[] = [
  {
    id: '101',
    name: 'Hichem Rachedi',
    email: 'hichem@example.com',
    subject: 'OCR accuracy for Arabic invoices',
    message: 'The system misreads some numbers in scanned invoices. Could you improve the fine‑tuning?',
    channel: 'form',
    status: 'open',
    createdAt: '2026-06-03T10:00:00Z',
  },
  {
    id: '102',
    name: 'Nadia Cherif',
    email: 'nadia@company.com',
    subject: 'Search returns slow for large documents',
    message: 'Search takes >5 seconds for documents over 20 pages. Any optimizations?',
    channel: 'chat',
    status: 'answered',
    response: 'We are aware and will upgrade the embedding model. Thank you for reporting.',
    createdAt: '2026-06-02T15:30:00Z',
  },
];

// Helper functions
const formatDate = (value: string | null) =>
  value ? new Date(value).toLocaleString() : 'Never';

const statusTone = (status: string): 'default' | 'secondary' | 'destructive' => {
  if (status === 'online' || status === 'active') return 'default';
  if (status === 'degraded' || status === 'invited') return 'secondary';
  return 'destructive';
};

const getErrorMessage = (error: unknown, fallback: string) => {
  if (
    typeof error === 'object' &&
    error !== null &&
    'response' in error &&
    typeof (error as { response?: unknown }).response === 'object' &&
    (error as { response?: { data?: unknown } }).response?.data &&
    typeof (error as { response?: { data?: { message?: unknown } } }).response?.data?.message === 'string'
  ) {
    return (error as { response?: { data?: { message?: string } } }).response?.data?.message || fallback;
  }
  return fallback;
};

const AdminDashboard = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [supportMessages, setSupportMessages] = useState<SupportMessage[]>([]);
  const [failedDocs, setFailedDocs] = useState<FailedDocument[]>([]);
  const [reprocessingId, setReprocessingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [userFilter, setUserFilter] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<AdminUser | null>(null);
  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    role: 'member' as UserRole,
    status: 'active' as UserStatus,
    approvalStatus: 'approved' as ApprovalStatus,
  });

  const filteredUsers = users.filter((entry) => {
    const query = userFilter.toLowerCase();
    return (
      entry.name.toLowerCase().includes(query) ||
      entry.email.toLowerCase().includes(query) ||
      entry.role.toLowerCase().includes(query) ||
      entry.status.toLowerCase().includes(query)
    );
  });

  const loadAdminData = useCallback(async () => {
    if (useMockData) {
      // Simulate realistic loading time for screenshot
      await new Promise((resolve) => setTimeout(resolve, 500));
      setStats(mockStats);
      setUsers(mockUsers);
      setSupportMessages(mockSupportMessages);
      setFailedDocs([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const [statsRes, usersRes, supportRes, failedRes] = await Promise.all([
        api.get('/admin/stats'),
        api.get('/admin/users'),
        api.get('/support/messages'),
        api.get('/admin/documents/failed'),
      ]);
      setStats(statsRes.data);
      setUsers(usersRes.data);
      setSupportMessages(supportRes.data);
      setFailedDocs(failedRes.data ?? []);
    } catch (error: unknown) {
      toast({
        title: 'Admin dashboard unavailable',
        description: getErrorMessage(error, 'Could not load admin data.'),
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void loadAdminData();
  }, [loadAdminData]);

  const openCreateDialog = () => {
    setEditingUser(null);
    setForm({
      name: '',
      email: '',
      password: '',
      role: 'member',
      status: 'active',
      approvalStatus: 'approved',
    });
    setDialogOpen(true);
  };

  const openEditDialog = (targetUser: AdminUser) => {
    setEditingUser(targetUser);
    setForm({
      name: targetUser.name,
      email: targetUser.email,
      password: '',
      role: targetUser.role,
      status: targetUser.status,
      approvalStatus: targetUser.approvalStatus,
    });
    setDialogOpen(true);
  };

  const closeDialog = () => {
    setDialogOpen(false);
    setEditingUser(null);
    setForm({
      name: '',
      email: '',
      password: '',
      role: 'member',
      status: 'active',
      approvalStatus: 'approved',
    });
  };

  const handleDialogOpenChange = (open: boolean) => {
    if (!open) {
      closeDialog();
    } else {
      setDialogOpen(true);
    }
  };

  const handleSaveUser = async () => {
    if (!form.name || !form.email || (!editingUser && !form.password)) {
      toast({
        title: 'Missing fields',
        description: 'Name, email, and a password for new users are required.',
        variant: 'destructive',
      });
      return;
    }

    setSaving(true);
    try {
      const payload = {
        name: form.name,
        email: form.email,
        password: form.password || undefined,
        role: form.role,
        status: form.status,
        approvalStatus: form.approvalStatus,
      };

      if (editingUser) {
        await api.put(`/admin/users/${editingUser.id}`, payload);
      } else {
        await api.post('/admin/users', payload);
      }

      toast({
        title: editingUser ? 'User updated' : 'User created',
        description: editingUser
          ? 'Account changes were saved successfully.'
          : 'The new account is ready to sign in.',
      });

      closeDialog();
      await loadAdminData();
    } catch (error: unknown) {
      toast({
        title: 'Save failed',
        description: getErrorMessage(error, 'Could not save this user.'),
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteUser = async (targetUser: AdminUser) => {
    try {
      await api.delete(`/admin/users/${targetUser.id}`);
      toast({
        title: 'User removed',
        description: `${targetUser.name} was deleted.`,
      });
      await loadAdminData();
    } catch (error: unknown) {
      toast({
        title: 'Delete failed',
        description: getErrorMessage(error, 'Could not delete this user.'),
        variant: 'destructive',
      });
    }
  };

  const handleApprovalAction = async (targetUser: AdminUser, action: 'approve' | 'reject') => {
    try {
      await api.post(`/admin/users/${targetUser.id}/${action}`);
      toast({
        title: action === 'approve' ? 'Request approved' : 'Request rejected',
        description:
          action === 'approve'
            ? `${targetUser.name} can now sign in as ${targetUser.requestedRole}.`
            : `${targetUser.name}'s admin request was rejected.`,
      });
      await loadAdminData();
    } catch (error: unknown) {
      toast({
        title: 'Action failed',
        description: getErrorMessage(error, 'Could not update this request.'),
        variant: 'destructive',
      });
    }
  };

  const handleReprocess = async (doc: FailedDocument) => {
    if (doc.reprocessCount >= 3) {
      toast({
        title: 'Limit reached',
        description: `"${doc.name}" has been reprocessed ${doc.reprocessCount} times. Manual intervention required.`,
        variant: 'destructive',
      });
      return;
    }

    setReprocessingId(doc.id);
    try {
      await api.post(`/admin/documents/${doc.id}/reprocess`);
      toast({
        title: 'Reprocess triggered',
        description: `"${doc.name}" has been queued again (attempt ${doc.reprocessCount + 1}).`,
      });
      await loadAdminData();
    } catch (error: unknown) {
      toast({
        title: 'Reprocess failed',
        description: getErrorMessage(error, 'Could not reprocess this document.'),
        variant: 'destructive',
      });
    } finally {
      setReprocessingId(null);
    }
  };

  const handleOpenOriginal = async (doc: FailedDocument) => {
    const documentId = doc.documentId || doc.id;
    try {
      const response = await api.get(`/archive/${encodeURIComponent(documentId)}`, {
        responseType: 'blob',
      });
      const blob = new Blob([response.data], {
        type: response.headers['content-type'] || 'application/octet-stream',
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
    } catch (error: unknown) {
      toast({
        title: 'File unavailable',
        description: getErrorMessage(error, 'Could not open the archived original file.'),
        variant: 'destructive',
      });
    }
  };

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex items-center gap-3 text-muted-foreground">
          <RefreshCw className="h-5 w-5 animate-spin" />
          Loading admin workspace...
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex min-h-16 flex-col gap-4 py-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-3">
              <Button variant="outline" size="sm" onClick={() => navigate('/dashboard')}>
                <ArrowLeft className="h-4 w-4" />
                Back
              </Button>
              <div>
                <Link to="/" className="text-xl font-bold text-gradient">
                  DocMind
                </Link>
                <p className="text-sm text-muted-foreground">
                  Admin control center for users, infrastructure, and platform health
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary">{user?.role}</Badge>
              <Badge variant="outline">{stats?.generatedAt ? `Updated ${new Date(stats.generatedAt).toLocaleTimeString()}` : 'No data'}</Badge>
              <Button variant="outline" size="sm" onClick={() => void loadAdminData()}>
                <RefreshCw className="h-4 w-4" />
                Refresh
              </Button>
              <Button variant="ghost" size="sm" onClick={handleLogout}>
                Sign out
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto space-y-8 px-4 py-8 sm:px-6 lg:px-8">
        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <Card className="shadow-card">
            <CardHeader className="pb-2">
              <CardDescription>Total users</CardDescription>
              <CardTitle className="flex items-center justify-between text-3xl">
                {stats?.overview.totalUsers ?? 0}
                <Users className="h-5 w-5 text-primary" />
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              {stats?.overview.activeUsers ?? 0} active, {stats?.overview.disabledUsers ?? 0} disabled
            </CardContent>
          </Card>

          <Card className="shadow-card">
            <CardHeader className="pb-2">
              <CardDescription>Admin coverage</CardDescription>
              <CardTitle className="flex items-center justify-between text-3xl">
                {stats?.overview.adminUsers ?? 0}
                <Shield className="h-5 w-5 text-primary" />
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Accounts with platform-level access
            </CardContent>
          </Card>

          <Card className="shadow-card">
            <CardHeader className="pb-2">
              <CardDescription>Pending approvals</CardDescription>
              <CardTitle className="flex items-center justify-between text-3xl">
                {stats?.overview.pendingApprovals ?? 0}
                <UserCog className="h-5 w-5 text-primary" />
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Admin account requests waiting for review
            </CardContent>
          </Card>

          <Card className="shadow-card">
            <CardHeader className="pb-2">
              <CardDescription>Documents tracked</CardDescription>
              <CardTitle className="flex items-center justify-between text-3xl">
                {stats?.overview.totalDocuments ?? 0}
                <Database className="h-5 w-5 text-primary" />
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              {stats?.overview.processedDocuments ?? 0} processed, {stats?.overview.processingDocuments ?? 0} in pipeline
            </CardContent>
          </Card>

          <Card className="shadow-card">
            <CardHeader className="pb-2">
              <CardDescription>NAS capacity</CardDescription>
              <CardTitle className="flex items-center justify-between text-3xl">
                {stats?.storage.usagePercent ?? 0}%
                <HardDrive className="h-5 w-5 text-primary" />
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              {stats?.storage.usedLabel} used of {stats?.storage.totalLabel}
            </CardContent>
          </Card>
        </section>

        <Tabs defaultValue="overview" className="space-y-6">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="support">Support Inbox</TabsTrigger>
            <TabsTrigger value="users">Users</TabsTrigger>
            <TabsTrigger value="audit">Audit Log</TabsTrigger>
            <TabsTrigger value="failed">
              Failed jobs
              {failedDocs.length > 0 && (
                <span className="ml-2 rounded-full bg-destructive px-2 py-0.5 text-xs text-destructive-foreground">
                  {failedDocs.length}
                </span>
              )}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6">
            <div className="grid gap-6 xl:grid-cols-[1.25fr_0.75fr]">
              <Card className="shadow-card">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Activity className="h-5 w-5 text-primary" />
                    System health
                  </CardTitle>
                  <CardDescription>
                    Live service status and platform counters
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {stats?.services.map((service) => (
                    <div
                      key={service.name}
                      className="flex items-center justify-between rounded-lg border p-4"
                    >
                      <div>
                        <p className="font-medium">{service.name}</p>
                        <p className="text-sm text-muted-foreground">{service.detail}</p>
                      </div>
                      <Badge variant={statusTone(service.status)}>
                        {service.status}
                      </Badge>
                    </div>
                  ))}
                </CardContent>
              </Card>

              <Card className="shadow-card">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Server className="h-5 w-5 text-primary" />
                    Storage pressure
                  </CardTitle>
                  <CardDescription>
                    Current mounted path and document footprint
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="rounded-lg border p-4">
                    <p className="text-sm text-muted-foreground">Mounted path</p>
                    <p className="mt-1 break-all font-medium">{stats?.storage.path}</p>
                  </div>
                  <div>
                    <div className="mb-2 flex items-center justify-between text-sm">
                      <span>Filesystem usage</span>
                      <span>{stats?.storage.usagePercent}%</span>
                    </div>
                    <Progress value={stats?.storage.usagePercent ?? 0} />
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-lg border p-4">
                      <p className="text-sm text-muted-foreground">Free space</p>
                      <p className="mt-1 text-2xl font-semibold">{stats?.storage.freeLabel}</p>
                    </div>
                    <div className="rounded-lg border p-4">
                      <p className="text-sm text-muted-foreground">Docs indexed</p>
                      <p className="mt-1 text-2xl font-semibold">{stats?.storage.documentLabel}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            <div className="grid gap-6 md:grid-cols-3">
              <Card className="shadow-card">
                <CardHeader>
                  <CardTitle>User mix</CardTitle>
                  <CardDescription>Who currently has access</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <div className="flex items-center justify-between rounded-lg border p-3">
                    <span>Active users</span>
                    <span className="font-semibold">{stats?.overview.activeUsers}</span>
                  </div>
                  <div className="flex items-center justify-between rounded-lg border p-3">
                    <span>Disabled users</span>
                    <span className="font-semibold">{stats?.overview.disabledUsers}</span>
                  </div>
                  <div className="flex items-center justify-between rounded-lg border p-3">
                    <span>Admin users</span>
                    <span className="font-semibold">{stats?.overview.adminUsers}</span>
                  </div>
                  <div className="flex items-center justify-between rounded-lg border p-3">
                    <span>Pending approvals</span>
                    <span className="font-semibold">{stats?.overview.pendingApprovals}</span>
                  </div>
                </CardContent>
              </Card>

              <Card className="shadow-card">
                <CardHeader>
                  <CardTitle>Document pipeline</CardTitle>
                  <CardDescription>Processing status snapshot</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <div className="flex items-center justify-between rounded-lg border p-3">
                    <span>Processed</span>
                    <span className="font-semibold">{stats?.overview.processedDocuments}</span>
                  </div>
                  <div className="flex items-center justify-between rounded-lg border p-3">
                    <span>Processing</span>
                    <span className="font-semibold">{stats?.overview.processingDocuments}</span>
                  </div>
                  <div className="flex items-center justify-between rounded-lg border p-3">
                    <span>Pending review</span>
                    <span className="font-semibold">{stats?.overview.pendingDocuments ?? 0}</span>
                  </div>
                  <div className="flex items-center justify-between rounded-lg border p-3">
                    <span>Failed</span>
                    <span className="font-semibold">{stats?.overview.failedDocuments}</span>
                  </div>
                </CardContent>
              </Card>

              <Card className="shadow-card">
                <CardHeader>
                  <CardTitle>Access posture</CardTitle>
                  <CardDescription>Admin workspace defaults</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <div className="rounded-lg border p-3">
                    <p className="text-muted-foreground">Signed in as</p>
                    <p className="mt-1 font-medium">{user?.email}</p>
                  </div>
                  <div className="rounded-lg border p-3">
                    <p className="text-muted-foreground">Role</p>
                    <p className="mt-1 font-medium capitalize">{user?.role}</p>
                  </div>
                  <div className="rounded-lg border p-3">
                    <p className="text-muted-foreground">User status</p>
                    <p className="mt-1 font-medium capitalize">{user?.status}</p>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="support" className="space-y-6">
            <Card className="shadow-card">
              <CardHeader>
                <CardTitle>Support inbox</CardTitle>
                <CardDescription>
                  Requests submitted from the support page and email form
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {supportMessages.length === 0 ? (
                  <div className="text-sm text-muted-foreground">No support messages yet.</div>
                ) : (
                  supportMessages.map((entry) => (
                    <div key={entry.id} className="rounded-lg border p-4">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <p className="font-medium">{entry.subject}</p>
                          <p className="text-sm text-muted-foreground">
                            {entry.name} • {entry.email} • {entry.channel}
                          </p>
                        </div>
                        <Badge variant={entry.status === 'answered' ? 'default' : 'secondary'}>
                          {entry.status}
                        </Badge>
                      </div>
                      <p className="mt-3 text-sm">{entry.message}</p>
                      {entry.response ? (
                        <div className="mt-3 rounded-md bg-secondary/50 p-3 text-sm text-muted-foreground">
                          {entry.response}
                        </div>
                      ) : null}
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="audit" className="space-y-6">
            <Card className="shadow-card">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Activity className="h-5 w-5 text-primary" />
                  User audit log
                </CardTitle>
                <CardDescription>
                  Recent account activity from the user directory
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {users.length === 0 ? (
                  <div className="text-sm text-muted-foreground">No user activity yet.</div>
                ) : (
                  users
                    .slice()
                    .sort((a, b) => new Date(b.updatedAt || b.createdAt).getTime() - new Date(a.updatedAt || a.createdAt).getTime())
                    .slice(0, 30)
                    .map((entry) => (
                      <div key={entry.id} className="flex flex-col gap-2 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <p className="font-medium">{entry.name}</p>
                          <p className="text-sm text-muted-foreground">
                            {entry.email} - role {entry.role} - status {entry.status} - approval {entry.approvalStatus}
                          </p>
                        </div>
                        <div className="text-sm text-muted-foreground">
                          Last login: {formatDate(entry.lastLoginAt)}
                        </div>
                      </div>
                    ))
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="users" className="space-y-6">
            <Card className="shadow-card">
              <CardHeader>
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <UserCog className="h-5 w-5 text-primary" />
                      User management
                    </CardTitle>
                    <CardDescription>
                      Create accounts, change roles, reset passwords, and disable access
                    </CardDescription>
                  </div>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Input
                      value={userFilter}
                      onChange={(event) => setUserFilter(event.target.value)}
                      placeholder="Search name, email, role..."
                      className="sm:w-72"
                    />
                    <Button onClick={openCreateDialog}>
                      <Settings className="h-4 w-4" />
                      New user
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>User</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead>Requested</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Approval</TableHead>
                      <TableHead>Last login</TableHead>
                      <TableHead>Created</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredUsers.map((entry) => (
                      <TableRow key={entry.id}>
                        <TableCell>
                          <div>
                            <p className="font-medium">{entry.name}</p>
                            <p className="text-sm text-muted-foreground">{entry.email}</p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant={entry.role === 'admin' ? 'default' : 'secondary'}>
                            {entry.role}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant={entry.requestedRole === 'admin' ? 'default' : 'secondary'}>
                            {entry.requestedRole}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant={statusTone(entry.status)}>
                            {entry.status}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant={statusTone(entry.approvalStatus)}>
                            {entry.approvalStatus}
                          </Badge>
                        </TableCell>
                        <TableCell>{formatDate(entry.lastLoginAt)}</TableCell>
                        <TableCell>{new Date(entry.createdAt).toLocaleDateString()}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            {entry.approvalStatus === 'pending' && (
                              <>
                                <Button size="sm" onClick={() => void handleApprovalAction(entry, 'approve')}>
                                  Approve
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => void handleApprovalAction(entry, 'reject')}
                                >
                                  Reject
                                </Button>
                              </>
                            )}
                            <Button variant="outline" size="sm" onClick={() => openEditDialog(entry)}>
                              Edit
                            </Button>
                            <Button
                              variant="destructive"
                              size="sm"
                              disabled={entry.id === user?.id}
                              onClick={() => void handleDeleteUser(entry)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="failed" className="space-y-6">
            <Card className="shadow-card">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <AlertCircle className="h-5 w-5 text-destructive" />
                  Failed document jobs
                </CardTitle>
                <CardDescription>
                  Documents that could not be processed. Admins can trigger reprocessing (max 3 attempts).
                </CardDescription>
              </CardHeader>
              <CardContent>
                {failedDocs.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No failed documents. All clear.</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>File name</TableHead>
                        <TableHead>Enterprise</TableHead>
                        <TableHead>Error</TableHead>
                        <TableHead>Failed at</TableHead>
                        <TableHead>Attempts</TableHead>
                        <TableHead className="text-right">Action</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {failedDocs.map((doc) => (
                        <TableRow key={doc.id}>
                          <TableCell className="font-medium">{doc.name}</TableCell>
                          <TableCell>
                            <Badge variant="outline">{doc.enterpriseId}</Badge>
                          </TableCell>
                          <TableCell className="max-w-xs">
                            <p className="truncate text-sm text-destructive" title={doc.errorMessage}>
                              {doc.errorMessage || '—'}
                            </p>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {doc.errorAt ? new Date(doc.errorAt).toLocaleString() : '—'}
                          </TableCell>
                          <TableCell>
                            <Badge variant={doc.reprocessCount >= 3 ? 'destructive' : 'secondary'}>
                              {doc.reprocessCount} / 3
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => void handleOpenOriginal(doc)}
                              >
                                <ExternalLink className="mr-2 h-4 w-4" />
                                Open
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={doc.reprocessCount >= 3 || reprocessingId === doc.id}
                                onClick={() => void handleReprocess(doc)}
                              >
                                <RefreshCw
                                  className={`mr-2 h-4 w-4 ${reprocessingId === doc.id ? 'animate-spin' : ''}`}
                                />
                                {reprocessingId === doc.id ? 'Queuing...' : 'Reprocess'}
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>

      <Dialog open={dialogOpen} onOpenChange={handleDialogOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingUser ? 'Edit user' : 'Create user'}</DialogTitle>
            <DialogDescription>
              {editingUser
                ? 'Update credentials, role, or account status.'
                : 'Create a new platform account with initial credentials.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="admin-user-name">Full name</Label>
              <Input
                id="admin-user-name"
                value={form.name}
                onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                placeholder="Jane Doe"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="admin-user-email">Email</Label>
              <Input
                id="admin-user-email"
                type="email"
                value={form.email}
                onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
                placeholder="jane@company.com"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="admin-user-password">
                {editingUser ? 'New password' : 'Password'}
              </Label>
              <Input
                id="admin-user-password"
                type="password"
                value={form.password}
                onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))}
                placeholder={editingUser ? 'Leave blank to keep current password' : 'Set initial password'}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Role</Label>
                <Select
                  value={form.role}
                  onValueChange={(value: UserRole) =>
                    setForm((current) => ({ ...current, role: value }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select role" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="member">member</SelectItem>
                    <SelectItem value="admin">admin</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Status</Label>
                <Select
                  value={form.status}
                  onValueChange={(value: UserStatus) =>
                    setForm((current) => ({ ...current, status: value }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">active</SelectItem>
                    <SelectItem value="invited">invited</SelectItem>
                    <SelectItem value="disabled">disabled</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Approval</Label>
              <Select
                value={form.approvalStatus}
                onValueChange={(value: ApprovalStatus) =>
                  setForm((current) => ({ ...current, approvalStatus: value }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select approval" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="approved">approved</SelectItem>
                  <SelectItem value="pending">pending</SelectItem>
                  <SelectItem value="rejected">rejected</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={closeDialog}>
              Cancel
            </Button>
            <Button onClick={() => void handleSaveUser()} disabled={saving}>
              {saving ? 'Saving...' : editingUser ? 'Save changes' : 'Create user'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminDashboard;
