import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import api from "@/lib/api";
import { useState } from "react";
import { Mail, FileText, Clock, CheckCircle, Search, Book, Users, ArrowRight } from "lucide-react";

const SUPPORT_EMAIL = "docmind2026@gmail.com";

const faqCategories = [
  {
    title: "Documents",
    icon: FileText,
    questions: [
      "Supported uploads: PDF, images, WebP, plain text, Word, and PowerPoint files.",
      "Unsupported document types are saved but clearly marked so an admin can review them.",
      "Failed OCR jobs can be retried from the admin dashboard up to three times.",
      "Archived originals remain available for download and later reprocessing."
    ]
  },
  {
    title: "Search & Metadata",
    icon: Search,
    questions: [
      "Search uses extracted OCR text plus metadata such as people, dates, phones, and keywords.",
      "Document type filters match the stored classification instead of guessing by keyword.",
      "Low-confidence search results are hidden so the dashboard stays useful.",
      "Arabic and French documents are supported, with extraction quality depending on OCR output."
    ]
  },
  {
    title: "Accounts",
    icon: Users,
    questions: [
      "Admins approve user access and role changes from the admin dashboard.",
      "Support replies are handled manually by email for this version.",
      "Audit entries show recent user and admin activity.",
      "Security settings are planned and will be enabled in a future release."
    ]
  }
];

const Support = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [name, setName] = useState(user?.name || "");
  const [email, setEmail] = useState(user?.email || "");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [isSending, setIsSending] = useState(false);

  const handleFormSubmit = async () => {
    if (!message.trim()) return;
    setIsSending(true);
    try {
      await api.post("/support/messages", {
        name: name || user?.name || "DocMind User",
        email: email || user?.email || "user@docmind.local",
        userId: user?.id,
        subject: subject || "General support request",
        message,
        channel: "email",
      });
      toast({
        title: "Support request sent",
        description: `Your message was sent to ${SUPPORT_EMAIL}.`,
      });
      setSubject("");
      setMessage("");
    } catch {
      toast({
        title: "Send failed",
        description: "Could not submit your support request.",
        variant: "destructive",
      });
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <main className="py-20">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center space-y-4 mb-16">
            <div className="inline-flex items-center px-3 py-1 rounded-full bg-primary/10 text-primary text-sm font-medium">
              Support Center
            </div>
            <h1 className="text-3xl lg:text-5xl font-bold tracking-tight">
              Send a message to
              <span className="text-gradient block">DocMind support</span>
            </h1>
            <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
              Support is email-based for now. An admin reviews each request and replies manually.
            </p>
          </div>

          <div className="max-w-2xl mx-auto mb-16">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search common upload, OCR, metadata, and account questions..."
                className="pl-10 h-12 text-base"
              />
            </div>
          </div>

          <Card className="shadow-card max-w-3xl mx-auto mb-16">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Mail className="h-5 w-5 text-primary" />
                Contact Support
              </CardTitle>
              <p className="text-muted-foreground text-sm">
                Messages are sent to {SUPPORT_EMAIL} and saved in the admin support inbox.
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Input placeholder="Your full name" value={name} onChange={(event) => setName(event.target.value)} />
                <Input type="email" placeholder="your@email.com" value={email} onChange={(event) => setEmail(event.target.value)} />
              </div>
              <Input placeholder="Brief description of your issue" value={subject} onChange={(event) => setSubject(event.target.value)} />
              <Textarea
                placeholder="Please describe your issue or question in detail..."
                rows={6}
                value={message}
                onChange={(event) => setMessage(event.target.value)}
              />
              <div className="flex flex-col sm:flex-row gap-3">
                <Button className="flex-1 gradient-primary" disabled={isSending || !message.trim()} onClick={() => void handleFormSubmit()}>
                  Send Message
                  <Mail className="ml-2 h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  onClick={() => window.open(`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject || "DocMind support")}`)}
                >
                  Open Email
                </Button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 text-sm text-muted-foreground">
                <div className="rounded-lg border p-3 flex items-center gap-2"><Clock className="h-4 w-4" /> Manual reply</div>
                <div className="rounded-lg border p-3 flex items-center gap-2"><Mail className="h-4 w-4" /> Email inbox</div>
                <div className="rounded-lg border p-3 flex items-center gap-2"><CheckCircle className="h-4 w-4" /> Admin tracked</div>
              </div>
            </CardContent>
          </Card>

          <div className="space-y-8 mb-16">
            <div className="text-center">
              <h2 className="text-2xl font-bold mb-4">Frequently Asked Questions</h2>
              <p className="text-muted-foreground">
                Practical answers for the current DocMind platform.
              </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              {faqCategories.map((category, index) => (
                <Card key={index} className="shadow-card">
                  <CardHeader>
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                        <category.icon className="h-5 w-5 text-primary" />
                      </div>
                      <CardTitle className="text-lg">{category.title}</CardTitle>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {category.questions.map((question, idx) => (
                        <div key={idx} className="flex items-start gap-2 p-2 rounded-lg hover:bg-secondary/50 transition-colors">
                          <CheckCircle className="h-4 w-4 text-success flex-shrink-0 mt-0.5" />
                          <span className="text-sm">{question}</span>
                        </div>
                      ))}
                    </div>
                    <Button variant="outline" className="w-full mt-4" onClick={() => window.location.assign("/#features")}>
                      View Platform Features
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
};

export default Support;
