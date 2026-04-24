# Personal ATS (Applicant Tracking System)

A modern AI-powered resume analyzer that helps job seekers optimize their CVs to match job descriptions using advanced NLP and machine learning techniques.

![Version](https://img.shields.io/badge/version-1.0.0-blue.svg)
![License](https://img.shields.io/badge/license-MIT-green.svg)

## 🎯 Overview

Personal ATS analyzes your resume against a job description and provides:
- **Match Score**: Overall compatibility percentage
- **Skills Analysis**: Matched, partial, and missing hard/soft skills
- **ATS Compliance Checks**: Contact info, sections, dates, file format
- **Recruiter Tips**: Actionable recommendations to improve your resume
- **Education Match**: Verifies education level requirements
- **Keyword Analysis**: Identifies job-specific terms from the JD

## 🚀 Features

### Core Functionality
- **Multi-format Support**: PDF, DOCX, TXT
- **AI-Powered Analysis**: Uses OpenAI/OpenRouter for semantic understanding
- **Semantic Similarity**: Embeddings-based CV-JD matching
- **Custom PDF Parser**: Fixes orphaned section headers (e.g., "EXPERIENCE")
- **Education Level Detection**: Matches PhD, Master's, Bachelor's, etc.
- **Quantifiable Achievements Detection**: Identifies metrics and dates
- **Export Results**: Download analysis as PDF report

### Advanced Parsing
- **PDF Text Reconstruction**: Groups text by Y-coordinates, handles multi-column layouts
- **DOCX Extraction**: Uses Mammoth.js for clean text extraction
- **Text Normalization**: Removes zero-width characters, fixes hyphenation, standardizes punctuation
- **Section Detection**: Identifies SUMMARY, SKILLS, WORK EXPERIENCE, EDUCATION, etc.

### ATS Checks
✅ Contact Information (Email, Phone, LinkedIn)  
✅ Job Title Match  
✅ Required Sections (Summary, Skills, Experience, Education)  
✅ Date Consistency (Month-Year or Year-Range format)  
✅ File Format Compliance  
✅ Education Level Match  

### Scoring Algorithm
```javascript
matchScore = 
  32% Hard Skills (Keywords) +
  20% Hard Skills Coverage +
  18% Soft Skills +
  12% Embedding Similarity +
  6%  Job Level Match (Years of Experience) +
  5%  Measurable Results +
  3%  Word Count +
  2%  Web Presence +
  1%  Job Title Match +
  1%  Education Match
```

## 🏗️ Architecture

### Tech Stack

#### Frontend
- **React 18** with TypeScript
- **Vite** for build tooling
- **Tailwind CSS v4** with `@tailwindcss/vite`
- **Axios** for API calls
- **Recharts** for data visualization
- **jsPDF** for PDF export
- **file-saver** for download functionality

#### Backend (Serverless)
- **Vercel Serverless Functions** (Node.js 20)
- **formidable** for multipart form parsing
- **mammoth** for DOCX extraction
- **pdf-parse** for PDF extraction
- **OpenAI SDK** (compatible with OpenRouter)

#### AI/ML
- **OpenAI API** via OpenRouter
- **Model**: `mistralai/mistral-7b-instruct:free`
- **Embeddings**: `text-embedding-3-small`
- **JSON Mode**: Structured output for consistent parsing

### Project Structure
```
personal-ats/
├── api/
│   ├── analyze.js          # Serverless function (main logic)
│   ├── package.json        # Backend dependencies
│   └── server.js           # Express wrapper (for Docker dev)
├── src/
│   ├── App.tsx             # Main React component
│   ├── components/
│   │   ├── ScorePieRecharts.tsx
│   │   └── ...
│   ├── index.css           # Tailwind imports
│   └── main.tsx
├── public/                 # Static assets
├── package.json            # Frontend dependencies
├── vite.config.ts          # Vite configuration
├── vercel.json             # Vercel deployment config
├── tsconfig.json           # TypeScript config
└── README.md
```

## 📋 Prerequisites

- **Node.js** >= 18.x
- **npm** or **yarn**
- **OpenAI/OpenRouter API Key**

## 🛠️ Installation

### 1. Clone Repository
```bash
git clone https://github.com/your-username/personal-ats.git
cd personal-ats
```

### 2. Install Frontend Dependencies
```bash
npm install
```

### 3. Install Backend Dependencies
```bash
cd api
npm install
cd ..
```

### 4. Set Environment Variables

Create `.env.local` in root:
```env
OPENAI_API_KEY=your_openai_or_openrouter_key
OPENAI_BASE_URL=https://openrouter.ai/api/v1
```

## 🚀 Development

### Local Development with Vercel Dev
```bash
npm install -g vercel
vercel dev
```
Access at `http://localhost:3000`

### Local Development with Docker (Optional)
```bash
docker-compose up
```
- Frontend: `http://localhost:3000`
- Backend: `http://localhost:5000`

### Build for Production
```bash
npm run build
```

## 🌐 Deployment (Vercel)

### Automatic Deployment (GitHub Integration)
1. Push code to GitHub
2. Connect repository to Vercel
3. Set Environment Variables in Vercel Dashboard:
   - `OPENAI_API_KEY`
   - `OPENAI_BASE_URL`
   - `OPENAI_MODEL`
4. Deploy automatically on push

### Manual Deployment
```bash
vercel --prod
```

### Vercel Configuration (`vercel.json`)
```json
{
  "version": 2,
  "functions": {
    "api/analyze.js": {
      "memory": 1024,
      "maxDuration": 30
    }
  },
  "rewrites": [
    {
      "source": "/api/:path*",
      "destination": "/api/:path*"
    }
  ]
}
```

## 🔧 API Reference

### POST `/api/analyze`

**Request:**
- Method: `POST`
- Content-Type: `multipart/form-data`
- Body:
  - `cv`: File (PDF/DOCX/TXT, max 10MB)
  - `jobDescription`: String (job posting text)

**Response:**
```json
{
  "matchScore": 85,
  "keywords": [
    { "term": "React", "matched": true },
    { "term": "TypeScript", "matched": true }
  ],
  "hardSkills": {
    "matched": ["React", "TypeScript", "Git"],
    "partial": ["Node.js"],
    "missing": ["Docker"],
    "extras": ["Figma", "Webpack"]
  },
  "softSkills": {
    "matched": ["Communication", "Teamwork"],
    "partial": ["Leadership"],
    "missing": ["Public Speaking"]
  },
  "experienceScore": 75,
  "recommendations": [
    "Add Docker to your skills section",
    "Quantify your achievements with metrics"
  ],
  "checks": {
    "contact": { "email": true, "phone": true, "linkedin": true },
    "jobTitleMatch": true,
    "sections": {
      "summary": true,
      "skills": true,
      "education": true,
      "workExperience": true,
      "projects": false
    },
    "dates": { "found": true, "looksConsistent": true },
    "file": { "type": "application/pdf", "allowed": true },
    "educationMatch": {
      "presentInCV": true,
      "presentInJD": true,
      "levelInCV": "bachelor",
      "levelInJD": "bachelor",
      "match": true,
      "message": "The Degree is an exact match"
    }
  },
  "recruiterTips": {
    "jobLevelMatch": {
      "match": true,
      "message": "Your years of experience align with requirements"
    },
    "measurableResults": {
      "present": true,
      "message": "Resume includes measurable impact"
    },
    "wordCount": {
      "count": 850,
      "message": "Word count: 850"
    },
    "webPresence": {
      "present": true,
      "message": "Web presence included"
    }
  },
  "cleanedCvText": "Full normalized CV text..."
}
```

## 🧠 How It Works

### 1. File Upload & Parsing
```javascript
// User uploads CV (PDF/DOCX/TXT)
const buffer = await fs.readFile(cvFile.filepath);
const mimetype = inferFileType(cvFile, buffer);

// Extract text based on file type
if (mimetype === 'application/pdf') {
    const data = await pdfParse(buffer, { pagerender: pdfPageRender });
    return data.text;
} else if (mimetype.includes('word')) {
    const result = await mammoth.extractRawText({ buffer });
    return result.value;
}
```

### 2. Text Normalization
```javascript
// Remove zero-width characters, fix hyphenation, standardize punctuation
const cvText = normalizeForPrompt(cvTextRaw);

// Example transformations:
// "React-\nive" → "Reactive"
// "Email  :  john@example.com" → "Email: john@example.com"
// "• Bullet point" → "- Bullet point"
```

### 3. Education Level Detection
```javascript
const EDU_LEVELS = [
    { key: 'phd', rank: 5, rx: /\b(ph\.?\s*d\.?|doctorate)\b/i },
    { key: 'master', rank: 4, rx: /\b(master['']?s|mba)\b/i },
    { key: 'bachelor', rank: 3, rx: /\b(bachelor['']?s|licen[țt]a)\b/i },
    { key: 'associate', rank: 2, rx: /\b(associate['']?s)\b/i },
    { key: 'highschool', rank: 1, rx: /\b(high\s*school)\b/i }
];

// Match education level in CV vs JD
const cvLvl = detectEducationLevel(cvText);
const jdLvl = detectEducationLevel(jobDescription);
const match = cvLvl.rank >= jdLvl.rank;
```

### 4. Semantic Similarity (Embeddings)
```javascript
// Generate embeddings for CV and JD
const embeddingResp = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: [cvText, jobDescription]
});

// Calculate cosine similarity
const [cvEmbed, jobEmbed] = embeddingResp.data.map(d => d.embedding);
const dot = cvEmbed.reduce((s, v, i) => s + v * jobEmbed[i], 0);
const similarity = dot / (Math.sqrt(cvMag) * Math.sqrt(jobMag));
const embeddingScore = Math.round(similarity * 100);
```

### 5. AI Analysis (OpenAI Chat)
```javascript
const prompt = `You are an expert ATS analyzer. Return ONLY valid JSON:
{
  "keywords": [{"term":"React","matched":true}],
  "hardSkills": {"matched":[],"partial":[],"missing":[],"extras":[]},
  "softSkills": {"matched":[],"partial":[],"missing":[]},
  "experienceScore": 75,
  "recommendations": ["Add Docker to skills"]
}

Instructions:
- Extract ALL technical skills from JD and CV
- Search case-insensitively (e.g., "front-end" matches "frontend")
- "matched": JD skills present in CV
- "partial": JD skills where CV has similar tech
- "missing": JD skills absent in CV
- "extras": CV skills NOT in JD

Job Description:
${jobDescription}

CV:
${cvText}`;

const completion = await openai.chat.completions.create({
    model: "mistralai/mistral-7b-instruct:free",
    messages: [{ role: "user", content: prompt }],
    response_format: { type: "json_object" },
    temperature: 0.3
});

const analysis = JSON.parse(completion.choices[0].message.content);
```

### 6. Score Calculation
```javascript
const WEIGHTS = {
    hardSkillsKeywords: 0.32,  // Most important
    hardSkillsCoverage: 0.20,
    soft: 0.18,
    emb: 0.12,
    jobLevel: 0.06,
    measurable: 0.05,
    wordCount: 0.03,
    webPresence: 0.02,
    title: 0.01,
    edu: 0.01
};

const matchScore = Math.round(
    WEIGHTS.hardSkillsKeywords * keywordCoverage +
    WEIGHTS.hardSkillsCoverage * skillCoverage +
    WEIGHTS.soft * softSkillCoverage +
    WEIGHTS.emb * embeddingScore +
    WEIGHTS.jobLevel * jobLevelScore +
    WEIGHTS.measurable * measurableScore +
    WEIGHTS.wordCount * wordCountScore +
    WEIGHTS.webPresence * webPresenceScore +
    WEIGHTS.title * titleScore +
    WEIGHTS.edu * eduScore
);
```

## 🎨 UI Components

### Main App (`src/App.tsx`)
- File upload (drag & drop or click)
- Job description textarea
- "Scan Resume" button
- Results display:
  - Match score with pie chart
  - Hard skills (matched/partial/missing/extras)
  - Soft skills (matched/partial/missing)
  - ATS checks table
  - Recruiter tips
  - Export to PDF button

### Score Visualization (`src/components/ScorePieRecharts.tsx`)
```tsx
<PieChart>
  <Pie data={[
    { name: 'Match', value: matchScore },
    { name: 'Gap', value: 100 - matchScore }
  ]} />
</PieChart>
```

## 🔒 Security & Limits

- **File Size Limit**: 10MB per CV
- **Timeout**: 30s max execution (Vercel)
- **CORS**: Enabled for all origins (adjust for production)
- **API Key**: Store in environment variables only
- **No Data Persistence**: Files deleted after processing

## 🐛 Common Issues

### 1. **500 Error on `/api/analyze`**
**Cause**: Missing environment variables or formidable import issue  
**Fix**: 
```bash
# Check Vercel Dashboard → Settings → Environment Variables
# Ensure formidable is imported correctly:
const { formidable } = require('formidable'); // v3
```

### 2. **"Cannot find module 'X'"**
**Cause**: Missing dependencies  
**Fix**:
```bash
npm install X
cd api && npm install X
```

### 3. **Build fails with Tailwind error**
**Cause**: Mixed Tailwind v3 and v4  
**Fix**: Use only v4 with `@tailwindcss/vite`

### 4. **CV text extraction is messy**
**Cause**: Complex PDF layout  
**Fix**: Use custom `pdfPageRender` function (already implemented)

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit changes (`git commit -m 'Add AmazingFeature'`)
4. Push to branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 📝 License

MIT License - see [LICENSE](LICENSE) file

## 🙏 Acknowledgments

- [OpenAI](https://openai.com) for GPT models
- [OpenRouter](https://openrouter.ai) for unified API access
- [pdf-parse](https://www.npmjs.com/package/pdf-parse) for PDF extraction
- [mammoth.js](https://www.npmjs.com/package/mammoth) for DOCX extraction
- [Vercel](https://vercel.com) for serverless hosting

## 📧 Contact

**Author**: Gheorghiciuc Georgia  
**Email**: gheorghiciucgeorgia@gmail.com  
**GitHub**: [@gheorghiciucgeorgia](https://github.com/gheorghiciucgeorgia)

---

**⭐ Star this repo if it helped you!**