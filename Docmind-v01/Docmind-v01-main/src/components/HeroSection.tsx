import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowRight, Play, Shield, Zap, Archive } from "lucide-react";
import heroImage from "@/assets/hero-image.jpg";

const HeroSection = () => {
  return (
    <section className="relative overflow-hidden bg-gradient-to-br from-background to-primary-light/20 py-20 lg:py-32">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          {/* Content */}
          <div className="space-y-8">
            <div className="space-y-4">
              <div className="inline-flex items-center px-3 py-1 rounded-full bg-primary/10 text-primary text-sm font-medium">
                 AI-Powered Document Intelligence
              </div>
              <h1 className="text-4xl lg:text-6xl font-bold tracking-tight">
                Smart Document
                <span className="text-gradient block">
                  Digitization Platform
                </span>
              </h1>
              <p className="text-xl text-muted-foreground max-w-2xl">
                Transform your enterprise document workflows with intelligent OCR, 
                automated classification, and secure cloud storage. Built for modern businesses.
              </p>
            </div>

            {/* CTA Buttons */}
            <div className="flex flex-col sm:flex-row gap-4">
              <Link to="/signup">
                <Button size="lg" className="gradient-primary group">
                  Start Free Trial
                  <ArrowRight className="ml-2 h-4 w-4 group-hover:translate-x-1 transition-transform" />
                </Button>
              </Link>
              <Link to="/guide">
                <Button variant="outline" size="lg" className="group">
                  <Play className="mr-2 h-4 w-4" />
                  Watch Demo
                </Button>
              </Link>
            </div>

            {/* Trust Indicators */}
            <div className="flex items-center space-x-8 pt-8">
              <div className="flex items-center space-x-2 text-sm text-muted-foreground">
                <Shield className="h-4 w-4 text-success" />
                <span>Enterprise Security</span>
              </div>
              <div className="flex items-center space-x-2 text-sm text-muted-foreground">
                <Zap className="h-4 w-4 text-warning" />
                <span>OCR + Metadata</span>
              </div>
              <div className="flex items-center space-x-2 text-sm text-muted-foreground">
                <Archive className="h-4 w-4 text-accent" />
                <span>Archive Storage</span>
              </div>
            </div>
          </div>

          {/* Hero Image */}
          <div className="relative">
            <div className="relative rounded-2xl overflow-hidden shadow-floating">
              <img
                src={heroImage}
                alt="DocMind Platform Preview"
                className="w-full h-auto object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-primary/20 to-transparent" />
            </div>
            
            {/* Floating Stats */}
            <div className="absolute -bottom-6 left-6 bg-card rounded-xl shadow-elevated p-4 border">
              <div className="flex items-center space-x-3">
                <div className="h-10 w-10 rounded-lg bg-success/10 flex items-center justify-center">
                  <div className="h-4 w-4 rounded-full bg-success" />
                </div>
                <div>
                  <p className="text-sm font-medium">Processing Documents</p>
                  <p className="text-xs text-muted-foreground">Live queue status</p>
                </div>
              </div>
            </div>

            <div className="absolute -top-6 right-6 bg-card rounded-xl shadow-elevated p-4 border">
              <div className="flex items-center space-x-3">
                <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Zap className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <p className="text-sm font-medium">Metadata Ready</p>
                  <p className="text-xs text-muted-foreground">People, dates, IDs</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      
      {/* Background Decoration */}
      <div className="absolute top-0 right-0 -z-10 transform translate-x-1/2 -translate-y-1/2">
        <div className="h-96 w-96 rounded-full bg-gradient-to-br from-primary/20 to-accent/20 blur-3xl" />
      </div>
    </section>
  );
};

export default HeroSection;
