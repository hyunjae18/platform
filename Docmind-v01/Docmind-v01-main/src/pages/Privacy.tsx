import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const Privacy = () => (
  <div className="min-h-screen bg-background p-4 md:p-8">
    <div className="mx-auto max-w-3xl">
      <Card>
        <CardHeader>
          <CardTitle>Privacy Policy</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>Profile data, workflow definitions, password reset tokens, and audit metadata are stored in MongoDB-backed services.</p>
          <p>Document embeddings and semantic metadata stay in Qdrant through the metadata extraction pipeline.</p>
          <p>For production use, replace the local email outbox fallback with your own email webhook or SMTP bridge.</p>
        </CardContent>
      </Card>
    </div>
  </div>
);

export default Privacy;
