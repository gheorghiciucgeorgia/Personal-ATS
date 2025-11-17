const multer = require('multer');
const mammoth = require('mammoth');
const pdfParse = require('pdf-parse');
const OpenAI = require('openai');

// === PASTE ALL HELPERS FROM server.js HERE ===
// (pdfPageRender, extractText, normalizeForPrompt, inferFileType, detectEducationLevel, educationMatchInfo)

async function pdfPageRender(pageData) {
    const textContent = await pageData.getTextContent({ normalizeWhitespace: true });
    const items = textContent.items.map(it => ({
        str: it.str,
        x: Array.isArray(it.transform) ? it.transform[4] : 0,
        y: Array.isArray(it.transform) ? it.transform[5] : 0
    }));
    const lineTol = 2.5;
    const lines = [];
    let current = [];
    let lastY = null;
    for (const it of items) {
        if (lastY === null || Math.abs(it.y - lastY) <= lineTol) {
            current.push(it.str);
        } else {
            if (current.length) lines.push(current.join(' '));
            current = [it.str];
        }
        lastY = it.y;
    }
    if (current.length) lines.push(current.join(' '));
    let text = lines.map(l => l.replace(/[ \t]{2,}/g, ' ').trim()).join('\n');
    text = text.replace(/([A-Za-z])-\s*\n\s*([A-Za-z])/g, '$1$2');
    const clean = s => (s || '').replace(/[\u200B-\u200D\uFEFF]/g, '').replace(/\s+/g, ' ').trim();
    const prevEnds = s => /[.!?:;)\]]\s*$/.test((s || '').trim());
    const startsLowerOrPunct = s => /^\s*([a-z]|[.,;:)\]-])/.test(s || '');
    const upperEq = (s, t) => clean(s).toUpperCase() === t;
    const isUpperOnly = s => /^[A-Z][A-Z\s\-&/]*$/.test(clean(s));
    let raw = text.split('\n');
    for (let i = 0; i < raw.length - 1; i++) {
        const l0 = clean(raw[i]);
        const l1 = clean(raw[i + 1] || '');
        if (upperEq(l0, 'WORK') && upperEq(l1, 'EXPERIENCE')) {
            raw[i] = 'WORK EXPERIENCE';
            raw[i + 1] = '';
        } else if (upperEq(l0, 'WORK') && !l1 && upperEq(clean(raw[i + 2] || ''), 'EXPERIENCE')) {
            raw[i] = 'WORK EXPERIENCE';
            raw[i + 2] = '';
        }
    }
    const TOKENS = new Set(['EXPERIENCE', 'PROFILE']);
    const findPrevIdx = (i) => { for (let k = i - 1; k >= 0; k--) if (clean(raw[k])) return k; return -1; };
    const findNextIdx = (i) => { for (let k = i + 1; k < raw.length; k++) if (clean(raw[k])) return k; return -1; };
    for (let i = 0; i < raw.length; i++) {
        const curTrim = clean(raw[i]);
        if (!curTrim || !isUpperOnly(curTrim)) continue;
        if (curTrim === 'WORK EXPERIENCE') continue;
        if (TOKENS.has(curTrim)) {
            const p = findPrevIdx(i);
            const n = findNextIdx(i);
            const prev = p >= 0 ? raw[p] : '';
            const next = n >= 0 ? raw[n] : '';
            if (p >= 0 && n >= 0 && !prevEnds(prev) && startsLowerOrPunct(next)) {
                raw[p] = (clean(prev) + ' ' + curTrim.toLowerCase()).replace(/\s{2,}/g, ' ');
                raw[i] = '';
                continue;
            }
            if (n >= 0 && startsLowerOrPunct(next)) {
                raw[n] = (curTrim.toLowerCase() + ' ' + clean(next)).replace(/\s{2,}/g, ' ');
                raw[i] = '';
                continue;
            }
            raw[i] = '';
        }
    }
    {
        const out2 = [];
        for (let i = 0; i < raw.length; i++) {
            const cur = raw[i] ?? '';
            if (out2.length) {
                const prev = out2[out2.length - 1];
                if (!prevEnds(prev) && startsLowerOrPunct(cur)) {
                    out2[out2.length - 1] = (clean(prev) + ' ' + clean(cur)).replace(/\s{2,}/g, ' ');
                    continue;
                }
            }
            out2.push(clean(cur));
        }
        raw = out2;
    }
    return raw.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

async function extractText(buffer, mimetype) {
    if (mimetype === 'application/pdf') {
        try {
            const data = await pdfParse(buffer, { pagerender: pdfPageRender });
            return data.text;
        } catch (e) {
            const data = await pdfParse(buffer);
            return data.text;
        }
    } else if (mimetype.includes('word') || mimetype.includes('document')) {
        const result = await mammoth.extractRawText({ buffer });
        return result.value;
    } else if (mimetype === 'text/plain') {
        return buffer.toString('utf-8');
    }
    throw new Error('Unsupported file type');
}

function normalizeForPrompt(text = '') {
    let t = text;
    t = t.replace(/\r\n?/g, '\n');
    t = t.replace(/([A-Za-z])-\s*\n\s*([A-Za-z])/g, '$1$2');
    t = t.replace(/\s*\|\s*/g, ' | ');
    t = t.replace(/\s*,\s*/g, ', ').replace(/\s*;\s*/g, '; ').replace(/\s*:\s*/g, ': ');
    t = t.replace(/\s*\(\s*/g, ' (').replace(/\s*\)\s*/g, ') ');
    t = t.replace(/([A-Za-z0-9])\s*-\s*([A-Za-z0-9])/g, '$1-$2');
    t = t.replace(/^[ \t]*[•▪◦∙·]\s*/gm, '- ');
    t = t.replace(/[ \t]{2,}/g, ' ');
    t = t.replace(/(\b(19|20)\d{2})\s*[-–]\s*(present|\b(19|20)\d{2})/gi, '$1 – $3');
    let lines = t.split('\n').map(l => l.trimEnd());
    const emailRe = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
    const phoneRe = /(\+?\d{1,3}[\s.-]?)?(\(?\d{2,4}\)?[\s.-]?)?[\d\s.-]{6,}/;
    const linkRe = /linkedin\.com\/in\//i;
    const contactIdx = lines.findIndex(l => emailRe.test(l) || (phoneRe.test(l) && /github\.com|linkedin\.com/i.test(l)) || linkRe.test(l));
    if (contactIdx >= 0) {
        if (lines[contactIdx + 1] !== '') {
            lines.splice(contactIdx + 1, 0, '');
        }
    }
    lines = lines.map(l =>
        l.replace(/\bI\s*as\s*i\b/gi, 'Iasi').replace(/\bI\s*a\s*s\s*i\b/gi, 'Iasi')
    );
    const isHeading = (s) => {
        const u = (s || '').trim().toUpperCase();
        return ['SUMMARY', 'SKILLS', 'WORK EXPERIENCE', 'EDUCATION', 'CERTIFICATIONS'].includes(u);
    };
    const HEADING_BLANK_AFTER = new Set(['SUMMARY', 'WORK EXPERIENCE', 'EDUCATION', 'CERTIFICATIONS']);
    const HEADING_NO_BLANK_AFTER = new Set(['SKILLS']);
    for (let i = 0; i < lines.length; i++) {
        const u = (lines[i] || '').trim().toUpperCase();
        if (!isHeading(lines[i])) continue;
        let j = i + 1;
        while (j < lines.length && lines[j] === '') j++;
        if (HEADING_BLANK_AFTER.has(u)) {
            if (lines[i + 1] !== '') lines.splice(i + 1, 0, '');
        } else if (HEADING_NO_BLANK_AFTER.has(u)) {
            if (lines[i + 1] === '') lines.splice(i + 1, 1);
        }
    }
    const workIdx = lines.findIndex(l => (l || '').trim().toUpperCase() === 'WORK EXPERIENCE');
    let nextSectionIdx = -1;
    if (workIdx >= 0) {
        for (let k = workIdx + 1; k < lines.length; k++) {
            if (isHeading(lines[k])) { nextSectionIdx = k; break; }
        }
        if (nextSectionIdx < 0) nextSectionIdx = lines.length;
        const processed = [];
        for (let k = workIdx + 1; k < nextSectionIdx; k++) {
            let line = lines[k];
            const m = line.match(/^(.+?,\s*[A-Za-zÀ-ÖØ-öø-ÿ .'-]+?)\s*-\s*(.+)$/);
            if (m) {
                processed.push(m[1].trim());
                processed.push(`- ${m[2].trim()}`);
            } else {
                processed.push(line);
            }
        }
        for (let i = 0; i < processed.length; i++) {
            processed[i] = processed[i]
                .replace(/^\s*-\s*/, '- ')
                .replace(/^\s*•\s*/, '- ')
                .replace(/^\s*▪\s*/, '- ')
                .replace(/^\s*·\s*/, '- ');
        }
        lines.splice(workIdx + 1, nextSectionIdx - (workIdx + 1), ...processed);
    }
    const out = [];
    for (let i = 0; i < lines.length; i++) {
        const cur = lines[i];
        if (cur === '' && out.length && out[out.length - 1] === '') continue;
        out.push(cur);
    }
    t = out.join('\n');
    return t.trim();
}

function inferFileType(file, buffer) {
    const name = (file?.originalname || '').toLowerCase();
    const mm = file?.mimetype || '';
    const isPDFMagic = buffer && buffer.slice(0, 5).toString() === '%PDF-';
    if (mm) return mm;
    if (isPDFMagic || name.endsWith('.pdf')) return 'application/pdf';
    if (name.endsWith('.docx')) return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    if (name.endsWith('.txt')) return 'text/plain';
    return 'application/octet-stream';
}

const EDU_LEVELS = [
    { key: 'phd', rank: 5, rx: /\b(ph\.?\s*d\.?|phd|doctorate|doctoral|doctor of philosophy)\b/i },
    { key: 'master', rank: 4, rx: /\b(master['']?s|masterat)\b|\b(m\.?\s*sc\.?|msc|mba|m\.?\s*eng\.?|meng)\b/i },
    { key: 'bachelor', rank: 3, rx: /\b(bachelor['']?s|licen[țt]a|licen[țt]ă)\b|\b(b\.?\s*sc\.?|bsc|beng|b\.?\s*eng\.?|btech|b\.?\s*tech\.?)\b/i },
    { key: 'associate', rank: 2, rx: /\b(associate['']?s(?:\s+degree)?)\b|\b(a\.?\s*a\.?\s*s\.?)\b/i },
    { key: 'highschool', rank: 1, rx: /\b(high\s*school|secondary\s+school|liceu|lyceum)\b/i }
];

function detectEducationLevel(text = '') {
    const s = (text || '')
        .replace(/[\u200B-\u200D\uFEFF]/g, ' ')
        .replace(/[\u2018\u2019\u201A\u201B]/g, "'")
        .normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
    let best = null;
    for (const lvl of EDU_LEVELS) {
        if (lvl.rx.test(s)) {
            if (!best || lvl.rank > best.rank) best = lvl;
        }
    }
    return best;
}

function educationMatchInfo(cvText, jdText) {
    const cvLvl = detectEducationLevel(cvText);
    const jdLvl = detectEducationLevel(jdText);
    const presentInCV = !!cvLvl;
    const presentInJD = !!jdLvl;
    let match = false;
    let message = '';
    if (!presentInJD && presentInCV) {
        match = true;
        message = 'The job description does not list required or preferred education, but your education is noted.';
    } else if (presentInJD && !presentInCV) {
        match = false;
        message = 'The degree is not an match to the job description.';
    } else if (presentInJD && presentInCV) {
        match = cvLvl.rank === jdLvl.rank;
        message = match
            ? "The Degree is an exact match to the job description's requirement"
            : 'The degree is not an match to the job description.';
    } else {
        match = false;
        message = 'Education not detected in CV or Job Description';
    }
    return {
        presentInCV,
        presentInJD,
        levelInCV: cvLvl?.key || null,
        levelInJD: jdLvl?.key || null,
        match,
        message
    };
}

// === END HELPERS ===

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    baseURL: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1'
});

const upload = multer({ storage: multer.memoryStorage() });

// Serverless handler
module.exports = async (req, res) => {
    // CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    try {
        // Parse multipart form
        await new Promise((resolve, reject) => {
            upload.single('cv')(req, res, (err) => (err ? reject(err) : resolve()));
        });

        if (!req.file) return res.status(400).json({ error: 'No CV file uploaded' });

        const cvTextRaw = await extractText(req.file.buffer, inferFileType(req.file, req.file.buffer));
        const cvText = normalizeForPrompt(cvTextRaw);
        const { jobDescription } = req.body;

        const cvScan = cvText
            .replace(/[\u200B-\u200D\uFEFF]/g, '')
            .replace(/\s*\|\s*/g, ' | ');

        const jdScan = (jobDescription || '')
            .replace(/[\u200B-\u200D\uFEFF]/g, ' ')
            .replace(/[\u2018\u2019\u201A\u201B]/g, "'")
            .normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
            .replace(/[ \t]{2,}/g, ' ')
            .trim();

        const edu = educationMatchInfo(cvScan, jdScan);

        const hasEmail = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(cvScan);
        const hasPhone = /(\+?\d{1,3}[\s.-]?)?(\(?\d{2,4}\)?[\s.-]?)?[\d\s.-]{6,}/.test(cvScan);
        const hasLinkedIn = /linkedin\.com\/in\//i.test(cvScan);

        const jdFirstLine = (jobDescription.split('\n')[0] || '').toLowerCase().trim();
        const jdTitleTokens = jdFirstLine.replace(/[^a-z\s]/g, ' ').split(/\s+/).filter(Boolean);
        const cvLower = cvScan.toLowerCase();
        const feSyn = ['frontend', 'front-end', 'front end'];
        const hasFETitle = feSyn.some(s => cvLower.includes(s));
        const matchedTokenCount = jdTitleTokens.filter(t => t.length > 2 && cvLower.includes(t)).length;
        const jobTitleMatch = matchedTokenCount >= 2 || (matchedTokenCount >= 1 && hasFETitle);

        const hasSummary = /^\s*(summary|objective|profile)\s*$/im.test(cvScan);
        const hasSkillsSection = /^\s*skills\s*$/im.test(cvScan);
        const hasEducation = /^\s*education\b/im.test(cvScan);
        const hasWorkExperience = /^\s*(work\s+experience|experience|employment|professional\s+experience)\s*$/im.test(cvScan);
        const hasProjects = /^\s*projects\s*$/im.test(cvScan);

        const monthNames = /(jan(uary)?|feb(ruary)?|mar(ch)?|apr(il)?|may|jun(e)?|jul(y)?|aug(ust)?|sep(t)?(ember)?|oct(ober)?|nov(ember)?|dec(ember)?)/i;
        const monthYear = new RegExp(`${monthNames.source}\\s+\\d{4}`, 'i');
        const yearRange = /\b(19|20)\d{2}\s*[–-]\s*(present|(19|20)\d{2})\b/i;
        const datesFound = monthYear.test(cvScan) || yearRange.test(cvScan);
        const looksConsistent = (cvScan.match(yearRange)?.length || 0) >= 1 || (cvScan.match(monthYear)?.length || 0) >= 2;

        const fileType = inferFileType(req.file, req.file.buffer);
        const allowedTypes = new Set([
            'application/pdf',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'text/plain',
            'application/octet-stream'
        ]);
        const fileAllowed = allowedTypes.has(fileType);

        const checks = {
            contact: { email: hasEmail, phone: hasPhone, linkedin: hasLinkedIn },
            jobTitleMatch,
            sections: {
                summary: hasSummary,
                skills: hasSkillsSection,
                education: hasEducation,
                workExperience: hasWorkExperience,
                projects: hasProjects
            },
            dates: { found: datesFound, looksConsistent },
            file: { type: fileType || 'unknown', allowed: fileAllowed },
            educationMatch: edu
        };

        const embeddingResp = await openai.embeddings.create({
            model: 'text-embedding-3-small',
            input: [cvText, jobDescription]
        });

        const [cvEmbed, jobEmbed] = embeddingResp.data.map(d => d.embedding);
        const dot = cvEmbed.reduce((s, v, i) => s + v * jobEmbed[i], 0);
        const magA = Math.sqrt(cvEmbed.reduce((s, v) => s + v * v, 0));
        const magB = Math.sqrt(jobEmbed.reduce((s, v) => s + v * v, 0));
        const similarity = magA && magB ? dot / (magA * magB) : 0;
        const embeddingScore = Math.round(similarity * 100);

        const prompt = `You are an expert ATS analyzer. Return ONLY valid JSON:
{
  "keywords": [{"term":"keyword1","matched":true}],
  "hardSkills": {"matched":[],"partial":[],"missing":[],"extras":[]},
  "softSkills": {"matched":[],"partial":[],"missing":[]},
  "experienceScore": 75,
  "recommendations": ["..."]
}

Instructions:
- "keywords": extract job-specific terms from JD; mark each as matched (true/false) if present in CV.
- "hardSkills":
  - Extract ALL technical/hard skills from BOTH JD and CV (e.g., React, TypeScript, Git, Webpack, Vite, Figma, GSAP, Tailwind CSS, GraphQL, RESTful APIs, CI/CD, Jest, Cypress, Redux, Zustand, etc.)
  - Search for each skill case-insensitively, allowing variations (e.g., "front-end" matches "frontend", "REST APIs" matches "RESTful APIs")
  - "matched": skills from JD that are present in CV (exact or very close match)
  - "partial": skills from JD where CV mentions related/similar tech (e.g., JD asks "GraphQL", CV has "REST APIs")
  - "missing": skills from JD that are completely absent in CV
  - "extras": skills present in CV but NOT required by JD (e.g., Figma, Webpack, Vite if JD doesn't list them)
- "softSkills": extract ONLY soft/interpersonal skills (e.g., Communication, Teamwork, Problem Solving, Leadership, Collaboration, Ownership) from JD; classify as matched/partial/missing in CV.
- Do NOT include soft skills in hardSkills or vice versa.
- "experienceScore": rate CV's overall experience relevance (0–100).
- "recommendations": list actionable tips to improve match.

IMPORTANT: Search thoroughly in the entire CV text (including SKILLS section and WORK EXPERIENCE bullets) for each skill.

Job Description:
${jdScan}

CV (clean):
${cvText}`;

        const completion = await openai.chat.completions.create({
            model: "mistralai/mistral-7b-instruct:free",
            messages: [{ role: "user", content: prompt }],
            response_format: { type: "json_object" },
            temperature: 0.3
        });

        const analysis = JSON.parse(completion.choices[0].message.content);

        const kw = Array.isArray(analysis.keywords) ? analysis.keywords : [];
        const totalKw = kw.length || 0;
        const matchedKw = kw.filter(k => k.matched).length || 0;
        const keywordCoverage = totalKw ? Math.round((matchedKw / totalKw) * 100) : 0;

        const hardSkillsObj = analysis.hardSkills || { matched: [], partial: [], missing: [], extras: [] };
        const totalhardSkills =
            (hardSkillsObj.matched?.length || 0) +
            (hardSkillsObj.partial?.length || 0) +
            (hardSkillsObj.missing?.length || 0);
        const skillCoverage = totalhardSkills
            ? Math.round((hardSkillsObj.matched.length / totalhardSkills) * 100)
            : 0;

        const softSkillsObj = analysis.softSkills || { matched: [], partial: [], missing: [] };
        const totalSoftSkills =
            (softSkillsObj.matched?.length || 0) +
            (softSkillsObj.partial?.length || 0) +
            (softSkillsObj.missing?.length || 0);
        const softSkillCoverage = totalSoftSkills
            ? Math.round((softSkillsObj.matched.length / totalSoftSkills) * 100)
            : 0;

        const eduScore = edu.presentInJD ? (edu.match ? 100 : 0) : (edu.presentInCV ? 60 : 0);

        const extractYears = (text) => {
            const m = text.match(/(\d+)\s*\+?\s*(years?|yrs?)\s*(of\s+experience)?/i);
            return m ? parseInt(m[1], 10) : null;
        };
        const jdYears = extractYears(jobDescription);
        const cvYears = extractYears(cvScan);
        const jobLevelMatch = (jdYears !== null && cvYears !== null && cvYears >= jdYears);
        const jobLevelMessage = jobLevelMatch
            ? "Your years of experience align with the role's requirements. This is a positive start, but remember to carefully review all other job criteria to ensure you're a strong overall match before applying."
            : "The years of experience does not align with the role requirement";

        const hasNumbers = /\b\d+%?\b/.test(cvScan);
        const hasDates = /\b(19|20)\d{2}\b/.test(cvScan);
        const measurableMessage = (hasNumbers && hasDates)
            ? "Your resume includes specific numbers and dates, demonstrating measurable impact. Keep being concise and accurate."
            : "Add more measurable results with dates, length of time, and accurate numbers to demonstrate impact.";

        const wordCount = cvScan.split(/\s+/).filter(Boolean).length;
        const wordCountMessage = wordCount < 1000
            ? `There are ${wordCount} words in your resume, which is under the suggested 1000 word count for relevance and ease of reading reasons.`
            : `Your resume has ${wordCount} words. Consider reducing it to under 1000 for better readability.`;

        const hasWebPresence = /linkedin\.com\/in\//i.test(cvScan) || /github\.com/i.test(cvScan);
        const webPresenceMessage = hasWebPresence
            ? "You included a LinkedIn or GitHub profile, which helps recruiters verify your online presence."
            : "Consider adding a LinkedIn or GitHub profile link to strengthen your web presence.";

        const recruiterTips = {
            jobLevelMatch: { match: jobLevelMatch, message: jobLevelMessage },
            measurableResults: { present: hasNumbers && hasDates, message: measurableMessage },
            wordCount: { count: wordCount, message: wordCountMessage },
            webPresence: { present: hasWebPresence, message: webPresenceMessage }
        };

        const jobLevelScore = recruiterTips.jobLevelMatch.match ? 100 : 0;
        const measurableScore = recruiterTips.measurableResults.present ? 100 : 0;
        const wordCountScore = (recruiterTips.wordCount.count < 1000) ? 100 : 50;
        const webPresenceScore = recruiterTips.webPresence.present ? 100 : 50;

        const WEIGHTS = {
            hardSkillsKeywords: 0.32,
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
        const titleScore = checks.jobTitleMatch ? 100 : 0;

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

        res.status(200).json({
            matchScore,
            keywords: analysis.keywords || [],
            hardSkills: analysis.hardSkills || { matched: [], partial: [], missing: [], extras: [] },
            softSkills: analysis.softSkills || { matched: [], partial: [], missing: [] },
            experienceScore: analysis.experienceScore || 0,
            recommendations: analysis.recommendations || [],
            checks,
            recruiterTips,
            cleanedCvText: cvText
        });
    } catch (err) {
        console.error('Error analyzing CV:', err);
        res.status(500).json({ error: 'Failed to analyze CV', details: err.message });
    }
};