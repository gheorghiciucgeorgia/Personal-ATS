const http = require('http');
const analyzeHandler = require('./analyze');

const PORT = process.env.PORT || 5000;

function enhanceResponse(res) {
 res.status = function status(code) {
  res.statusCode = code;
  return res;
 };

 res.json = function json(payload) {
  if (!res.headersSent) {
   res.setHeader('Content-Type', 'application/json');
  }
  res.end(JSON.stringify(payload));
  return res;
 };

 return res;
}

const server = http.createServer((req, res) => {
 const url = new URL(req.url, `http://${req.headers.host}`);
 enhanceResponse(res);

 if (url.pathname === '/api/analyze' || url.pathname === '/analyze') {
  Promise.resolve(analyzeHandler(req, res)).catch((error) => {
   console.error('Unhandled API error:', error);
   if (!res.headersSent) {
    res.status(500).json({ error: 'Internal server error' });
   }
  });
  return;
 }

 res.status(404).json({ error: 'Not found' });
});

server.listen(PORT, () => {
 console.log(`API listening on http://localhost:${PORT}`);
});
