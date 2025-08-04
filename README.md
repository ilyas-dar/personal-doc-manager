# Personal Document Manager

A modern, mobile-friendly web application for managing your personal documents. Access your files from anywhere with a beautiful chat interface and powerful search capabilities.

## Features

- 📁 **File Upload & Management**: Upload PDFs, Excel files, images, and more
- 🔍 **Smart Search**: Search through file names and content
- 💬 **Chat Interface**: Ask questions about your documents
- 📱 **Mobile-Friendly**: Works perfectly on phones and tablets
- 🌐 **Network Access**: Access from any device on your network
- 📊 **File Preview**: View file details and content previews
- 🗑️ **File Management**: Download and delete files easily
- ⚡ **Real-time Updates**: Live updates when files are uploaded or deleted

## Supported File Types

- **PDFs** (.pdf)
- **Excel Files** (.xlsx, .xls)
- **Images** (.jpg, .jpeg, .png, .gif, .webp)
- **Text Files** (.txt)
- **Word Documents** (.doc, .docx)

## Quick Start

### Prerequisites

- Node.js (version 14 or higher)
- npm or yarn

### Installation

1. **Clone or download the project**
   ```bash
   # If you have git installed
   git clone <repository-url>
   cd personal-doc-manager
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Start the server**
   ```bash
   npm start
   ```

4. **Access the application**
   - Open your browser and go to: `http://localhost:3000`
   - To access from other devices on your network, use your computer's IP address: `http://[your-computer-ip]:3000`

## Usage

### Uploading Files

1. Click the "Upload" button in the header
2. Drag and drop files into the upload area or click to browse
3. Files will be automatically processed and indexed

### Searching Files

1. Use the search bar to find files by name or content
2. Or use the chat interface to ask questions like:
   - "Show me all PDF files"
   - "Find documents about work"
   - "Show recent uploads"

### Managing Files

1. Click on any file card to open the preview modal
2. View file details and content preview
3. Download or delete files using the action buttons

### Chat Interface

The chat interface can help you with:
- Finding specific file types
- Showing recent uploads
- Explaining how to use features
- General document management questions

## Network Access

To access your documents from other devices (like your phone):

1. **Find your computer's IP address**:
   - Windows: Open Command Prompt and type `ipconfig`
   - Mac/Linux: Open Terminal and type `ifconfig` or `ip addr`

2. **Access from other devices**:
   - Make sure all devices are on the same WiFi network
   - Open a browser on your phone/tablet
   - Go to: `http://[your-computer-ip]:3000`

## File Storage

- Files are stored in the `uploads/` directory
- Thumbnails are generated for images in the `thumbnails/` directory
- File metadata is stored in `data/files.json`
- All data is stored locally on your device

## Security Features

- File type validation
- File size limits (100MB per file)
- Secure file handling
- Input sanitization

## Development

### Running in Development Mode

```bash
npm run dev
```

This will start the server with nodemon for automatic restarts when you make changes.

### Project Structure

```
personal-doc-manager/
├── server.js              # Main server file
├── package.json           # Dependencies and scripts
├── public/                # Frontend files
│   ├── index.html         # Main HTML file
│   ├── styles.css         # CSS styles
│   └── script.js          # Frontend JavaScript
├── uploads/               # Uploaded files (created automatically)
├── thumbnails/            # Image thumbnails (created automatically)
├── data/                  # Metadata storage (created automatically)
└── README.md              # This file
```

## Troubleshooting

### Port Already in Use
If port 3000 is already in use, you can change it:
```bash
PORT=3001 npm start
```

### File Upload Issues
- Check file size (max 100MB)
- Ensure file type is supported
- Check available disk space

### Network Access Issues
- Ensure firewall allows connections on port 3000
- Check that devices are on the same network
- Try using your computer's IP address instead of localhost

### Performance Tips
- For large file collections, consider organizing files into folders
- Regularly clean up unused files
- Monitor disk space usage

## Customization

### Changing the Port
Edit the `PORT` variable in `server.js`:
```javascript
const PORT = process.env.PORT || 3000; // Change 3000 to your preferred port
```

### Adding New File Types
Edit the `allowedTypes` array in `server.js`:
```javascript
const allowedTypes = [
    'application/pdf',
    'application/vnd.ms-excel',
    // Add your new MIME type here
];
```

### Modifying the UI
- Edit `public/styles.css` for visual changes
- Modify `public/script.js` for functionality changes
- Update `public/index.html` for structure changes

## License

This project is open source and available under the MIT License.

## Support

If you encounter any issues:
1. Check the console for error messages
2. Ensure all dependencies are installed
3. Verify your Node.js version is compatible
4. Check that the required ports are available

---

**Enjoy managing your documents with ease! 📚✨** 