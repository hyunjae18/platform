import { useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Menu, X, Search, Bell, User } from "lucide-react";
import SearchDialog from "./SearchDialog";
import { useAuth } from "@/contexts/AuthContext";

const Header = () => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const { user, logout } = useAuth();
  const homeAnchor = (section: string) => `/#${section}`;

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between">
          {/* Logo */}
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <h1 className="text-2xl font-bold gradient-primary bg-clip-text text-transparent">
                DocMind
              </h1>
            </div>
          </div>

          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center space-x-8">
            <a href={homeAnchor('features')} className="text-foreground hover:text-primary transition-colors">
              Features
            </a>
            <a href={homeAnchor('solutions')} className="text-foreground hover:text-primary transition-colors">
              Solutions
            </a>
            <a href={homeAnchor('pricing')} className="text-foreground hover:text-primary transition-colors">
              Pricing
            </a>
            <Link to="/support" className="text-foreground hover:text-primary transition-colors">
              Support
            </Link>
          </nav>

          {/* Desktop Actions */}
          <div className="hidden md:flex items-center space-x-4">
            <Button 
              variant="ghost" 
              size="sm"
              onClick={() => setIsSearchOpen(true)}
            >
              <Search className="h-4 w-4" />
            </Button>
            
            {user ? (
              <>
                <Button variant="ghost" size="sm">
                  <Bell className="h-4 w-4" />
                </Button>
                <Link to="/dashboard">
                  <Button variant="ghost" size="sm">
                    <User className="h-4 w-4" />
                    Dashboard
                  </Button>
                </Link>
                <Button variant="ghost" size="sm" onClick={logout}>
                  Logout
                </Button>
              </>
            ) : (
              <>
                <Link to="/login">
                  <Button variant="ghost" size="sm">
                    Sign In
                  </Button>
                </Link>
                <Link to="/signup">
                  <Button size="sm" className="gradient-primary">
                    Get Started
                  </Button>
                </Link>
              </>
            )}
          </div>

          {/* Mobile menu button */}
          <div className="md:hidden">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsMenuOpen(!isMenuOpen)}
            >
              {isMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </Button>
          </div>
        </div>

        {/* Mobile Navigation */}
        {isMenuOpen && (
          <div className="md:hidden">
            <div className="px-2 pt-2 pb-3 space-y-1 border-t">
              <a
                href={homeAnchor('features')}
                className="block px-3 py-2 text-foreground hover:text-primary transition-colors"
              >
                Features
              </a>
              <a
                href={homeAnchor('solutions')}
                className="block px-3 py-2 text-foreground hover:text-primary transition-colors"
              >
                Solutions
              </a>
              <a
                href={homeAnchor('pricing')}
                className="block px-3 py-2 text-foreground hover:text-primary transition-colors"
              >
                Pricing
              </a>
              <Link
                to="/support"
                className="block px-3 py-2 text-foreground hover:text-primary transition-colors"
              >
                Support
              </Link>
              <div className="pt-4 pb-2 space-y-2">
                <Button 
                  variant="ghost" 
                  className="w-full justify-start"
                  onClick={() => setIsSearchOpen(true)}
                >
                  <Search className="h-4 w-4 mr-2" />
                  Search Plans
                </Button>
                
                {user ? (
                  <>
                    <Link to="/dashboard">
                      <Button variant="ghost" className="w-full justify-start">
                        <User className="h-4 w-4 mr-2" />
                        Dashboard
                      </Button>
                    </Link>
                    <Button 
                      variant="ghost" 
                      className="w-full justify-start"
                      onClick={logout}
                    >
                      Logout
                    </Button>
                  </>
                ) : (
                  <>
                    <Link to="/login">
                      <Button variant="ghost" className="w-full justify-start">
                        Sign In
                      </Button>
                    </Link>
                    <Link to="/signup">
                      <Button className="w-full gradient-primary">
                        Get Started
                      </Button>
                    </Link>
                  </>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
      
      <SearchDialog 
        open={isSearchOpen} 
        onOpenChange={setIsSearchOpen} 
      />
    </header>
  );
};

export default Header;
