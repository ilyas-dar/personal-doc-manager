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
        '.pdf': 'application/pdf',
        '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        '.xls': 'application/vnd.ms-excel',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.png': 'image/png',
        '.gif': 'image/gif',
        '.webp': 'image/webp',
        '.txt': 'text/plain',
        '.doc': 'application/msword',
        '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
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
function parseMultipartData(body, boundary, contentType) {
    const parts = body.split('--' + boundary);
    const result = {};
    
    for (let part of parts) {
        if (part.includes('Content-Disposition: form-data')) {
            const lines = part.split('\r\n');
            let name = '';
            let filename = '';
            let data = Buffer.alloc(0);
            let isData = false;
            let contentType = '';
            
            for (let i = 0; i < lines.length; i++) {
                const line = lines[i];
                
                if (line.includes('name=')) {
                    name = line.split('name="')[1].split('"')[0];
                }
                if (line.includes('filename=')) {
                    filename = line.split('filename="')[1].split('"')[0];
                }
                if (line.includes('Content-Type:')) {
                    contentType = line.split('Content-Type: ')[1];
                }
                if (line === '') {
                    isData = true;
                    // Collect all remaining data as binary
                    const remainingData = lines.slice(i + 1).join('\r\n');
                    data = Buffer.from(remainingData, 'binary');
                    break;
                }
            }
            
            if (name === 'file' && filename) {
                result.file = {
                    name: filename,
                    data: data,
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
                    const parsed = parseMultipartData(body, boundary, contentType);
                    
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
                    res.end(JSON.stringify({ error: 'Upload failed' }));
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
                const fileStream = fs.createReadStream(filePath);
                res.writeHead(200, {
                    'Content-Type': file.fileType,
                    'Content-Disposition': `attachment; filename="${file.originalName}"`,
                    'Content-Length': file.fileSize
                });
                fileStream.pipe(res);
            } else {
                res.writeHead(404, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'File not found' }));
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
                res.end(JSON.stringify({ success: true }));
            } catch (error) {
                console.error('Delete error:', error);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Delete failed' }));
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