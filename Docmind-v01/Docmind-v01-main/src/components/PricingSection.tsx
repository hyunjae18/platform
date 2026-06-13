import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Link } from "react-router-dom";
import { 
  Check, 
  Star, 
  Zap, 
  Building2, 
  Crown,
  CreditCard,
  Smartphone,
  Shield
} from "lucide-react";

const plans = [
  {
    name: "Starter",
    price: "1,000",
    currency: "DZD",
    period: "/month",
    description: "Perfect for small businesses and individuals",
    featured: false,
    features: [
      "Up to 1,000 documents/month",
      "Basic OCR processing",
      "5GB cloud storage",
      "Email support",
      "Standard templates",
      // "Mobile app access"
    ],
    limitations: [
      "No advanced AI features",
      "Limited integrations"
    ]
  },
  {
    name: "Professional",
    price: "8,900",
    currency: "DZD", 
    period: "/month",
    description: "Ideal for growing businesses and teams",
    featured: true,
    features: [
      "Up to 10,000 documents/month",
      "Advanced AI-powered OCR",
      "50GB cloud storage",
      "Priority support",
      "Custom templates",
      "Team collaboration",
      "API access",
      "Multi-language support",
      "Workflow automation",
      "Analytics dashboard"
    ],
    limitations: []
  },
  {
    name: "Enterprise",
    price: "Custom",
    currency: "",
    period: "",
    description: "For large organizations with custom needs",
    featured: false,
    features: [
      "Unlimited documents",
      "Enterprise-grade security",
      "Unlimited storage",
      "24/7 dedicated support", 
      "Custom integrations",
      "Advanced analytics",
      "White-label solution",
      "On-premise deployment",
      "Compliance certifications",
      "SLA guarantees",
      "Training & onboarding",
      "Custom workflows"
    ],
    limitations: []
  }
];

const paymentMethods = [
  {
    name: "TPE (Terminal de Paiement Électronique)",
    description: "Electronic payment terminal - widely accepted across Algeria",
    icon: CreditCard,
    availability: "Available at all major banks and retailers"
  },
  {
    name: "ECCP (E-Commerce & Card Payment)",
    description: "Algerian electronic commerce and card payment system",
    icon: Smartphone,
    availability: "Secure local payment processing"
  }
];

const PricingSection = () => {
  return (
    <section id="pricing" className="py-20 bg-background">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="text-center space-y-4 mb-16">
          <div className="inline-flex items-center px-3 py-1 rounded-full bg-success/10 text-success text-sm font-medium">
             Transparent Pricing
          </div>
          <h2 className="text-3xl lg:text-5xl font-bold tracking-tight">
            Choose the perfect plan
            <span className="text-gradient block">for your business</span>
          </h2>
          <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
            Start free, scale as you grow. No hidden fees, no surprise charges. 
            Cancel anytime with our flexible pricing options.
          </p>
        </div>

        {/* Pricing Cards */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-16">
          {plans.map((plan, index) => (
            <Card 
              key={index} 
              className={`shadow-card hover:shadow-lg transition-all duration-300 relative ${
                plan.featured 
                  ? 'border-primary shadow-lg scale-105 bg-gradient-to-b from-primary/5 to-background' 
                  : 'border-border'
              }`}
            >
              {plan.featured && (
                <div className="absolute -top-3 left-1/2 transform -translate-x-1/2">
                  <Badge className="gradient-primary">
                    <Star className="h-3 w-3 mr-1" />
                    Most Popular
                  </Badge>
                </div>
              )}
              
              <CardHeader className="text-center">
                <div className="flex items-center justify-center mb-4">
                  {plan.name === 'Starter' && <Zap className="h-8 w-8 text-primary" />}
                  {plan.name === 'Professional' && <Building2 className="h-8 w-8 text-primary" />}
                  {plan.name === 'Enterprise' && <Crown className="h-8 w-8 text-primary" />}
                </div>
                <CardTitle className="text-2xl">{plan.name}</CardTitle>
                <div className="text-3xl font-bold">
                  {plan.price === 'Custom' ? (
                    <span>Custom</span>
                  ) : (
                    <>
                      <span className="text-sm font-normal">{plan.currency}</span>
                      {plan.price}
                      <span className="text-lg font-normal text-muted-foreground">{plan.period}</span>
                    </>
                  )}
                </div>
                <p className="text-muted-foreground">{plan.description}</p>
              </CardHeader>

              <CardContent className="space-y-6">
                <div className="space-y-3">
                  {plan.features.map((feature, idx) => (
                    <div key={idx} className="flex items-center gap-3">
                      <Check className="h-4 w-4 text-success flex-shrink-0" />
                      <span className="text-sm">{feature}</span>
                    </div>
                  ))}
                  {plan.limitations.map((limitation, idx) => (
                    <div key={idx} className="flex items-center gap-3 opacity-60">
                      <div className="h-4 w-4 rounded-full border border-muted-foreground flex-shrink-0" />
                      <span className="text-sm text-muted-foreground">{limitation}</span>
                    </div>
                  ))}
                </div>

                {plan.price === 'Custom' ? (
                  <Button 
                    className="w-full"
                    variant="outline"
                    size="lg"
                    onClick={() => window.open('mailto:sales@docmind.com?subject=Enterprise Plan Inquiry&body=Hello, I am interested in learning more about the Enterprise plan for my organization.', '_blank')}
                  >
                    Contact Sales
                  </Button>
                ) : (
                  <Link to="/signup">
                    <Button 
                      className={`w-full ${plan.featured ? 'gradient-primary' : ''}`}
                      variant={plan.featured ? 'default' : 'outline'}
                      size="lg"
                    >
                      Get Started
                    </Button>
                  </Link>
                )}
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Payment Methods for Algeria */}
        <div className="max-w-4xl mx-auto mb-16">
          <Card className="shadow-card">
            <CardHeader className="text-center">
              <CardTitle className="flex items-center justify-center gap-2">
                <Shield className="h-5 w-5 text-primary" />
                Payment Methods in Algeria
              </CardTitle>
              <p className="text-muted-foreground">
                Secure and convenient payment options for Algerian customers
              </p>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {paymentMethods.map((method, index) => (
                  <div key={index} className="flex items-start gap-4 p-4 rounded-lg border bg-secondary/20">
                    <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <method.icon className="h-6 w-6 text-primary" />
                    </div>
                    <div>
                      <h4 className="font-semibold mb-2">{method.name}</h4>
                      <p className="text-sm text-muted-foreground mb-2">{method.description}</p>
                      <Badge variant="outline" className="text-xs">
                        {method.availability}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-6 p-4 rounded-lg bg-accent/10 border border-accent/20">
                <p className="text-sm text-center text-muted-foreground">
                  <Shield className="h-4 w-4 inline mr-2" />
                  All payments are processed securely with bank-level encryption and compliance with Algerian banking regulations
                </p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* FAQ */}
        <div className="max-w-3xl mx-auto">
          <h3 className="text-2xl font-bold text-center mb-8">Frequently Asked Questions</h3>
          <div className="space-y-4">
            <Card className="shadow-card">
              <CardContent className="p-6">
                <h4 className="font-semibold mb-2">Can I change plans anytime?</h4>
                <p className="text-muted-foreground text-sm">
                  Yes, you can upgrade or downgrade your plan at any time. Changes take effect immediately, 
                  and we'll prorate the billing accordingly.
                </p>
              </CardContent>
            </Card>
            
            <Card className="shadow-card">
              <CardContent className="p-6">
                <h4 className="font-semibold mb-2">Is there a setup fee?</h4>
                <p className="text-muted-foreground text-sm">
                  No setup fees for Starter and Professional plans. Enterprise plans may include 
                  one-time setup and onboarding fees depending on customization requirements.
                </p>
              </CardContent>
            </Card>
            
            <Card className="shadow-card">
              <CardContent className="p-6">
                <h4 className="font-semibold mb-2">What payment methods do you accept?</h4>
                <p className="text-muted-foreground text-sm">
                  We accept TPE (Terminal de Paiement Électronique) and ECCP payments, 
                  ensuring convenient and secure transactions for our Algerian customers.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* CTA */}
        <div className="text-center mt-16">
          <Card className="max-w-4xl mx-auto shadow-card bg-gradient-to-r from-primary/5 to-accent/5 border-primary/20">
            <CardContent className="p-8">
              <h3 className="text-2xl font-bold mb-4">Ready to Get Started?</h3>
              <p className="text-muted-foreground mb-6">
                Join thousands of businesses already saving time and money with DocMind
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Link to="/signup">
                  <Button size="lg" className="gradient-primary">
                    Start Free Trial
                  </Button>
                </Link>
                <Button 
                  size="lg" 
                  variant="outline"
                  onClick={() => window.open('mailto:sales@docmind.com?subject=Sales Inquiry&body=Hello, I would like to learn more about DocMind for my business.', '_blank')}
                >
                  Contact Sales
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </section>
  );
};

export default PricingSection;
