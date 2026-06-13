// server/index.js
import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import nlp from 'nlp_compromise';

const app = express();
const PORT = 3001;

app.use(cors());
app.use(bodyParser.json());

// Helper function to extract specific data using Regex
const extractPatterns = (text) => {
  const emails = text.match(/([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9_-]+)/gi) || [];
  const phones = text.match(/[\+]?[(]?[0-9]{3}[)]?[-\s\.]?[0-9]{3}[-\s\.]?[0-9]{4,6}/g) || [];
  
  // Basic date extraction (covers DD/MM/YYYY, YYYY-MM-DD, etc.)
  const dates = text.match(/\d{1,4}[-/.]\d{1,2}[-/.]\d{1,4}/g) || [];

  return {
    emails: [...new Set(emails)], // Remove duplicates
    phones: [...new Set(phones)],
    dates: [...new Set(dates)],
  };
};

// Heuristic to guess document category based on keywords
const categorizeDocument = (text) => {
  const lowerText = text.toLowerCase();
  if (lowerText.includes('invoice') || lowerText.includes('total') || lowerText.includes('tax')) return 'Finance';
  if (lowerText.includes('contract') || lowerText.includes('agreement') || lowerText.includes('signed')) return 'Legal';
  if (lowerText.includes('resume') || lowerText.includes('experience') || lowerText.includes('education')) return 'HR';
  if (lowerText.includes('prescription') || lowerText.includes('patient') || lowerText.includes('diagnosis')) return 'Medical';
  return 'General';
};

app.post('/extract-metadata', (req, res) => {
  const { text } = req.body;

  if (!text) {
    return res.status(400).json({ error: 'No text provided' });
  }

  // 1. NLP Extraction for Names/Places/Organizations
  const doc = nlp.text(text);
  const people = doc.people().out('array');
  const places = doc.places().out('array');
  const orgs = doc.organizations().out('array');

  // 2. Regex Extraction for structured data
  const patterns = extractPatterns(text);

  // 3. Smart Categorization
  const category = categorizeDocument(text);

  const metadata = {
    category,
    entities: {
      people: [...new Set(people)],
      places: [...new Set(places)],
      organizations: [...new Set(orgs)]
    },
    contact_info: {
      emails: patterns.emails,
      phones: patterns.phones
    },
    dates: patterns.dates,
    summary: `This is a ${category} document mentioning ${people.length} people and ${orgs.length} organizations.`
  };

  // Simulate a slight delay to look like "AI processing"
  setTimeout(() => {
    res.json(metadata);
  }, 1000);
});

app.listen(PORT, () => {
  console.log(`Microservice running on http://localhost:${PORT}`);
});