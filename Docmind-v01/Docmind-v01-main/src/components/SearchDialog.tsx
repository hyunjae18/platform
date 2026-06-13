import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import api from "@/lib/api";
import { 
  Search, 
  FileText,
  Filter,
  Loader2,
  Sparkles,
  ExternalLink
} from "lucide-react";
import { useNavigate } from "react-router-dom";

interface SearchDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const suggestions = [
  "invoice from Sonatrach",
  "client contract in 2023",
  "tax receipt showing VAT",
  "identification documents",
];

const SearchDialog = ({ open, onOpenChange }: SearchDialogProps) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [results, setResults] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const navigate = useNavigate();

  const handleSearch = async (query: string) => {
    if (!query) return;
    setIsLoading(true);
    setError("");
    try {
      const res = await api.post("/search", { query, top_k: 10 });
      const data = res.data;
      setResults(data.results || []);
    } catch (err: any) {
      setError(err.message || "An error occurred during search. Please make sure the backend is running.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader className="mb-4">
          <DialogTitle className="flex items-center gap-3 text-2xl text-primary font-bold">
            <Sparkles className="h-6 w-6 text-primary" />
            Intelligent Document Search
          </DialogTitle>
          <p className="text-muted-foreground text-sm mt-1">
            Search through your enterprise documents using natural language. Fast, accurate, and semantically powered.
          </p>
        </DialogHeader>
        
        <div className="space-y-6">
          <div className="relative flex gap-3 shadow-lg rounded-xl overflow-hidden bg-background">
            <div className="relative flex-1">
              <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 h-5 w-5 text-primary" />
              <Input
                placeholder="Ask me anything: 'show me IT invoices from 2023'..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-12 h-14 flex-1 text-lg border-2 border-transparent focus-visible:border-primary/50 focus-visible:ring-primary/20 bg-muted/30"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSearch(searchQuery);
                }}
              />
            </div>
            <Button 
              onClick={() => handleSearch(searchQuery)} 
              className="h-14 px-8 text-base font-semibold bg-gradient-primary hover:opacity-90 transition-opacity"
            >
              {isLoading ? <Loader2 className="animate-spin h-5 w-5 mr-2" /> : <Search className="h-5 w-5 mr-2" />}
              Search
            </Button>
          </div>

          {!searchQuery && results.length === 0 && (
            <div className="space-y-4 pt-4 border-t">
              <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Suggested Searches</h4>
              <div className="flex flex-wrap gap-2">
                {suggestions.map((suggestion, index) => (
                  <Button
                    key={index}
                    variant="secondary"
                    className="rounded-full bg-primary/10 hover:bg-primary/20 text-primary border-none shadow-sm transition-colors text-sm py-1 h-auto"
                    onClick={() => {
                      setSearchQuery(suggestion);
                      handleSearch(suggestion);
                    }}
                  >
                    "{suggestion}"
                  </Button>
                ))}
              </div>
            </div>
          )}

          {error && (
            <div className="p-4 bg-red-50 text-red-600 rounded-lg border border-red-200">
              {error}
            </div>
          )}

          {results.length > 0 && (
            <div className="space-y-5 animate-fade-in">
              <div className="flex items-center gap-2 pb-2 border-b">
                <Filter className="h-4 w-4 text-primary" />
                <span className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                  Found {results.length} Semantically Matched Documents
                </span>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                {results.map((doc, index) => {
                  const matchScore = Math.round(doc.score * 100);
                  const isHighMatch = matchScore > 75;

                  return (
                    <Card key={index} className="relative group hover:shadow-elevated transition-shadow duration-300 border-l-4" style={{borderLeftColor: isHighMatch ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground))'}}>
                      <div className="absolute top-4 right-4">
                        <Badge className={`${isHighMatch ? 'bg-primary' : 'bg-muted-foreground'} text-white`}>
                          {matchScore}% Match
                        </Badge>
                      </div>
                      
                      <CardContent className="p-6">
                        <div className="flex items-start gap-4">
                          <div className="h-12 w-12 shrink-0 rounded-xl bg-primary/10 flex items-center justify-center">
                            <FileText className="h-6 w-6 text-primary" />
                          </div>
                          <div className="flex-1 pr-16">
                            <h3 className="font-semibold text-lg text-foreground group-hover:text-primary transition-colors">
                              {doc.metadata?.fileName || doc.id}
                            </h3>
                            <div className="flex items-center gap-2 mt-1">
                              <Badge variant="outline" className="text-xs uppercase bg-background">
                                {doc.metadata?.category || doc.metadata?.Language?.toUpperCase() || 'General'}
                              </Badge>
                            </div>
                          </div>
                        </div>

                        <div className="mt-5 space-y-3">
                          {doc.metadata?.preview ? (
                            <div className="rounded-md bg-muted/40 p-3 text-sm text-muted-foreground">
                              {doc.metadata.preview}
                            </div>
                          ) : null}
                          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider border-b pb-1">Extracted Metadata</div>
                          <div className="grid grid-cols-2 gap-3 max-h-40 overflow-y-auto pr-2 custom-scrollbar">
                           {Object.entries(doc.metadata || {}).map(([key, value]) => {
                              if (key === 'fileName' || key === 'Language') return null;
                              
                              let displayValue = typeof value === 'object' ? JSON.stringify(value) : String(value);
                              
                              return (
                                <div key={key} className="bg-muted/40 p-2 rounded-md">
                                  <div className="text-[10px] text-muted-foreground font-semibold uppercase">{key.replace(/_/g, ' ')}</div>
                                  <div className="text-sm font-medium mt-0.5 truncate" title={displayValue}>{displayValue}</div>
                                </div>
                              );
                           })}
                          </div>
                        </div>
                        
                        <div className="mt-5 pt-4 border-t flex justify-end">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-primary hover:text-primary-hover hover:bg-primary/5"
                            onClick={() => {
                              onOpenChange(false);
                              navigate('/dashboard');
                            }}
                          >
                            <ExternalLink className="h-4 w-4 mr-2" />
                            Open Dashboard
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default SearchDialog;
