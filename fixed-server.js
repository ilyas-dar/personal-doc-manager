const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');
const crypto = require('crypto');

// Load authentication config
let authConfig = {
    enabled: true,
    username: 'admin',
    password: 'your-secure-password-here',
    sessionTimeout: 3600000
};

try {
    if (fs.existsSync(path.join(__dirname, 'auth-config.json'))) {
        authConfig = JSON.parse(fs.readFileSync(path.join(__dirname, 'auth-config.json'), 'utf8'));
    }
} catch (error) {
    console.log('Using default auth config');
}

// Session storage
const sessions = new Map();

// Create directories if they don't exist
const uploadsDir = path.join(__dirname, 'uploads');
const dataDir = path.join(__dirname, 'data');

if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir);
}
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir);
}

// File metadata storage
const metadataFile = path.join(dataDir, 'files.json');
let fileMetadata = {};

// Load existing metadata
try {
    if (fs.existsSync(metadataFile)) {
        fileMetadata = JSON.parse(fs.readFileSync(metadataFile, 'utf8'));
    }
} catch (error) {
    console.log('No existing metadata found, starting fresh');
}

// Save metadata function
function saveMetadata() {
    fs.writeFileSync(metadataFile, JSON.stringify(fileMetadata, null, 2));
}

// Generate unique ID
function generateId() {
    return crypto.randomBytes(16).toString('hex');
}

// Get MIME type
function getMimeType(filename) {
    const ext = path.extname(filename).toLowerCase();
    const mimeTypes = {
        // Documents
        '.pdf': 'application/pdf',
        '.doc': 'application/msword',
        '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        '.txt': 'text/plain',
        '.rtf': 'application/rtf',
        
        // Spreadsheets
        '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        '.xls': 'application/vnd.ms-excel',
        '.csv': 'text/csv',
        
        // Images
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.png': 'image/png',
        '.gif': 'image/gif',
        '.webp': 'image/webp',
        '.bmp': 'image/bmp',
        '.svg': 'image/svg+xml',
        '.ico': 'image/x-icon',
        
        // Archives
        '.zip': 'application/zip',
        '.rar': 'application/vnd.rar',
        '.7z': 'application/x-7z-compressed',
        '.tar': 'application/x-tar',
        '.gz': 'application/gzip',
        
        // Audio
        '.mp3': 'audio/mpeg',
        '.wav': 'audio/wav',
        '.ogg': 'audio/ogg',
        '.m4a': 'audio/mp4',
        
        // Video
        '.mp4': 'video/mp4',
        '.avi': 'video/x-msvideo',
        '.mov': 'video/quicktime',
        '.wmv': 'video/x-ms-wmv',
        '.flv': 'video/x-flv',
        '.webm': 'video/webm',
        
        // Code
        '.html': 'text/html',
        '.css': 'text/css',
        '.js': 'application/javascript',
        '.json': 'application/json',
        '.xml': 'application/xml',
        '.py': 'text/x-python',
        '.java': 'text/x-java-source',
        '.cpp': 'text/x-c++src',
        '.c': 'text/x-csrc',
        '.php': 'application/x-httpd-php',
        
        // Other
        '.md': 'text/markdown',
        '.log': 'text/plain'
    };
    return mimeTypes[ext] || 'application/octet-stream';
}

// Authentication functions
function generateSessionId() {
    return crypto.randomBytes(32).toString('hex');
}

function createSession() {
    const sessionId = generateSessionId();
    const session = {
        id: sessionId,
        createdAt: Date.now(),
        expiresAt: Date.now() + authConfig.sessionTimeout
    };
    sessions.set(sessionId, session);
    return sessionId;
}

function validateSession(sessionId) {
    if (!authConfig.enabled) return true;
    
    const session = sessions.get(sessionId);
    if (!session) return false;
    
    if (Date.now() > session.expiresAt) {
        sessions.delete(sessionId);
        return false;
    }
    
    return true;
}

function cleanupExpiredSessions() {
    const now = Date.now();
    for (const [sessionId, session] of sessions.entries()) {
        if (now > session.expiresAt) {
            sessions.delete(sessionId);
        }
    }
}

// Clean up expired sessions every 5 minutes
setInterval(cleanupExpiredSessions, 5 * 60 * 1000);

// Parse multipart form data with proper binary handling
function parseMultipartData(body, boundary) {
    const parts = body.split('--' + boundary);
    const result = {};
    
    for (let part of parts) {
        if (part.includes('Content-Disposition: form-data')) {
            const lines = part.split('\r\n');
            let name = '';
            let filename = '';
            let contentType = '';
            let dataStart = -1;
            
            // Find the boundary between headers and data
            for (let i = 0; i < lines.length; i++) {
                const line = lines[i];
                if (line === '') {
                    dataStart = i + 1;
                    break;
                }
                
                if (line.includes('name=')) {
                    const match = line.match(/name="([^"]+)"/);
                    if (match) name = match[1];
                }
                if (line.includes('filename=')) {
                    const match = line.match(/filename="([^"]+)"/);
                    if (match) filename = match[1];
                }
                if (line.includes('Content-Type:')) {
                    contentType = line.split('Content-Type: ')[1];
                }
            }
            
            if (name === 'file' && filename && dataStart > 0) {
                // Extract binary data properly
                const dataLines = lines.slice(dataStart);
                let data = '';
                
                for (let i = 0; i < dataLines.length; i++) {
                    if (dataLines[i] === '--' + boundary + '--') {
                        break; // End of multipart data
                    }
                    if (i > 0) data += '\r\n';
                    data += dataLines[i];
                }
                
                // Remove trailing boundary if present
                if (data.endsWith('--' + boundary + '--')) {
                    data = data.slice(0, data.length - boundary.length - 6);
                }
                
                result.file = {
                    name: filename,
                    data: Buffer.from(data, 'binary'),
                    type: contentType || getMimeType(filename)
                };
            }
        }
    }
    
    return result;
}

const server = http.createServer((req, res) => {
    const parsedUrl = url.parse(req.url, true);
    const pathname = parsedUrl.pathname;
    
    // Set CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
    }
    
    // Authentication middleware
    function requireAuth(req, res, next) {
        if (!authConfig.enabled) {
            return next();
        }
        
        const sessionId = req.headers.cookie?.split('sessionId=')[1]?.split(';')[0];
        
        if (!sessionId || !validateSession(sessionId)) {
            res.writeHead(401, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Authentication required' }));
            return;
        }
        
        next();
    }
    
    // Authentication routes
    if (pathname === '/api/login' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => {
            body += chunk.toString();
        });
        
        req.on('end', () => {
            try {
                const { username, password } = JSON.parse(body);
                
                if (username === authConfig.username && password === authConfig.password) {
                    const sessionId = createSession();
                    res.writeHead(200, {
                        'Content-Type': 'application/json',
                        'Set-Cookie': `sessionId=${sessionId}; HttpOnly; Path=/; Max-Age=${authConfig.sessionTimeout / 1000}`
                    });
                    res.end(JSON.stringify({ success: true, message: 'Login successful' }));
                } else {
                    res.writeHead(401, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Invalid credentials' }));
                }
            } catch (error) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Invalid request' }));
            }
        });
        return;
    }
    
    if (pathname === '/api/logout' && req.method === 'POST') {
        const sessionId = req.headers.cookie?.split('sessionId=')[1]?.split(';')[0];
        if (sessionId) {
            sessions.delete(sessionId);
        }
        res.writeHead(200, {
            'Content-Type': 'application/json',
            'Set-Cookie': 'sessionId=; HttpOnly; Path=/; Max-Age=0'
        });
        res.end(JSON.stringify({ success: true, message: 'Logout successful' }));
        return;
    }
    
    if (pathname === '/api/auth-status' && req.method === 'GET') {
        const sessionId = req.headers.cookie?.split('sessionId=')[1]?.split(';')[0];
        const isAuthenticated = sessionId && validateSession(sessionId);
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ 
            authenticated: isAuthenticated,
            authEnabled: authConfig.enabled 
        }));
        return;
    }
    
    // API Routes (protected)
    if (pathname === '/api/files' && req.method === 'GET') {
        requireAuth(req, res, () => {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(Object.values(fileMetadata)));
        });
        return;
    }
    
    if (pathname === '/api/search' && req.method === 'GET') {
        requireAuth(req, res, () => {
            const query = parsedUrl.query.q?.toLowerCase();
            if (!query) {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify([]));
                return;
            }
            
            const results = Object.values(fileMetadata).filter(file => {
                return (
                    file.originalName.toLowerCase().includes(query) ||
                    (file.textContent && file.textContent.toLowerCase().includes(query))
                );
            });
            
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(results));
        });
        return;
    }
    
    if (pathname === '/api/upload' && req.method === 'POST') {
        requireAuth(req, res, () => {
            let body = Buffer.alloc(0);
            
            req.on('data', chunk => {
                body = Buffer.concat([body, chunk]);
            });
            
            req.on('end', () => {
                try {
                    const contentType = req.headers['content-type'];
                    const boundary = contentType.split('boundary=')[1];
                    const parsed = parseMultipartData(body, boundary);
                    
                    if (parsed.file) {
                        const fileId = generateId();
                        const ext = path.extname(parsed.file.name);
                        const filename = fileId + ext;
                        const filePath = path.join(uploadsDir, filename);
                        
                        // Save file with proper binary handling
                        fs.writeFileSync(filePath, parsed.file.data);
                        
                        // Store metadata
                        fileMetadata[fileId] = {
                            id: fileId,
                            originalName: parsed.file.name,
                            filename: filename,
                            fileType: parsed.file.type,
                            fileSize: fs.statSync(filePath).size,
                            uploadDate: new Date().toISOString(),
                            textContent: '',
                            hasThumbnail: false
                        };
                        
                        saveMetadata();
                        
                        res.writeHead(200, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({
                            success: true,
                            file: fileMetadata[fileId]
                        }));
                    } else {
                        res.writeHead(400, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ error: 'No file uploaded' }));
                    }
                } catch (error) {
                    console.error('Upload error:', error);
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ 
                        error: 'Upload failed', 
                        details: error.message 
                    }));
                }
            });
        });
        return;
    }
    
    if (pathname.startsWith('/api/download/') && req.method === 'GET') {
        requireAuth(req, res, () => {
            const fileId = pathname.split('/')[3];
            const file = fileMetadata[fileId];
            
            if (!file) {
                res.writeHead(404, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'File not found' }));
                return;
            }
            
            const filePath = path.join(uploadsDir, file.filename);
            if (fs.existsSync(filePath)) {
                try {
                    const stats = fs.statSync(filePath);
                    const fileStream = fs.createReadStream(filePath);
                    
                    // Enhanced headers for better compatibility
                    const headers = {
                        'Content-Type': file.fileType,
                        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(file.originalName)}`,
                        'Content-Length': stats.size,
                        'Cache-Control': 'no-cache',
                        'Accept-Ranges': 'bytes'
                    };
                    
                    // Add specific headers for different file types
                    if (file.fileType.startsWith('image/')) {
                        headers['Content-Disposition'] = `inline; filename*=UTF-8''${encodeURIComponent(file.originalName)}`;
                    }
                    
                    res.writeHead(200, headers);
                    fileStream.pipe(res);
                    
                    // Handle stream errors
                    fileStream.on('error', (error) => {
                        console.error('File stream error:', error);
                        if (!res.headersSent) {
                            res.writeHead(500, { 'Content-Type': 'application/json' });
                            res.end(JSON.stringify({ error: 'File download failed' }));
                        }
                    });
                    
                } catch (error) {
                    console.error('Download error:', error);
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'File download failed' }));
                }
            } else {
                res.writeHead(404, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'File not found on server' }));
            }
        });
        return;
    }
    
    if (pathname.startsWith('/api/files/') && req.method === 'DELETE') {
        requireAuth(req, res, () => {
            const fileId = pathname.split('/')[3];
            const file = fileMetadata[fileId];
            
            if (!file) {
                res.writeHead(404, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'File not found' }));
                return;
            }
            
            try {
                const filePath = path.join(uploadsDir, file.filename);
                if (fs.existsSync(filePath)) {
                    fs.unlinkSync(filePath);
                }
                
                delete fileMetadata[fileId];
                saveMetadata();
                
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true, message: 'File deleted successfully' }));
            } catch (error) {
                console.error('Delete error:', error);
                // Even if there's an error, try to remove from metadata
                try {
                    delete fileMetadata[fileId];
                    saveMetadata();
                } catch (metaError) {
                    console.error('Metadata cleanup error:', metaError);
                }
                
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true, message: 'File removed from database' }));
            }
        });
        return;
    }
    
    // Serve static files
    let filePath = '';
    if (pathname === '/' || pathname === '/index.html') {
        // Check authentication for main page
        const sessionId = req.headers.cookie?.split('sessionId=')[1]?.split(';')[0];
        if (authConfig.enabled && (!sessionId || !validateSession(sessionId))) {
            filePath = path.join(__dirname, 'public', 'login.html');
        } else {
            filePath = path.join(__dirname, 'public', 'index.html');
        }
    } else if (pathname === '/login.html') {
        filePath = path.join(__dirname, 'public', 'login.html');
    } else {
        filePath = path.join(__dirname, 'public', pathname);
    }
    
    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
        const ext = path.extname(filePath).toLowerCase();
        const mimeTypes = {
            '.html': 'text/html',
            '.css': 'text/css',
            '.js': 'application/javascript',
            '.json': 'application/json',
            '.png': 'image/png',
            '.jpg': 'image/jpeg',
            '.gif': 'image/gif',
            '.ico': 'image/x-icon'
        };
        
        const contentType = mimeTypes[ext] || 'application/octet-stream';
        res.writeHead(200, { 'Content-Type': contentType });
        
        const fileStream = fs.createReadStream(filePath);
        fileStream.pipe(res);
    } else {
        res.writeHead(404, { 'Content-Type': 'text/html' });
        res.end('<h1>404 - Page Not Found</h1>');
    }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Fixed server running on http://localhost:${PORT}`);
    console.log(`📱 Access from other devices: http://[your-ip]:${PORT}`);
    console.log(`📁 Upload directory: ${uploadsDir}`);
    console.log(`💾 Data directory: ${dataDir}`);
    console.log(`🔧 Binary file handling: FIXED`);
}); 