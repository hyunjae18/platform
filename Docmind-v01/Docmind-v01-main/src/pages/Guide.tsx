import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Link } from "react-router-dom";
import { 
  BookOpen, 
  Play, 
  CheckCircle, 
  ArrowRight,
  Upload,
  Scan,
  Search,
  Download,
  Settings,
  Users,
  Shield,
  Clock
} from "lucide-react";

const steps = [
  {
    icon: Upload,
    title: "Upload Your Documents",
    description: "Drag and drop or select documents from your device",
    details: [
      "Support for PDF, images, WebP, TXT, DOCX, and PowerPoint formats",
      "Batch upload up to 100 files",
      "Automatic format detection",
      "Progress tracking for large uploads"
    ],
    time: "30 seconds"
  },
  {
    icon: Scan,
    title: "AI Processing",
    description: "Our AI analyzes and extracts text and metadata",
    details: [
      "OCR extraction with visible text output for review",
      "Automatic language detection",
      "Metadata extraction (dates, titles, etc.)",
      "Smart document classification"
    ],
    time: "1-2 minutes"
  },
  {
    icon: Search,
    title: "Search & Organize",
    description: "Find and organize your processed documents",
    details: [
      "Full-text search across all documents",
      "Filter by date, type, or custom tags",
      "Create custom folders and categories",
      "Smart suggestions based on content"
    ],
    time: "Instant"
  },
  {
    icon: Download,
    title: "Export & Share",
    description: "Download or share your documents securely",
    details: [
      "Multiple export formats available",
      "Secure sharing with access controls",
      "Download original or processed versions",
      "Integration with cloud storage"
    ],
    time: "Few seconds"
  }
];

const features = [
  {
    icon: Settings,
    title: "Advanced Settings",
    description: "Customize OCR settings, languages, and processing options"
  },
  {
    icon: Users,
    title: "Team Collaboration",
    description: "Invite team members and manage document permissions"
  },
  {
    icon: Shield,
    title: "Security Features",
    description: "Set up encryption, access controls, and compliance settings"
  }
];

const tips = [
  "For best OCR results, ensure documents are well-lit and properly oriented",
  "Use batch processing for multiple similar documents to save time",
  "Set up custom templates for recurring document types",
  "Enable auto-backup to prevent data loss",
  "Use tags and folders to keep your documents organized"
];

const Guide = () => {
  return (
    <div className="min-h-screen bg-background">
      <Header />
      
      <main className="py-20">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          {/* Header */}
          <div className="text-center space-y-4 mb-16">
            <div className="inline-flex items-center px-3 py-1 rounded-full bg-primary/10 text-primary text-sm font-medium">
              📚 User Guide
            </div>
            <h1 className="text-3xl lg:text-5xl font-bold tracking-tight">
              Getting Started with
              <span className="text-gradient block">DocMind</span>
            </h1>
            <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
              Learn how to make the most of our AI-powered document management platform 
              with this comprehensive step-by-step guide.
            </p>
          </div>

          {/* Quick Start Video */}
          <Card className="max-w-4xl mx-auto shadow-card mb-16">
            <CardHeader className="text-center">
              <CardTitle className="text-2xl">Quick Start Video</CardTitle>
              <p className="text-muted-foreground">
                Watch this 3-minute overview to get started quickly
              </p>
            </CardHeader>
            <CardContent>
              <div className="aspect-video bg-secondary/30 rounded-lg flex items-center justify-center">
                <Button size="lg" className="gradient-primary">
                  <Play className="mr-2 h-5 w-5" />
                  Watch Tutorial (3:24)
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Step-by-Step Guide */}
          <div className="space-y-8 mb-16">
            <div className="text-center">
              <h2 className="text-2xl font-bold mb-4">Step-by-Step Process</h2>
              <p className="text-muted-foreground">
                Follow these simple steps to start processing your documents
              </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              {steps.map((step, index) => (
                <Card key={index} className="shadow-card hover:shadow-lg transition-all duration-300">
                  <CardHeader>
                    <div className="flex items-start gap-4">
                      <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                        <step.icon className="h-6 w-6 text-primary" />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <Badge variant="outline" className="text-xs">
                            Step {index + 1}
                          </Badge>
                          <div className="flex items-center gap-1 text-sm text-muted-foreground">
                            <Clock className="h-3 w-3" />
                            {step.time}
                          </div>
                        </div>
                        <CardTitle className="text-xl">{step.title}</CardTitle>
                        <p className="text-muted-foreground text-sm">{step.description}</p>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {step.details.map((detail, idx) => (
                        <div key={idx} className="flex items-start gap-2">
                          <CheckCircle className="h-4 w-4 text-success flex-shrink-0 mt-0.5" />
                          <span className="text-sm">{detail}</span>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>

          {/* Advanced Features */}
          <div className="space-y-8 mb-16">
            <div className="text-center">
              <h2 className="text-2xl font-bold mb-4">Advanced Features</h2>
              <p className="text-muted-foreground">
                Unlock the full potential of DocMind with these advanced capabilities
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {features.map((feature, index) => (
                <Card key={index} className="shadow-card text-center">
                  <CardContent className="pt-6">
                    <div className="h-12 w-12 rounded-lg bg-accent/10 flex items-center justify-center mx-auto mb-4">
                      <feature.icon className="h-6 w-6 text-accent" />
                    </div>
                    <h3 className="font-semibold mb-2">{feature.title}</h3>
                    <p className="text-sm text-muted-foreground">{feature.description}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>

          {/* Tips & Best Practices */}
          <Card className="shadow-card mb-16">
            <CardHeader>
              <CardTitle className="text-xl">💡 Tips & Best Practices</CardTitle>
              <p className="text-muted-foreground">
                Follow these tips to get the best results from DocMind
              </p>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {tips.map((tip, index) => (
                  <div key={index} className="flex items-start gap-3 p-3 rounded-lg bg-secondary/30">
                    <CheckCircle className="h-5 w-5 text-success flex-shrink-0 mt-0.5" />
                    <span className="text-sm">{tip}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* CTA */}
          <Card className="max-w-4xl mx-auto shadow-card bg-gradient-to-r from-primary/5 to-accent/5 border-primary/20">
            <CardContent className="p-8 text-center">
              <BookOpen className="h-12 w-12 text-primary mx-auto mb-4" />
              <h3 className="text-2xl font-bold mb-4">Ready to Get Started?</h3>
              <p className="text-muted-foreground mb-6">
                Now that you know how it works, try DocMind with your own documents
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Link to="/signup">
                  <Button size="lg" className="gradient-primary">
                    Start Free Trial
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </Link>
                <Link to="/dashboard">
                  <Button size="lg" variant="outline">
                    View Live Demo
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        </div>
      </main>

      <Footer />
    </div>
  );
};

export default Guide;
