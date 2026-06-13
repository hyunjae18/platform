import { Card, CardContent } from "@/components/ui/card";
import { Camera, Search, Shield, Folder, Users } from "lucide-react";
import scanFeature from "@/assets/scan-feature.jpg";
import secureStorage from "@/assets/secure-storage.jpg";
import dashboardPreview from "@/assets/dashboard-preview.jpg";
import searchEngine from "@/assets/search-engine.jpg";
import smartClassification from "@/assets/smart-classification.jpg";
import multiPlatform from "@/assets/multi-platform.jpg";

const features = [
  {
    icon: Camera,
    title: "Document Digitization",
    description: "Capture documents via desktop scanners or mobile cameras with AI-powered image enhancement.",
    image: scanFeature,
    color: "text-primary"
  },
  {
    icon: Search,
    title: "OCR & Metadata Extraction",
    description: "Automatically recognize text and extract meaningful metadata like titles, dates, and keywords.",
    image: dashboardPreview,
    color: "text-accent"
  },
  {
    icon: Folder,
    title: "Smart Classification",
    description: "Organize documents through intelligent classification algorithms and semantic indexing.",
    image: smartClassification,
    color: "text-warning"
  },
  {
    icon: Shield,
    title: "Secure Storage",
    description: "Store documents in a secure environment with user-based access permissions and audit logging.",
    image: secureStorage,
    color: "text-success"
  },
  {
    icon: Search,
    title: "Advanced Search Engine",
    description: "Find documents quickly with full-text search, filters, and metadata-based queries.",
    image: searchEngine,
    color: "text-destructive"
  },
  {
    icon: Users,
    title: "Multi-Platform Access",
    description: "Access the platform through responsive web interface.",
    image: multiPlatform,
    color: "text-muted-foreground"
  }
];

const FeaturesSection = () => {
  return (
    <section id="features" className="py-20 bg-secondary/30">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center space-y-4 mb-16">
          <div className="inline-flex items-center px-3 py-1 rounded-full bg-primary/10 text-primary text-sm font-medium">
            ✨ Powerful Features
          </div>
          <h2 className="text-3xl lg:text-5xl font-bold tracking-tight">
            Everything you need for
            <span className="text-gradient block">document management</span>
          </h2>
          <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
            OCR, metadata extraction, classification, archive storage, and search are connected
            into one document workspace.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {features.map((feature, index) => (
            <Card 
              key={index} 
              className="group hover:shadow-elevated transition-all duration-300 border-0 shadow-card hover:-translate-y-1"
            >
              <CardContent className="p-6 space-y-4">
                {feature.image && (
                  <div className="aspect-video rounded-lg overflow-hidden mb-4">
                    <img
                      src={feature.image}
                      alt={feature.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                  </div>
                )}
                
                <div className={`h-12 w-12 rounded-lg bg-gradient-to-br from-${feature.color.replace('text-', '')}/10 to-${feature.color.replace('text-', '')}/20 flex items-center justify-center`}>
                  <feature.icon className={`h-6 w-6 ${feature.color}`} />
                </div>
                
                <div className="space-y-2">
                  <h3 className="text-xl font-semibold">{feature.title}</h3>
                  <p className="text-muted-foreground">{feature.description}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Stats Section */}
        <div className="mt-20 grid grid-cols-2 lg:grid-cols-4 gap-8">
          <div className="text-center">
            <div className="text-3xl lg:text-4xl font-bold text-primary mb-2">6</div>
            <div className="text-muted-foreground">Core Workflows</div>
          </div>
          <div className="text-center">
            <div className="text-3xl lg:text-4xl font-bold text-accent mb-2">3</div>
            <div className="text-muted-foreground">OCR Instances</div>
          </div>
          <div className="text-center">
            <div className="text-3xl lg:text-4xl font-bold text-success mb-2">2</div>
            <div className="text-muted-foreground">Search Stores</div>
          </div>
          <div className="text-center">
            <div className="text-3xl lg:text-4xl font-bold text-warning mb-2">1</div>
            <div className="text-muted-foreground">Archive Service</div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default FeaturesSection;
