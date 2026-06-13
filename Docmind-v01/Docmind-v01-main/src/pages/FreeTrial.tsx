import { useState, useRef, useCallback, useEffect } from 'react';
import { useDropzone } from 'react-dropzone';
import Webcam from 'react-webcam';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { useNavigate } from 'react-router-dom';
import { useToast } from '@/hooks/use-toast';
import api from '@/lib/api';
import { 
  Upload, 
  Camera, 
  FileText, 
  ArrowLeft, 
  CheckCircle, 
  Loader2, 
  Mail,
  Phone,
  Calendar,
  Tag,
  User,
  AlertCircle,
  RefreshCw,
  Building,
  MapPin,
  CreditCard,
  Globe,
  Hash
} from 'lucide-react';

interface Metadata {
  // Transformed structure (from GLiNER via metadata service)
  category?: string;
  entities?: {
    people?: string[];
    places?: string[];
    organizations?: string[];
  };
  contact_info?: {
    emails?: string[];
    phones?: string[];
  };
  dates?: string[];
  summary?: string;
  // Legacy flat fields (if any)
  document_type?: string;
  organization_name?: string;
  person_name?: string;
  date?: string;
  invoice_number?: string;
  contract_number?: string;
  registration_number?: string;
  phone?: string;
  email?: string;
  address?: string;
  country?: string;
  city?: string;
  amount?: number;
  currency?: string;
  keywords?: string[];
  languages?: string[];
  custom_fields?: Record<string, unknown>;
  [key: string]: unknown;
}

interface ProcessedDocument {
  id: string;
  documentId?: string;
  name: string;
  text: string;
  metadata?: Metadata;
  confidence: number;
  processingTime: number;
  size: string;
  type: string;
  forceProcessed?: boolean;
  status?: string;
}

const FreeTrial = () => {
  const [activeTab, setActiveTab] = useState('upload');
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingStep, setProcessingStep] = useState('');
  const [currentDocument, setCurrentDocument] = useState<ProcessedDocument | null>(null);
  const [progress, setProgress] = useState(0);
  const [showQualityDialog, setShowQualityDialog] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [qualityReport, setQualityReport] = useState<any | null>(null);
  const [showRawMetadata, setShowRawMetadata] = useState(false);
  
  const webcamRef = useRef<Webcam>(null);
  const navigate = useNavigate();
  const { toast } = useToast();
  
  const hasFetchedRef = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const isMountedRef = useRef(true);

  const getDocumentText = (doc: any): string => {
    return doc?.extractedText || doc?.rawText || doc?.text || '';
  };

  const hasExtractedText = (doc: any): boolean => {
    const text = getDocumentText(doc);
    return text && text.length > 0 && text !== 'Text extraction in progress...';
  };

  // Helper: call metadata service directly (fixed response handling)
  const callMetadataService = async (text: string, docId: string): Promise<Metadata | null> => {
    try {
      const response = await api.post('/metadata/extract', {
        text: text,
        docId: docId
      });
      console.log('Metadata service raw response:', response.data);
      
      // Normalize: response might be { metadata: {...} } or directly the metadata object
      let metadata = response.data?.metadata || response.data;
      if (!metadata || typeof metadata !== 'object') return null;

      // Ensure expected structure (optional transformation)
      return {
        category: metadata.category || metadata.document_type,
        entities: metadata.entities || {},
        contact_info: metadata.contact_info || {},
        dates: metadata.dates || (metadata.date ? [metadata.date] : []),
        summary: metadata.summary,
        ...metadata  // keep any additional fields
      } as Metadata;
    } catch (error) {
      console.error('Metadata service call failed:', error);
      return null;
    }
  };

  useEffect(() => {
    if (hasFetchedRef.current) return;
    hasFetchedRef.current = true;

    const fetchRecentDocument = async () => {
      try {
        const controller = new AbortController();
        abortControllerRef.current = controller;
        const response = await api.get('/documents', { signal: controller.signal });
        const docs = response.data?.documents || response.data || [];
        if (docs.length > 0 && isMountedRef.current) {
          const latest = docs[0];
          setCurrentDocument({
            id: latest.documentId || latest.id,
            documentId: latest.documentId || latest.id,
            name: latest.name || latest.filename,
            text: getDocumentText(latest),
            metadata: latest.metadata,
            confidence: latest.confidence || 0,
            processingTime: 0,
            size: latest.size ? `${(latest.size / 1024).toFixed(2)} KB` : 'N/A',
            type: latest.type?.split('/')[1]?.toUpperCase() || 'DOCUMENT',
            status: latest.status,
          });
        }
      } catch (error: any) {
        if (error.name !== 'AbortError' && isMountedRef.current) {
          console.error('Failed to fetch recent document:', error);
        }
      }
    };

    fetchRecentDocument();

    return () => {
      isMountedRef.current = false;
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  const processFile = async (file: File, forceProcess: boolean = false) => {
    if (!isMountedRef.current) return;
    setIsProcessing(true);
    setProcessingStep('uploading');
    setProgress(0);

    const startTime = performance.now();

    try {
      const formData = new FormData();
      formData.append('file', file);
      
      setProcessingStep('uploading');
      setProgress(20);
      
      const response = await api.post('/documents/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: (progressEvent) => {
          if (progressEvent.total) {
            const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
            setProgress(20 + (percentCompleted * 0.2));
          }
        },
      });
      
      console.log('Upload response:', response.data);
      
      let documentId = response.data?.documentId || response.data?.id;
      
      if (!documentId) {
        const docsResponse = await api.get('/documents');
        const docs = docsResponse.data?.documents || docsResponse.data || [];
        const found = docs.find((d: any) => d.name === file.name);
        documentId = found?.documentId || found?.id;
      }
      
      if (!documentId) {
        throw new Error('Could not get document ID');
      }
      
      setProcessingStep('ocr_processing');
      setProgress(50);
      
      let ocrCompleted = false;
      let attempts = 0;
      const maxAttempts = 40;
      
      while (!ocrCompleted && attempts < maxAttempts && isMountedRef.current) {
        await new Promise(resolve => setTimeout(resolve, 2000));
        attempts++;
        setProgress(50 + Math.min(attempts, 40));
        
        try {
          const docResponse = await api.get(`/documents/${documentId}`);
          const completedDoc = docResponse.data;
          
          if (hasExtractedText(completedDoc)) {
            ocrCompleted = true;
          }
          if (completedDoc?.status === 'processed' && hasExtractedText(completedDoc)) {
            ocrCompleted = true;
          }
        } catch (e) {
          console.log(`Attempt ${attempts} failed:`, e);
        }
      }
      
      if (!isMountedRef.current) return;
      
      const finalResponse = await api.get(`/documents/${documentId}`);
      const finalDoc = finalResponse.data;
      const rawText = getDocumentText(finalDoc);
      
      // --- Explicit metadata extraction from metadata service ---
      let metadata = finalDoc?.metadata;
      if (rawText && rawText.length > 0) {
        const explicitMetadata = await callMetadataService(rawText, documentId);
        if (explicitMetadata) {
          metadata = explicitMetadata;
          // Optional: persist metadata back to document service
          try {
            await api.put(`/documents/${documentId}/metadata`, { metadata: explicitMetadata });
          } catch (err) {
            console.warn('Could not update document metadata on backend', err);
          }
        }
      }
      console.log('Final metadata to display:', metadata);
      
      setProcessingStep('complete');
      setProgress(100);
      
      const endTime = performance.now();
      const duration = (endTime - startTime) / 1000;
      
      const newDoc: ProcessedDocument = {
        id: documentId,
        documentId: documentId,
        name: file.name,
        text: rawText || (ocrCompleted ? 'Text extracted but not loaded. Click refresh.' : 'Still processing...'),
        metadata: metadata,
        confidence: finalDoc?.confidence || 0,
        processingTime: duration,
        size: ((file.size / 1024).toFixed(2) + ' KB'),
        type: file.type.split('/')[1]?.toUpperCase() || 'DOCUMENT',
        forceProcessed: forceProcess,
        status: finalDoc?.status,
      };

      setCurrentDocument(newDoc);
      setShowRawMetadata(false); // reset raw view on new doc
      
      toast({
        title: /[\u0600-\u06FF]/.test(rawText) ? "The Text is Extracted !" : "Processing Complete",
        description: `Extracted ${rawText.length} characters`,
      });

    } catch (error: any) {
      if (!isMountedRef.current) return;
      console.error('Processing error:', error);
      toast({
        title: "Error",
        description: error.response?.data?.message || "Failed to process document",
        variant: "destructive",
      });
    } finally {
      if (isMountedRef.current) {
        setIsProcessing(false);
        setProcessingStep('');
        setProgress(0);
      }
    }
  };

  const handleRetryWithForce = () => {
    if (pendingFile) {
      setShowQualityDialog(false);
      processFile(pendingFile, true);
      setPendingFile(null);
      setQualityReport(null);
    }
  };

  const handleCancelUpload = () => {
    setShowQualityDialog(false);
    setPendingFile(null);
    setQualityReport(null);
    toast({
      title: "Upload Cancelled",
      description: "You can try uploading a clearer document.",
    });
  };

  const refreshDocument = async () => {
    if (!currentDocument || !isMountedRef.current) return;
    try {
      const response = await api.get(`/documents/${currentDocument.id}`);
      const freshDoc = response.data;
      const freshText = getDocumentText(freshDoc);
      
      setCurrentDocument(prev => prev ? {
        ...prev,
        text: freshText || prev.text,
        metadata: freshDoc?.metadata || prev.metadata,
        confidence: freshDoc?.confidence || prev.confidence,
        status: freshDoc?.status
      } : null);
      
      if (freshText && freshText.length > 0) {
        toast({
          title: "Document Refreshed",
          description: `Text extracted: ${freshText.substring(0, 60)}...`,
        });
      } else {
        toast({
          title: "Still Processing",
          description: "OCR is still processing. Try again in a few seconds.",
        });
      }
    } catch (error) {
      console.error('Failed to refresh document:', error);
      toast({
        title: "Refresh Failed",
        description: "Could not fetch document",
        variant: "destructive",
      });
    }
  };

  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0 && isMountedRef.current) {
      processFile(acceptedFiles[0], false);
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'image/*': ['.png', '.jpg', '.jpeg'],
      'application/pdf': ['.pdf'],
    },
    maxFiles: 1,
  });

  const QualityWarningDialog = () => {
    if (!showQualityDialog || !qualityReport) return null;
    
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
        <Card className="max-w-md w-full">
          <CardHeader className="bg-yellow-50 dark:bg-yellow-950/20">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-yellow-600" />
              <CardTitle>Low Quality Document Detected</CardTitle>
            </div>
            <CardDescription>
              We detected potential issues with your document
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-6 space-y-4">
            {qualityReport.message && (
              <div className="space-y-2">
                <h4 className="font-medium">Issues Found:</h4>
                <p className="text-sm text-muted-foreground">{qualityReport.message}</p>
              </div>
            )}
            
            <div className="space-y-2">
              <h4 className="font-medium">Suggestions:</h4>
              <ul className="list-disc list-inside text-sm text-muted-foreground">
                <li> Try using a clearer image with better lighting</li>
                <li> Ensure text is not blurry or skewed</li>
                <li> Make sure the document contains visible text</li>
              </ul>
            </div>
            
            <div className="flex gap-3 pt-4">
              <Button variant="outline" onClick={handleCancelUpload} className="flex-1">
                Cancel / Try Again
              </Button>
              <Button onClick={handleRetryWithForce} className="flex-1 gap-2">
                <RefreshCw className="h-4 w-4" />
                Process Anyway
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  };

  // Fixed metadata renderer with raw toggle
  const renderMetadataFields = (metadata: Metadata | undefined) => {
    if (!metadata) return <p className="text-muted-foreground text-sm">No metadata extracted.</p>;

    const hasStructured = !!(metadata.category ||
      (metadata.entities?.people?.length) ||
      (metadata.entities?.organizations?.length) ||
      (metadata.entities?.places?.length) ||
      (metadata.contact_info?.emails?.length) ||
      (metadata.contact_info?.phones?.length) ||
      (metadata.dates?.length));

    if (!hasStructured && !showRawMetadata) {
      return (
        <div className="space-y-3">
          <p className="text-muted-foreground text-sm">
            No structured metadata could be parsed, but raw data is available.
          </p>
          <Button variant="outline" size="sm" onClick={() => setShowRawMetadata(true)}>
            View Raw Metadata
          </Button>
        </div>
      );
    }

    if (showRawMetadata) {
      return (
        <div className="space-y-3">
          <Button variant="outline" size="sm" onClick={() => setShowRawMetadata(false)}>
            Back to Structured View
          </Button>
          <pre className="text-xs bg-muted p-3 rounded overflow-auto max-h-96 border">
            {JSON.stringify(metadata, null, 2)}
          </pre>
        </div>
      );
    }

    // --- Structured rendering (original, but improved) ---
    const category = metadata.category || metadata.document_type;
    const entities = metadata.entities;
    const contactInfo = metadata.contact_info;
    const dates = metadata.dates || (metadata.date ? [metadata.date] : []);
    const keywords = metadata.keywords;
    const languages = metadata.languages;

    return (
      <div className="space-y-6">
        {/* Category / Document Type */}
        {category && (
          <div className="flex items-center gap-2 p-2 rounded-lg bg-primary/10">
            <Tag className="h-4 w-4 text-primary" />
            <div>
              <p className="text-xs text-muted-foreground">Document Category</p>
              <p className="text-sm font-medium">{category}</p>
            </div>
          </div>
        )}

        {/* Entities */}
        {entities && (
          <div className="space-y-3">
            {entities.people && entities.people.length > 0 && (
              <div className="flex flex-wrap gap-2">
                <div className="flex items-center gap-1 w-full">
                  <User className="h-4 w-4 text-primary" />
                  <span className="text-xs font-semibold">People:</span>
                </div>
                <div className="flex flex-wrap gap-1">
                  {entities.people.map((p, i) => (
                    <Badge key={i} variant="secondary">{p}</Badge>
                  ))}
                </div>
              </div>
            )}
            {entities.organizations && entities.organizations.length > 0 && (
              <div className="flex flex-wrap gap-2">
                <div className="flex items-center gap-1 w-full">
                  <Building className="h-4 w-4 text-primary" />
                  <span className="text-xs font-semibold">Organizations:</span>
                </div>
                <div className="flex flex-wrap gap-1">
                  {entities.organizations.map((o, i) => (
                    <Badge key={i} variant="secondary">{o}</Badge>
                  ))}
                </div>
              </div>
            )}
            {entities.places && entities.places.length > 0 && (
              <div className="flex flex-wrap gap-2">
                <div className="flex items-center gap-1 w-full">
                  <MapPin className="h-4 w-4 text-primary" />
                  <span className="text-xs font-semibold">Places:</span>
                </div>
                <div className="flex flex-wrap gap-1">
                  {entities.places.map((pl, i) => (
                    <Badge key={i} variant="secondary">{pl}</Badge>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Contact Info */}
        {contactInfo && (
          <div className="space-y-3">
            {contactInfo.emails && contactInfo.emails.length > 0 && (
              <div className="flex flex-wrap gap-2">
                <div className="flex items-center gap-1 w-full">
                  <Mail className="h-4 w-4 text-primary" />
                  <span className="text-xs font-semibold">Emails:</span>
                </div>
                <div className="flex flex-wrap gap-1">
                  {contactInfo.emails.map((e, i) => (
                    <Badge key={i} variant="outline">{e}</Badge>
                  ))}
                </div>
              </div>
            )}
            {contactInfo.phones && contactInfo.phones.length > 0 && (
              <div className="flex flex-wrap gap-2">
                <div className="flex items-center gap-1 w-full">
                  <Phone className="h-4 w-4 text-primary" />
                  <span className="text-xs font-semibold">Phones:</span>
                </div>
                <div className="flex flex-wrap gap-1">
                  {contactInfo.phones.map((p, i) => (
                    <Badge key={i} variant="outline">{p}</Badge>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Dates */}
        {dates.length > 0 && (
          <div className="flex flex-wrap gap-2">
            <div className="flex items-center gap-1 w-full">
              <Calendar className="h-4 w-4 text-primary" />
              <span className="text-xs font-semibold">Dates:</span>
            </div>
            <div className="flex flex-wrap gap-1">
              {dates.map((d, i) => (
                <Badge key={i} variant="outline">{d}</Badge>
              ))}
            </div>
          </div>
        )}

        {/* Keywords */}
        {keywords && keywords.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-sm font-semibold flex items-center gap-2">
              <Tag className="h-4 w-4" /> Keywords
            </h4>
            <div className="flex flex-wrap gap-1">
              {keywords.map((kw, i) => (
                <Badge key={i} variant="secondary">{kw}</Badge>
              ))}
            </div>
          </div>
        )}

        {/* Languages */}
        {languages && languages.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-sm font-semibold flex items-center gap-2">
              <Globe className="h-4 w-4" /> Languages
            </h4>
            <div className="flex flex-wrap gap-1">
              {languages.map((lang, i) => (
                <Badge key={i} variant="outline">{lang}</Badge>
              ))}
            </div>
          </div>
        )}

        {/* Flat fields (legacy) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {Object.entries(metadata).map(([key, value]) => {
            if (value === undefined || value === null || value === '') return null;
            // Skip fields already displayed
            if (['category', 'document_type', 'entities', 'contact_info', 'dates', 'keywords', 'languages', 'custom_fields', 'summary'].includes(key)) return null;
            if (typeof value === 'object') return null;
            return (
              <div key={key} className="flex items-start gap-2 p-2 rounded-lg bg-secondary/20">
                <FileText className="h-4 w-4 text-primary mt-0.5" />
                <div>
                  <p className="text-xs text-muted-foreground">{key.replace(/_/g, ' ')}</p>
                  <p className="text-sm font-medium">{String(value)}</p>
                </div>
              </div>
            );
          })}
        </div>

        {/* Custom fields */}
        {metadata.custom_fields && Object.keys(metadata.custom_fields).length > 0 && (
          <div>
            <h4 className="text-sm font-semibold mb-2">Custom Fields</h4>
            <div className="bg-muted/50 rounded-lg p-3 text-sm">
              <pre className="text-xs whitespace-pre-wrap">
                {JSON.stringify(metadata.custom_fields, null, 2)}
              </pre>
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <QualityWarningDialog />
      
      <div className="max-w-6xl mx-auto space-y-8">
        
        <div className="flex items-center justify-between">
          <Button variant="ghost" onClick={() => navigate('/')} className="gap-2">
            <ArrowLeft className="h-4 w-4" /> Back to Home
          </Button>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-primary border-primary">Free Trial Mode</Badge>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          
          {/* Left Column: Upload */}
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Upload Document</CardTitle>
                <CardDescription>Digitize your documents in seconds</CardDescription>
              </CardHeader>
              <CardContent>
                <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                  <TabsList className="grid w-full grid-cols-2 mb-4">
                    <TabsTrigger value="upload">File Upload</TabsTrigger>
                    <TabsTrigger value="camera">Camera</TabsTrigger>
                  </TabsList>

                  <TabsContent value="upload">
                    <div
                      {...getRootProps()}
                      className={`
                        border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors
                        ${isDragActive ? 'border-primary bg-primary/5' : 'border-muted-foreground/25 hover:border-primary/50'}
                      `}
                    >
                      <input {...getInputProps()} />
                      <div className="flex flex-col items-center gap-4">
                        <div className="h-16 w-16 rounded-full bg-secondary flex items-center justify-center">
                          <Upload className="h-8 w-8 text-primary" />
                        </div>
                        <div>
                          <p className="font-medium">Click to upload or drag and drop</p>
                          <p className="text-sm text-muted-foreground">PDF, PNG, JPG up to 10MB</p>
                          <p className="text-xs text-muted-foreground mt-2">Supports Arabic, French, and English text</p>
                        </div>
                      </div>
                    </div>
                  </TabsContent>

                  <TabsContent value="camera">
                    <div className="relative rounded-xl overflow-hidden bg-black aspect-video mb-4">
                      <Webcam
                        ref={webcamRef}
                        screenshotFormat="image/jpeg"
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <Button className="w-full" onClick={() => {
                      const imageSrc = webcamRef.current?.getScreenshot();
                      if (imageSrc) {
                        fetch(imageSrc)
                          .then(res => res.blob())
                          .then(blob => {
                            const file = new File([blob], "camera-capture.jpg", { type: "image/jpeg" });
                            processFile(file, false);
                          });
                      }
                    }}>
                      <Camera className="mr-2 h-4 w-4" /> Capture & Process
                    </Button>
                  </TabsContent>
                </Tabs>

                {isProcessing && (
                  <div className="mt-6 space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">
                        {processingStep === 'uploading' ? ' Uploading...' : 
                         processingStep === 'ocr_processing' ? '  OCR in progress...' : 
                         ' Finalizing...'}
                      </span>
                      <span className="font-medium">{progress}%</span>
                    </div>
                    <Progress value={progress} className="h-2" />
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Right Column: Single Document Results */}
          <div className="space-y-6">
            {currentDocument ? (
              <Card className="overflow-hidden border-l-4 border-l-primary">
                <CardHeader className="bg-secondary/20 pb-4">
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <CardTitle className="text-lg">{currentDocument.name}</CardTitle>
                        {currentDocument.metadata?.category && (
                          <Badge className="bg-primary">{currentDocument.metadata.category}</Badge>
                        )}
                        {currentDocument.forceProcessed && (
                          <Badge variant="outline" className="border-yellow-500 text-yellow-600">
                            Forced
                          </Badge>
                        )}
                        {currentDocument.status === 'processed' && hasExtractedText({ extractedText: currentDocument.text }) && (
                          <Badge variant="outline" className="text-green-600 border-green-600">
                            OCR Complete
                          </Badge>
                        )}
                      </div>
                      <CardDescription className="flex items-center gap-4">
                        <span className="flex items-center gap-1">
                          <CheckCircle className="h-3 w-3 text-success" />
                          {currentDocument.type}
                        </span>
                        <span className="flex items-center gap-1">
                          <Loader2 className="h-3 w-3" />
                          {currentDocument.processingTime.toFixed(1)}s
                        </span>
                      </CardDescription>
                    </div>
                    <Button 
                      variant="outline" 
                      size="icon"
                      onClick={refreshDocument}
                      title="Refresh document"
                    >
                      <RefreshCw className="h-4 w-4" />
                    </Button>
                  </div>
                </CardHeader>
                
                <CardContent className="pt-6 space-y-6">
                  <div>
                    <h3 className="text-md font-semibold mb-3 flex items-center gap-2">
                      <Tag className="h-4 w-4 text-primary" /> Extracted Information
                    </h3>
                    {renderMetadataFields(currentDocument.metadata)}
                  </div>

                  <Separator />

                  <div>
                    <h3 className="font-medium mb-2 flex items-center gap-2">
                      <FileText className="h-4 w-4" /> Extracted Text
                      {/[\u0600-\u06FF]/.test(currentDocument.text) && (
                        <Badge variant="outline" className="text-green-600 border-green-600 text-xs">
                          Arabic Detected
                        </Badge>
                      )}
                    </h3>
                    <div className="bg-muted/50 rounded-lg p-3 max-h-60 overflow-y-auto border" dir="auto">
                      <pre className="text-sm whitespace-pre-wrap font-sans" style={{ fontFamily: "'Segoe UI', 'Traditional Arabic', 'Tahoma', sans-serif" }}>
                        {currentDocument.text && currentDocument.text.length > 0 && currentDocument.text !== 'Text extraction in progress...' 
                          ? currentDocument.text 
                          : 'Click the refresh button to load extracted text'}
                      </pre>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-center p-8 border-2 border-dashed rounded-xl border-muted-foreground/20">
                <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center mb-4">
                  <FileText className="h-6 w-6 text-muted-foreground" />
                </div>
                <h3 className="font-semibold text-lg">No document processed yet</h3>
                <p className="text-muted-foreground max-w-sm">
                  Upload a document or take a photo to see the AI extraction in action.
                </p>
                <p className="text-xs text-muted-foreground mt-2">
                  Supports Arabic, French, and English text extraction
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default FreeTrial;