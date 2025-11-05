const express = require('express');
const cors = require('cors');
const OpenAI = require('openai');
const multer = require('multer');
const mammoth = require('mammoth');
const pdfParse = require('pdf-parse');

const app = express();

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    baseURL: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1'
});

app.use(express.json({ limit: '10mb' }));
app.use(cors({ origin: 'http://localhost:3000' }));

const upload = multer({ storage: multer.memoryStorage() });

app.get('/health', (req, res) => res.json({ status: 'ok' }));

// Helper: extract text from buffer
async function extractText(buffer, mimetype) {
    if (mimetype === 'application/pdf') {
        const data = await pdfParse(buffer);
        return data.text;
    } else if (mimetype.includes('word') || mimetype.includes('document')) {
        const result = await mammoth.extractRawText({ buffer });
        return result.value;
    } else if (mimetype === 'text/plain') {
        return buffer.toString('utf-8');
    }
    throw new Error('Unsupported file type');
}

app.post('/analyze', upload.single('cv'), async (req, res) => {
    try {
        console.log('=== ANALYZE REQUEST ===');
        console.log('File:', req.file ? req.file.originalname : 'NO FILE');
        console.log('Mimetype:', req.file?.mimetype);
        console.log('Job Description length:', req.body.jobDescription?.length || 0);

        const { jobDescription } = req.body;
        if (!req.file || !jobDescription) {
            console.log('Missing file or job description');
            return res.status(400).json({ error: 'CV file and job description required' });
        }

        console.log('Extracting text from:', req.file.mimetype);
        const cvText = await extractText(req.file.buffer, req.file.mimetype);
        console.log('CV text extracted, length:', cvText.length);

        console.log('Calling OpenAI embeddings...');
        const embeddingResp = await openai.embeddings.create({
            model: 'text-embedding-3-small',
            input: [cvText, jobDescription]
        });
        console.log('Embeddings received');

        const [cvEmbed, jobEmbed] = embeddingResp.data.map(d => d.embedding);
        const dot = cvEmbed.reduce((s, v, i) => s + v * jobEmbed[i], 0);
        const magA = Math.sqrt(cvEmbed.reduce((s, v) => s + v * v, 0));
        const magB = Math.sqrt(jobEmbed.reduce((s, v) => s + v * v, 0));
        const similarity = magA && magB ? dot / (magA * magB) : 0;
        const matchScore = Math.round(similarity * 100);

        console.log('Match score calculated:', matchScore);
        console.log('Calling GPT for detailed analysis...');

        const prompt = `You are an expert ATS (Applicant Tracking System) analyzer. 

Analyze the CV against the job description below and provide:

1. **Important Keywords**: Extract 15-20 most critical keywords/phrases from the job description (technical skills, tools, qualifications, industry terms). For each keyword, indicate if it appears in the CV (matched) or is missing.

2. **Skills Analysis**: Identify key technical and soft skills mentioned in the job description. Categorize them as:
   - Matched (present in CV)
   - Partially matched (similar/related terms in CV)
   - Missing (not found in CV)

3. **Experience Match**: Compare years of experience, job titles, responsibilities mentioned in JD vs CV. Return a score 0-100.

4. **Actionable Recommendations**: Provide 5-8 specific, actionable suggestions to improve CV match (e.g., "Add 'Python' to Skills section", "Quantify achievements with metrics", "Include 'Agile/Scrum' experience").

Return ONLY a valid JSON object with this structure:
{
  "keywords": [
    {"term": "keyword1", "matched": true},
    {"term": "keyword2", "matched": false}
  ],
  "skills": {
    "matched": ["skill1", "skill2"],
    "partial": ["skill3"],
    "missing": ["skill4", "skill5"]
  },
  "experienceScore": 75,
  "recommendations": ["recommendation1", "recommendation2"]
}

**Job Description:**
${jobDescription}

**CV:**
${cvText}

Return only valid JSON, no markdown or explanations.`;

        const completion = await openai.chat.completions.create({
            model: "mistralai/mistral-7b-instruct:free",
            messages: [{ role: "user", content: prompt }],
            response_format: { type: "json_object" },
            temperature: 0.3
        });

        console.log('GPT analysis received');
        const analysis = JSON.parse(completion.choices[0].message.content);

        res.json({
            matchScore,
            keywords: analysis.keywords || [],
            skills: analysis.skills || { matched: [], partial: [], missing: [] },
            experienceScore: analysis.experienceScore || 0,
            recommendations: analysis.recommendations || []
        });

        console.log('=== ANALYSIS COMPLETE ===');
    } catch (err) {
        console.error('=== ERROR IN ANALYZE ===');
        console.error(err);
        res.status(500).json({ error: String(err.message || err) });
    }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, '0.0.0.0', () => console.log(`Backend running on ${PORT}`));