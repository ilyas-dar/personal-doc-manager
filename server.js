const express = require('express');
const multer = require('multer');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const path = require('path');
const fs = require('fs-extra');
const { v4: uuidv4 } = require('uuid');
const mime = require('mime-types');
const pdfParse = require('pdf-parse');
const XLSX = require('xlsx');
const sharp = require('sharp');
const http = require('http');
const socketIo = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Middleware
app.use(helmet());
app.use(compression());
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Create directories
const uploadsDir = path.join(__dirname, 'uploads');
const thumbnailsDir = path.join(__dirname, 'thumbnails');
const dataDir = path.join(__dirname, 'data');

fs.ensureDirSync(uploadsDir);
fs.ensureDirSync(thumbnailsDir);
fs.ensureDirSync(dataDir);

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

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueId = uuidv4();
    const ext = path.extname(file.originalname);
    cb(null, `${uniqueId}${ext}`);
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 100 * 1024 * 1024 // 100MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      'application/pdf',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'image/jpeg',
      'image/png',
      'image/gif',
      'image/webp',
      'text/plain',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ];
    
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('File type not supported'), false);
    }
  }
});

// Extract text from different file types
async function extractText(filePath, fileType) {
  try {
    if (fileType === 'application/pdf') {
      const dataBuffer = fs.readFileSync(filePath);
      const data = await pdfParse(dataBuffer);
      return data.text;
    } else if (fileType.includes('spreadsheet') || fileType.includes('excel')) {
      const workbook = XLSX.readFile(filePath);
      let text = '';
      workbook.SheetNames.forEach(sheetName => {
        const worksheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
        text += jsonData.map(row => row.join(' ')).join(' ') + ' ';
      });
      return text;
    } else if (fileType.startsWith('text/')) {
      return fs.readFileSync(filePath, 'utf8');
    }
    return '';
  } catch (error) {
    console.error('Error extracting text:', error);
    return '';
  }
}

// Generate thumbnail for images
async function generateThumbnail(filePath, filename) {
  try {
    const thumbnailPath = path.join(thumbnailsDir, filename);
    await sharp(filePath)
      .resize(200, 200, { fit: 'inside' })
      .jpeg({ quality: 80 })
      .toFile(thumbnailPath);
    return true;
  } catch (error) {
    console.error('Error generating thumbnail:', error);
    return false;
  }
}

// Routes
app.post('/api/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const fileId = path.parse(req.file.filename).name;
    const fileType = req.file.mimetype;
    const fileSize = req.file.size;
    const originalName = req.file.originalname;

    // Extract text content
    const textContent = await extractText(req.file.path, fileType);

    // Generate thumbnail for images
    let hasThumbnail = false;
    if (fileType.startsWith('image/')) {
      hasThumbnail = await generateThumbnail(req.file.path, req.file.filename);
    }

    // Store metadata
    fileMetadata[fileId] = {
      id: fileId,
      originalName: originalName,
      filename: req.file.filename,
      fileType: fileType,
      fileSize: fileSize,
      uploadDate: new Date().toISOString(),
      textContent: textContent,
      hasThumbnail: hasThumbnail
    };

    saveMetadata();

    // Emit to connected clients
    io.emit('fileUploaded', fileMetadata[fileId]);

    res.json({
      success: true,
      file: fileMetadata[fileId]
    });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: 'Upload failed' });
  }
});

// Get all files
app.get('/api/files', (req, res) => {
  const files = Object.values(fileMetadata);
  res.json(files);
});

// Search files
app.get('/api/search', (req, res) => {
  const query = req.query.q?.toLowerCase();
  if (!query) {
    return res.json([]);
  }

  const results = Object.values(fileMetadata).filter(file => {
    return (
      file.originalName.toLowerCase().includes(query) ||
      file.textContent.toLowerCase().includes(query) ||
      file.fileType.toLowerCase().includes(query)
    );
  });

  res.json(results);
});

// Download file
app.get('/api/download/:fileId', (req, res) => {
  const fileId = req.params.fileId;
  const file = fileMetadata[fileId];
  
  if (!file) {
    return res.status(404).json({ error: 'File not found' });
  }

  const filePath = path.join(uploadsDir, file.filename);
  res.download(filePath, file.originalName);
});

// Delete file
app.delete('/api/files/:fileId', (req, res) => {
  const fileId = req.params.fileId;
  const file = fileMetadata[fileId];
  
  if (!file) {
    return res.status(404).json({ error: 'File not found' });
  }

  try {
    // Delete main file
    const filePath = path.join(uploadsDir, file.filename);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    // Delete thumbnail if exists
    if (file.hasThumbnail) {
      const thumbnailPath = path.join(thumbnailsDir, file.filename);
      if (fs.existsSync(thumbnailPath)) {
        fs.unlinkSync(thumbnailPath);
      }
    }

    // Remove from metadata
    delete fileMetadata[fileId];
    saveMetadata();

    // Emit to connected clients
    io.emit('fileDeleted', fileId);

    res.json({ success: true });
  } catch (error) {
    console.error('Delete error:', error);
    res.status(500).json({ error: 'Delete failed' });
  }
});

// Get file info
app.get('/api/files/:fileId', (req, res) => {
  const fileId = req.params.fileId;
  const file = fileMetadata[fileId];
  
  if (!file) {
    return res.status(404).json({ error: 'File not found' });
  }

  res.json(file);
});

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Serve thumbnails
app.use('/thumbnails', express.static(thumbnailsDir));

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log('Client connected');
  
  socket.on('disconnect', () => {
    console.log('Client disconnected');
  });
});

// Default route
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`Access from other devices on your network:`);
  console.log(`http://[your-phone-ip]:${PORT}`);
}); 