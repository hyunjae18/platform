import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { ArrowLeft, Save } from 'lucide-react';

interface Profile {
  id: string;
  name: string;
  email: string;
  avatar?: string;
}

const Settings = () => {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [name, setName] = useState('');
  const [avatar, setAvatar] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    const loadProfile = async () => {
      const response = await api.get('/profile');
      setProfile(response.data);
      setName(response.data.name || '');
      setAvatar(response.data.avatar || '');
    };

    void loadProfile();
  }, []);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const response = await api.put('/profile', { name, avatar });
      setProfile(response.data);
      toast({
        title: 'Profile updated',
        description: 'Your settings were saved.',
      });
    } catch {
      toast({
        title: 'Save failed',
        description: 'Could not update your profile.',
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="mx-auto max-w-3xl space-y-6">
        <Button variant="ghost" onClick={() => navigate('/dashboard')} className="gap-2">
          <ArrowLeft className="h-4 w-4" />
          Back to dashboard
        </Button>

        <Card>
          <CardHeader>
            <CardTitle>Profile settings</CardTitle>
            <CardDescription>
              Manage the account information used by the frontend and gateway-backed APIs.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Email</Label>
              <Input value={profile?.email || ''} disabled />
            </div>

            <div className="space-y-2">
              <Label htmlFor="profile-name">Display name</Label>
              <Input id="profile-name" value={name} onChange={(event) => setName(event.target.value)} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="profile-avatar">Avatar URL</Label>
              <Input id="profile-avatar" value={avatar} onChange={(event) => setAvatar(event.target.value)} />
            </div>

            <Button onClick={handleSave} disabled={isSaving} className="gradient-primary">
              <Save className="mr-2 h-4 w-4" />
              {isSaving ? 'Saving...' : 'Save changes'}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Settings;
