import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const Terms = () => (
  <div className="min-h-screen bg-background p-4 md:p-8">
    <div className="mx-auto max-w-3xl">
      <Card>
        <CardHeader>
          <CardTitle>Terms of Service</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>DocMind is provided for document digitization, metadata extraction, semantic search, and workflow testing.</p>
          <p>Use only data you are allowed to process, and configure your own production email and storage credentials before deployment.</p>
          <p>This page exists so the signup flow and footer links resolve correctly instead of landing on broken routes.</p>
        </CardContent>
      </Card>
    </div>
  </div>
);

export default Terms;
