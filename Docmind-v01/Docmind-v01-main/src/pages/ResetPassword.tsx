import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Lock } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';

const ResetPassword = () => {
  const [searchParams] = useSearchParams();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const { resetPassword, isLoading } = useAuth();
  const navigate = useNavigate();
  const token = searchParams.get('token') || '';

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!token || password !== confirmPassword) {
      return;
    }

    const success = await resetPassword(token, password);
    if (success) {
      navigate('/login');
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/10 via-background to-accent/10 flex items-center justify-center p-4">
      <Card className="w-full max-w-md shadow-elevated">
        <CardHeader>
          <CardTitle>Set a new password</CardTitle>
          <CardDescription>
            Choose a new password for your DocMind account.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="password">New password</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Enter a strong password"
                  className="pl-9"
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirm-password">Confirm password</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  id="confirm-password"
                  type="password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  placeholder="Repeat the password"
                  className="pl-9"
                  required
                />
              </div>
              {confirmPassword && password !== confirmPassword ? (
                <p className="text-sm text-destructive">Passwords do not match.</p>
              ) : null}
            </div>

            <Button
              type="submit"
              className="w-full gradient-primary"
              disabled={isLoading || !token || password !== confirmPassword}
            >
              {isLoading ? 'Saving...' : 'Update password'}
            </Button>
          </form>

          <div className="text-sm text-muted-foreground text-center">
            <Link to="/login" className="text-primary hover:underline">Return to sign in</Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default ResetPassword;
