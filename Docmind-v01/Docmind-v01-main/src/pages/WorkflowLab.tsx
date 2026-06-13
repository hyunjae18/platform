import { useEffect, useState } from 'react';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { ArrowLeft, Play, Plus } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface Workflow {
  id: string;
  name: string;
  description: string;
  type: 'ocr' | 'review' | 'archive' | 'search';
  status: 'idle' | 'running' | 'completed' | 'failed';
  steps: number;
  lastRunAt: string | null;
}

const WorkflowLab = () => {
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState<'ocr' | 'review' | 'archive' | 'search'>('ocr');
  const [steps, setSteps] = useState('3');
  const navigate = useNavigate();
  const { toast } = useToast();

  const loadWorkflows = async () => {
    const response = await api.get('/workflows');
    setWorkflows(response.data);
  };

  useEffect(() => {
    void loadWorkflows();
  }, []);

  const handleCreate = async () => {
    try {
      await api.post('/workflows', {
        name,
        description,
        type,
        steps: Number(steps),
      });
      setName('');
      setDescription('');
      setSteps('3');
      await loadWorkflows();
      toast({
        title: 'Workflow created',
        description: 'Your new workflow is ready.',
      });
    } catch {
      toast({
        title: 'Create failed',
        description: 'Could not create workflow.',
        variant: 'destructive',
      });
    }
  };

  const handleRun = async (workflowId: string) => {
    try {
      await api.post(`/workflows/${workflowId}/run`);
      await loadWorkflows();
      toast({
        title: 'Workflow executed',
        description: 'The test run completed successfully.',
      });
    } catch {
      toast({
        title: 'Run failed',
        description: 'Could not run the workflow test.',
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <Button variant="ghost" onClick={() => navigate('/dashboard')} className="gap-2">
          <ArrowLeft className="h-4 w-4" />
          Back to dashboard
        </Button>

        <div className="grid gap-6 lg:grid-cols-[340px,1fr]">
          <Card>
            <CardHeader>
              <CardTitle>Workflow test</CardTitle>
              <CardDescription>
                Create and run workflow definitions backed by the gateway API.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="workflow-name">Name</Label>
                <Input id="workflow-name" value={name} onChange={(event) => setName(event.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="workflow-description">Description</Label>
                <Input
                  id="workflow-description"
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Type</Label>
                <Select value={type} onValueChange={(value: typeof type) => setType(value)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ocr">OCR</SelectItem>
                    <SelectItem value="review">Review</SelectItem>
                    <SelectItem value="archive">Archive</SelectItem>
                    <SelectItem value="search">Search</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="workflow-steps">Steps</Label>
                <Input id="workflow-steps" type="number" min="1" value={steps} onChange={(event) => setSteps(event.target.value)} />
              </div>
              <Button onClick={handleCreate} className="w-full gradient-primary">
                <Plus className="mr-2 h-4 w-4" />
                Create workflow
              </Button>
            </CardContent>
          </Card>

          <div className="space-y-4">
            {workflows.map((workflow) => (
              <Card key={workflow.id}>
                <CardHeader>
                  <CardTitle>{workflow.name}</CardTitle>
                  <CardDescription>{workflow.description || 'No description'}</CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="text-sm text-muted-foreground">
                    {workflow.type.toUpperCase()} workflow, {workflow.steps} steps, status: {workflow.status}
                    <div>
                      Last run: {workflow.lastRunAt ? new Date(workflow.lastRunAt).toLocaleString() : 'never'}
                    </div>
                  </div>
                  <Button onClick={() => void handleRun(workflow.id)} variant="outline">
                    <Play className="mr-2 h-4 w-4" />
                    Run test
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default WorkflowLab;
