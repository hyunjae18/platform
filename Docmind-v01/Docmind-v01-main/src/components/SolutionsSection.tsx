import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Link } from "react-router-dom";
import { ArrowRight, Database, FileSearch, GraduationCap, Users } from "lucide-react";

const useCases = [
  {
    icon: FileSearch,
    title: "Invoice Processing",
    description: "Capture invoice text, totals, dates, and document numbers.",
    metrics: "Totals, dates, invoice IDs"
  },
  {
    icon: Users,
    title: "HR Records",
    description: "Organize resumes, employee files, and training certificates.",
    metrics: "People, skills, organizations"
  },
  {
    icon: GraduationCap,
    title: "Education Records",
    description: "Process certificates, registrations, and student documents.",
    metrics: "Names, schools, dates, IDs"
  },
  {
    icon: Database,
    title: "Archive Search",
    description: "Store originals in the archive and search extracted content.",
    metrics: "Archive plus OCR text"
  }
];

const SolutionsSection = () => {
  return (
    <section id="solutions" className="py-20 bg-secondary/30">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center space-y-4 mb-12">
          <div className="inline-flex items-center px-3 py-1 rounded-full bg-primary/10 text-primary text-sm font-medium">
            Workflow Use Cases
          </div>
          <h2 className="text-3xl lg:text-5xl font-bold tracking-tight">
            Popular document
            <span className="text-gradient block">workflows</span>
          </h2>
          <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
            Practical flows for the current DocMind platform: OCR, metadata extraction,
            classification, archive storage, and semantic search.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {useCases.map((useCase, index) => (
            <Card key={index} className="shadow-card hover:shadow-lg transition-all duration-300 text-center">
              <CardContent className="pt-6">
                <div className="h-12 w-12 rounded-lg bg-accent/10 flex items-center justify-center mx-auto mb-4">
                  <useCase.icon className="h-6 w-6 text-accent" />
                </div>
                <h4 className="font-semibold mb-2">{useCase.title}</h4>
                <p className="text-sm text-muted-foreground mb-3">{useCase.description}</p>
                <Badge variant="outline" className="text-xs">
                  {useCase.metrics}
                </Badge>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="text-center mt-16">
          <Card className="max-w-4xl mx-auto shadow-card bg-gradient-to-r from-primary/5 to-accent/5 border-primary/20">
            <CardContent className="p-8">
              <h3 className="text-2xl font-bold mb-4">Ready to test your document flow?</h3>
              <p className="text-muted-foreground mb-6">
                Upload a real sample, review OCR and metadata, then confirm the archived original is available.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Link to="/guide">
                  <Button size="lg" className="gradient-primary">
                    Read Guide
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </Link>
                <Link to="/support">
                  <Button size="lg" variant="outline">
                    Contact Support
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </section>
  );
};

export default SolutionsSection;
