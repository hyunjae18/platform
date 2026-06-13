import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";

const Footer = () => {
  return (
    <footer className="bg-card border-t">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        {/* CTA Section */}
        <div className="py-16 text-center border-b">
          <div className="max-w-3xl mx-auto space-y-6">
            <h2 className="text-3xl lg:text-4xl font-bold">
              Ready to transform your
              <span className="text-gradient block">document workflows?</span>
            </h2>
            <p className="text-xl text-muted-foreground">
              Upload, process, archive, and search your documents from one workspace.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link to="/signup">
                <Button size="lg" className="gradient-primary group">
                  Start Free Trial
                  <ArrowRight className="ml-2 h-4 w-4 group-hover:translate-x-1 transition-transform" />
                </Button>
              </Link>
              <Link to="/support">
                <Button variant="outline" size="lg">
                  Schedule Demo
                </Button>
              </Link>
            </div>
          </div>
        </div>

        {/* Footer Links */}
        <div className="py-12 grid grid-cols-1 md:grid-cols-4 gap-8">
          <div className="space-y-4">
            <h3 className="text-2xl font-bold gradient-primary bg-clip-text text-transparent">
              DocMind
            </h3>
            <p className="text-muted-foreground">
              AI-powered document digitization and management platform for modern enterprises.
            </p>
          </div>

          <div className="space-y-4">
            <h4 className="font-semibold">Product</h4>
            <ul className="space-y-2 text-muted-foreground">
              <li><a href="/#features" className="hover:text-foreground transition-colors">Features</a></li>
              <li><a href="/#pricing" className="hover:text-foreground transition-colors">Pricing</a></li>
              <li><Link to="/workflows" className="hover:text-foreground transition-colors">Workflows</Link></li>
              <li><Link to="/guide" className="hover:text-foreground transition-colors">API</Link></li>
            </ul>
          </div>

          <div className="space-y-4">
            <h4 className="font-semibold">Company</h4>
            <ul className="space-y-2 text-muted-foreground">
              <li><Link to="/guide" className="hover:text-foreground transition-colors">About</Link></li>
              <li><Link to="/support" className="hover:text-foreground transition-colors">Careers</Link></li>
              <li><Link to="/support" className="hover:text-foreground transition-colors">Press</Link></li>
              <li><Link to="/support" className="hover:text-foreground transition-colors">Contact</Link></li>
            </ul>
          </div>

          <div className="space-y-4">
            <h4 className="font-semibold">Support</h4>
            <ul className="space-y-2 text-muted-foreground">
              <li><Link to="/support" className="hover:text-foreground transition-colors">Help Center</Link></li>
              <li><Link to="/guide" className="hover:text-foreground transition-colors">Documentation</Link></li>
              <li><Link to="/support" className="hover:text-foreground transition-colors">Status</Link></li>
              <li><Link to="/privacy" className="hover:text-foreground transition-colors">Security</Link></li>
            </ul>
          </div>
        </div>

        {/* Bottom */}
        <div className="py-6 border-t flex flex-col sm:flex-row justify-between items-center">
          <p className="text-muted-foreground text-sm">
            © 2026 DocMind. All rights reserved.
          </p>
          <div className="flex space-x-6 text-sm text-muted-foreground">
            <Link to="/privacy" className="hover:text-foreground transition-colors">Privacy Policy</Link>
            <Link to="/terms" className="hover:text-foreground transition-colors">Terms of Service</Link>
            <Link to="/privacy" className="hover:text-foreground transition-colors">Cookie Policy</Link>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
