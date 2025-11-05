import React, { useState, useRef, useEffect } from 'react';
import axios from 'axios';
import { saveAs } from 'file-saver';
import jsPDF from 'jspdf';
import { extractTextFromPDF } from './utils/pdf.js';
import './App.css';
import ScorePieRecharts from './components/ScorePieRecharts.js';

interface Keyword {
  term: string;
  matched: boolean;
}

interface Skills {
  matched: string[];
  partial: string[];
  missing: string[];
}

interface AnalysisResult {
  matchScore: number;
  experienceScore: number;
  keywords: Keyword[];
  skills: Skills;
  recommendations: string[];
  generatedAt: string;
}

function App() {
  const [cvText, setCvText] = useState<string>(() =>
    sessionStorage.getItem('cvText') || ''
  );
  const [jobDescription, setJobDescription] = useState<string>(() =>
    sessionStorage.getItem('jobDescription') || ''
  );
  const [report, setReport] = useState<AnalysisResult | null>(() => {
    const saved = sessionStorage.getItem('report');
    return saved ? JSON.parse(saved) : null;
  });

  const [cvFile, setCvFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [lastAnalyzed, setLastAnalyzed] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    sessionStorage.setItem('cvText', cvText);
  }, [cvText]);

  useEffect(() => {
    sessionStorage.setItem('jobDescription', jobDescription);
  }, [jobDescription]);

  useEffect(() => {
    if (report) {
      sessionStorage.setItem('report', JSON.stringify(report));
    } else {
      sessionStorage.removeItem('report');
    }
  }, [report]);

  const openFileDialog = () => {
    fileInputRef.current?.click();
  };

  const handleCVUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCvFile(file);
    setLoading(true);
    setError('');

    try {
      if (file.type === 'application/pdf') {
        const text = await extractTextFromPDF(file);
        setCvText(text);
      } else {
        const text = await file.text();
        setCvText(text);
      }
    } catch (err) {
      console.error(err);
      setError('Error extracting text from file');
    }
    setLoading(false);
  };

  const handleAnalyze = async () => {
    if (!cvText || !jobDescription) {
      setError('Please upload/paste CV and provide job description');
      return;
    }

    const currentHash = cvText + '|||' + jobDescription;
    if (currentHash === lastAnalyzed && report) {
      setError('No changes detected. Modify CV or Job Description to re-analyze.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const formData = new FormData();

      if (cvFile) {
        formData.append('cv', cvFile);
      } else {
        const blob = new Blob([cvText], { type: 'text/plain' });
        formData.append('cv', blob, 'cv.txt');
      }

      formData.append('jobDescription', jobDescription);

      const { data } = await axios.post('http://localhost:5000/analyze', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });

      const result: AnalysisResult = {
        matchScore: data.matchScore,
        experienceScore: data.experienceScore,
        keywords: data.keywords,
        skills: data.skills,
        recommendations: data.recommendations,
        generatedAt: new Date().toLocaleString()
      };

      setReport(result);
      setLastAnalyzed(currentHash);
    } catch (err: unknown) {
      console.error(err);
      if (axios.isAxiosError(err)) {
        setError(err.response?.data?.error || err.message);
      } else if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Analysis failed');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setCvFile(null);
    setCvText('');
    setJobDescription('');
    setReport(null);
    setError('');
    setLastAnalyzed('');

    sessionStorage.removeItem('cvText');
    sessionStorage.removeItem('jobDescription');
    sessionStorage.removeItem('report');
  };

  const downloadReportPDF = () => {
    if (!report) return;
    const doc = new jsPDF({ unit: 'pt', format: 'a4' });

    doc.setFontSize(16);
    doc.text('ATS Analysis Report', 40, 50);
    doc.setFontSize(10);
    doc.text(`Generated: ${report.generatedAt}`, 40, 70);

    doc.setFontSize(12);
    doc.text(`Overall Match Score: ${report.matchScore}%`, 40, 100);
    doc.text(`Experience Match: ${report.experienceScore}%`, 40, 120);

    let y = 150;
    doc.setFontSize(11);
    doc.text('Keywords Analysis:', 40, y);
    y += 20;
    doc.setFontSize(9);

    const matched = report.keywords.filter(k => k.matched);
    const missing = report.keywords.filter(k => !k.matched);

    doc.text(`Matched (${matched.length}):`, 50, y);
    y += 15;
    matched.forEach(k => {
      if (y > 750) { doc.addPage(); y = 40; }
      doc.text(`✓ ${k.term}`, 60, y);
      y += 12;
    });

    y += 10;
    doc.text(`Missing (${missing.length}):`, 50, y);
    y += 15;
    missing.forEach(k => {
      if (y > 750) { doc.addPage(); y = 40; }
      doc.text(`✗ ${k.term}`, 60, y);
      y += 12;
    });

    doc.addPage();
    doc.setFontSize(11);
    doc.text('Recommendations:', 40, 40);
    doc.setFontSize(9);
    y = 60;
    report.recommendations.forEach((rec, i) => {
      const lines = doc.splitTextToSize(`${i + 1}. ${rec}`, 500);
      lines.forEach((line: string) => {
        if (y > 750) { doc.addPage(); y = 40; }
        doc.text(line, 50, y);
        y += 14;
      });
    });

    const blob = doc.output('blob');
    saveAs(blob, 'ats-report.pdf');
  };

  const matchedKeywords = report?.keywords.filter(k => k.matched).length || 0;
  const totalKeywords = report?.keywords.length || 0;

  return (
    <div className="bg-(--light-color) min-h-screen pt-6">
      <div className='max-w-7xl mx-auto bg-white rounded-2xl shadow p-6'>
        <h1 className='font-(family-name:--font-inter) text-2xl font-semibold text-[#13292d] text-center'>ATS PERSONAL</h1>
        <p className='font-(family-name:--font-rale) text-sm text-slate-600 mt-1 text-center'>Upload the CV (PDF or text) and the description of the job. You will get a score, keywords and recommendations.</p>

        <div className='font-(family-name:--font-rale) mt-6 grid grid-cols-1 md:grid-cols-2 gap-4 bg-[#abe7b24d] p-6 rounded-sm shadow'>
          <div>
            <label className='block text-sm font-medium font-(family-name:--font-inter)'>CV (upload or paste)</label>
            <input ref={fileInputRef} type="file" accept=".pdf,.txt,.docx,.doc" onChange={handleCVUpload} className='hidden' />
            <textarea value={cvText} onChange={(e) => setCvText(e.target.value)} placeholder='Paste your CV here...' className='w-full h-48 mt-3 p-3 border rounded resize-none outline-none'></textarea>

            <div className='w-full flex flex-col items-center'>
              <button type="button" onClick={openFileDialog} className='border p-2 rounded-2xl border-(--accent-color) bg-(--accent-color) mt-2 cursor-pointer'>
                <i className="fa-solid fa-file-import mr-2"></i>Upload File
              </button>
            </div>

            <div className='text-xs text-slate-500 mt-3'>
              <i className="fa-solid fa-lightbulb"></i> Suggestion: Use clear formats, separated sections: Skills, Experience, Education. <span className='font-medium'>Use a clear and concise format</span>
            </div>
          </div>

          <div>
            <label className='block text-sm font-medium font-(family-name:--font-inter)'>Job Description</label>
            <textarea value={jobDescription} onChange={(e) => setJobDescription(e.target.value)} placeholder='Paste the job description here...' className='w-full h-48 mt-3 p-3 border rounded resize-none outline-none'></textarea>

            <div className='flex gap-2 mt-3'>
              <button onClick={handleAnalyze} disabled={loading} className='px-4 py-2 bg-(--accent-color) rounded disabled:opacity-50'>
                {loading ? 'Analyzing...' : 'Scan'}
              </button>
              <button onClick={handleReset} className='px-4 py-2 bg-slate-200 rounded'>Reset</button>
            </div>
          </div>
        </div>

        <div className='mt-6'>
          {/* {loading && <div className='text-sm text-slate-600'>Loading...</div>} */}
          {error && <div className='p-3 bg-red-100 text-red-700 rounded'>{error}</div>}

          {report && (
            <div className='mt-4 border rounded p-4 bg-slate-50'>
              <div className='flex items-center justify-between'>
                <div className='flex items-center gap-6'>
                  <ScorePieRecharts value={report.matchScore} color='var(--accent-color)' label='Match' />
                  <ScorePieRecharts value={report.experienceScore} color='#60a5fa' label='Experience' />
                  <div>
                    <div className="text-sm text-slate-600">Keywords: {matchedKeywords}/{totalKeywords}</div>
                    <div className="text-xs text-slate-500">{report.generatedAt}</div>
                  </div>
                </div>
                <div className='flex gap-2'>
                  <button onClick={downloadReportPDF} className='px-3 py-2 bg-(--accent-color) rounded'>Download PDF</button>
                </div>
              </div>

              <div className='mt-4 grid grid-cols-1 md:grid-cols-3 gap-4'>
                <div className='p-3 bg-white rounded shadow-sm'>
                  <div className='text-sm font-medium'>Keywords Match</div>
                  <div className="text-sm mt-2 max-h-107 overflow-auto space-y-1">
                    {report.keywords.map((kw, i) => (
                      <div key={i} className={kw.matched ? 'text-green-600' : 'text-red-600'}>
                        {kw.matched ? '✓' : '✗'} {kw.term}
                      </div>
                    ))}
                  </div>
                </div>

                <div className='p-3 bg-white rounded shadow-sm'>
                  <div className='text-sm font-medium'>Skills Analysis</div>
                  <div className="text-sm mt-2 space-y-2">
                    <div>
                      <div className="font-medium text-green-600">Matched:</div>
                      <ul className="list-disc pl-5">
                        {report.skills.matched.map((s, i) => <li key={i}>{s}</li>)}
                      </ul>
                    </div>
                    <div>
                      <div className="font-medium text-orange-600">Partial:</div>
                      <ul className="list-disc pl-5">
                        {report.skills.partial.map((s, i) => <li key={i}>{s}</li>)}
                      </ul>
                    </div>
                    <div>
                      <div className="font-medium text-red-600">Missing:</div>
                      <ul className="list-disc pl-5">
                        {report.skills.missing.map((s, i) => <li key={i}>{s}</li>)}
                      </ul>
                    </div>
                  </div>
                </div>

                <div className='p-3 bg-white rounded shadow-sm'>
                  <div className='text-sm font-medium'>Recommendations</div>
                  <ul className="text-sm mt-2 list-decimal pl-5">
                    {report.recommendations.length ? report.recommendations.map((s, i) => <li key={i}>{s}</li>) : <li className="text-xs text-slate-500">No specific recommendations.</li>}
                  </ul>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className='mt-6 text-xs text-slate-500'>
          <div>Notes: This app performs AI-powered semantic matching using OpenAI embeddings and GPT-4 analysis. For best results, use clear CV formatting with separated sections.</div>
        </div>
      </div>

      <footer className='w-full font-(family-name:--font-rale) mt-19.5 bg-(--secondary-color) text-center text-slate-700 text-sm flex flex-row justify-between items-center py-4 px-5'>
        <div className="text-xs text-start">
          <p>© 2025 ATS Personal. Free for personal & commercial use with attribution. Designed & developed by Gheorghiciuc Georgia.</p>
        </div>
        <div className="text-xl">
          <a className="decoration-none" href="https://github.com/gheorghiciucgeorgia"><i className="fa-brands fa-github"></i></a>
        </div>
      </footer>
    </div>
  );
}

export default App;