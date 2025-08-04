// Global variables
let currentFiles = [];
let currentView = 'grid';
let selectedFile = null;
let socket = null;

// Initialize the application
document.addEventListener('DOMContentLoaded', function() {
    checkAuthentication();
});

// Authentication functions
async function checkAuthentication() {
    try {
        const response = await fetch('/api/auth-status');
        const data = await response.json();
        
        if (!data.authEnabled) {
            // Auth is disabled, proceed normally
            initializeApp();
            return;
        }
        
        if (!data.authenticated) {
            // Not authenticated, redirect to login
            window.location.href = '/login.html';
            return;
        }
        
        // Authenticated, proceed with app
        initializeApp();
    } catch (error) {
        console.error('Auth check failed:', error);
        // If auth check fails, redirect to login
        window.location.href = '/login.html';
    }
}

async function logout() {
    try {
        await fetch('/api/logout', { method: 'POST' });
        window.location.href = '/login.html';
    } catch (error) {
        console.error('Logout failed:', error);
        // Force redirect anyway
        window.location.href = '/login.html';
    }
}

function initializeApp() {
    initializeSocket();
    loadFiles();
    setupEventListeners();
    setupDragAndDrop();
}

// Initialize Socket.IO connection (simplified version)
function initializeSocket() {
    // Socket.IO removed for simplified version
    console.log('Real-time updates disabled in simplified version');
}

// Setup event listeners
function setupEventListeners() {
    // Search functionality
    const searchInput = document.getElementById('searchInput');
    searchInput.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            performSearch();
        }
    });
    
    // Chat functionality
    const chatInput = document.getElementById('chatInput');
    chatInput.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            sendChatMessage();
        }
    });
    
    // File input change
    const fileInput = document.getElementById('fileInput');
    fileInput.addEventListener('change', function(e) {
        handleFileSelect(e.target.files);
    });
    
    // Upload area click
    const uploadArea = document.getElementById('uploadArea');
    uploadArea.addEventListener('click', function() {
        fileInput.click();
    });
}

// Setup drag and drop
function setupDragAndDrop() {
    const uploadArea = document.getElementById('uploadArea');
    
    uploadArea.addEventListener('dragover', function(e) {
        e.preventDefault();
        uploadArea.classList.add('dragover');
    });
    
    uploadArea.addEventListener('dragleave', function(e) {
        e.preventDefault();
        uploadArea.classList.remove('dragover');
    });
    
    uploadArea.addEventListener('drop', function(e) {
        e.preventDefault();
        uploadArea.classList.remove('dragover');
        const files = e.dataTransfer.files;
        handleFileSelect(files);
    });
}

// Load files from server
async function loadFiles() {
    try {
        const response = await fetch('/api/files');
        const files = await response.json();
        currentFiles = files;
        renderFiles();
    } catch (error) {
        console.error('Error loading files:', error);
        showNotification('Error loading files', 'error');
    }
}

// Render files in the grid
function renderFiles() {
    const filesGrid = document.getElementById('filesGrid');
    
    if (currentFiles.length === 0) {
        filesGrid.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-folder-open"></i>
                <h3>No documents yet</h3>
                <p>Upload your first document to get started!</p>
            </div>
        `;
        return;
    }
    
    filesGrid.innerHTML = currentFiles.map(file => createFileCard(file)).join('');
}

// Create file card HTML
function createFileCard(file) {
    const fileType = getFileType(file.fileType);
    const fileSize = formatFileSize(file.fileSize);
    const uploadDate = new Date(file.uploadDate).toLocaleDateString();
    
    return `
        <div class="file-card ${currentView === 'list' ? 'list-view' : ''}" onclick="openFilePreview('${file.id}')">
            <div class="file-icon ${fileType.class}">
                <i class="${fileType.icon}"></i>
            </div>
            <div class="file-info">
                <div class="file-name" title="${file.originalName}">${file.originalName}</div>
                <div class="file-meta">
                    <span>${fileSize}</span>
                    <span>${uploadDate}</span>
                    <span>${fileType.name}</span>
                </div>
            </div>
        </div>
    `;
}

// Get file type information
function getFileType(mimeType) {
    if (mimeType === 'application/pdf') {
        return { name: 'PDF', class: 'pdf', icon: 'fas fa-file-pdf' };
    } else if (mimeType.includes('spreadsheet') || mimeType.includes('excel')) {
        return { name: 'Excel', class: 'excel', icon: 'fas fa-file-excel' };
    } else if (mimeType.startsWith('image/')) {
        return { name: 'Image', class: 'image', icon: 'fas fa-file-image' };
    } else if (mimeType.startsWith('text/')) {
        return { name: 'Text', class: 'text', icon: 'fas fa-file-alt' };
    } else if (mimeType.includes('word')) {
        return { name: 'Word', class: 'word', icon: 'fas fa-file-word' };
    } else {
        return { name: 'Document', class: 'text', icon: 'fas fa-file' };
    }
}

// Format file size
function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Search functionality
async function performSearch() {
    const query = document.getElementById('searchInput').value.trim();
    if (!query) {
        loadFiles();
        return;
    }
    
    try {
        const response = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
        const results = await response.json();
        currentFiles = results;
        renderFiles();
        
        // Add search message to chat
        addChatMessage('user', `Searching for: "${query}"`);
        addChatMessage('assistant', `Found ${results.length} document(s) matching your search.`);
    } catch (error) {
        console.error('Search error:', error);
        showNotification('Search failed', 'error');
    }
}

// Chat functionality
function sendChatMessage() {
    const chatInput = document.getElementById('chatInput');
    const message = chatInput.value.trim();
    
    if (!message) return;
    
    addChatMessage('user', message);
    chatInput.value = '';
    
    // Process chat message
    processChatMessage(message);
}

// Add message to chat
function addChatMessage(sender, message) {
    const chatMessages = document.getElementById('chatMessages');
    const messageDiv = document.createElement('div');
    messageDiv.className = `chat-message ${sender}`;
    
    const icon = sender === 'user' ? 'fas fa-user' : 'fas fa-robot';
    const bgColor = sender === 'user' ? '#667eea' : '#f7fafc';
    const textColor = sender === 'user' ? 'white' : '#2d3748';
    
    messageDiv.innerHTML = `
        <div style="display: flex; align-items: flex-start; gap: 10px; margin-bottom: 15px;">
            <div style="background: ${bgColor}; color: ${textColor}; width: 35px; height: 35px; border-radius: 50%; display: flex; align-items: center; justify-content: center;">
                <i class="${icon}"></i>
            </div>
            <div style="background: ${bgColor}; color: ${textColor}; padding: 12px 16px; border-radius: 15px; max-width: 80%; word-wrap: break-word;">
                ${message}
            </div>
        </div>
    `;
    
    chatMessages.appendChild(messageDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

// Process chat message
function processChatMessage(message) {
    const lowerMessage = message.toLowerCase();
    
    // Simple chat processing
    if (lowerMessage.includes('pdf') || lowerMessage.includes('pdf files')) {
        const pdfFiles = currentFiles.filter(file => file.fileType === 'application/pdf');
        addChatMessage('assistant', `I found ${pdfFiles.length} PDF file(s) in your documents.`);
    } else if (lowerMessage.includes('excel') || lowerMessage.includes('spreadsheet')) {
        const excelFiles = currentFiles.filter(file => file.fileType.includes('spreadsheet') || file.fileType.includes('excel'));
        addChatMessage('assistant', `I found ${excelFiles.length} Excel file(s) in your documents.`);
    } else if (lowerMessage.includes('image') || lowerMessage.includes('picture')) {
        const imageFiles = currentFiles.filter(file => file.fileType.startsWith('image/'));
        addChatMessage('assistant', `I found ${imageFiles.length} image file(s) in your documents.`);
    } else if (lowerMessage.includes('recent') || lowerMessage.includes('latest')) {
        const recentFiles = currentFiles.slice(0, 5);
        addChatMessage('assistant', `Here are your 5 most recent files: ${recentFiles.map(f => f.originalName).join(', ')}`);
    } else if (lowerMessage.includes('delete') && lowerMessage.includes('file')) {
        addChatMessage('assistant', 'To delete a file, click on it and then use the delete button in the preview modal.');
    } else if (lowerMessage.includes('upload') || lowerMessage.includes('add')) {
        addChatMessage('assistant', 'Click the "Upload" button in the header to add new documents to your collection.');
    } else {
        addChatMessage('assistant', 'I can help you search for files, show recent uploads, or manage your documents. Try asking about PDFs, Excel files, images, or recent uploads.');
    }
}

// File upload functions
function openUploadModal() {
    document.getElementById('uploadModal').style.display = 'block';
}

function closeUploadModal() {
    document.getElementById('uploadModal').style.display = 'none';
    document.getElementById('uploadProgress').style.display = 'none';
    document.getElementById('progressFill').style.width = '0%';
}

function handleFileSelect(files) {
    Array.from(files).forEach(file => {
        uploadFile(file);
    });
}

async function uploadFile(file) {
    const formData = new FormData();
    formData.append('file', file);
    
    // Show progress
    const progressDiv = document.getElementById('uploadProgress');
    const progressFill = document.getElementById('progressFill');
    const progressText = document.getElementById('progressText');
    
    progressDiv.style.display = 'block';
    progressText.textContent = `Uploading ${file.name}...`;
    
    try {
        const response = await fetch('/api/upload', {
            method: 'POST',
            body: formData
        });
        
        if (response.ok) {
            progressFill.style.width = '100%';
            progressText.textContent = 'Upload complete!';
            
            setTimeout(() => {
                closeUploadModal();
            }, 1000);
        } else {
            throw new Error('Upload failed');
        }
    } catch (error) {
        console.error('Upload error:', error);
        progressText.textContent = 'Upload failed';
        showNotification('Upload failed', 'error');
    }
}

// File preview functions
function openFilePreview(fileId) {
    const file = currentFiles.find(f => f.id === fileId);
    if (!file) return;
    
    selectedFile = file;
    const modal = document.getElementById('previewModal');
    const title = document.getElementById('previewTitle');
    const info = document.getElementById('fileInfo');
    
    title.textContent = file.originalName;
    
    const fileType = getFileType(file.fileType);
    const fileSize = formatFileSize(file.fileSize);
    const uploadDate = new Date(file.uploadDate).toLocaleString();
    
    let previewContent = '';
    
    if (file.fileType.startsWith('image/')) {
        previewContent = `
            <img src="/api/download/${file.id}" class="file-preview" alt="${file.originalName}">
        `;
    }
    
    info.innerHTML = `
        ${previewContent}
        <div class="file-details">
            <h4>File Information</h4>
            <p><strong>Name:</strong> ${file.originalName}</p>
            <p><strong>Type:</strong> ${fileType.name}</p>
            <p><strong>Size:</strong> ${fileSize}</p>
            <p><strong>Uploaded:</strong> ${uploadDate}</p>
            ${file.textContent ? `<p><strong>Content Preview:</strong></p><div style="max-height: 100px; overflow-y: auto; background: #f7fafc; padding: 10px; border-radius: 5px; font-size: 12px;">${file.textContent.substring(0, 500)}${file.textContent.length > 500 ? '...' : ''}</div>` : ''}
        </div>
    `;
    
    modal.style.display = 'block';
}

function closePreviewModal() {
    document.getElementById('previewModal').style.display = 'none';
    selectedFile = null;
}

function downloadFile() {
    if (!selectedFile) return;
    
    const link = document.createElement('a');
    link.href = `/api/download/${selectedFile.id}`;
    link.download = selectedFile.originalName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

async function deleteFile() {
    if (!selectedFile) return;
    
    if (!confirm(`Are you sure you want to delete "${selectedFile.originalName}"?`)) {
        return;
    }
    
    try {
        const response = await fetch(`/api/files/${selectedFile.id}`, {
            method: 'DELETE'
        });
        
        if (response.ok) {
            closePreviewModal();
            removeFileFromList(selectedFile.id);
            showNotification('File deleted successfully!', 'success');
        } else {
            throw new Error('Delete failed');
        }
    } catch (error) {
        console.error('Delete error:', error);
        showNotification('Delete failed', 'error');
    }
}

// View toggle functions
function setView(view) {
    currentView = view;
    
    // Update active button
    document.querySelectorAll('.view-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    event.target.classList.add('active');
    
    // Update grid class
    const filesGrid = document.getElementById('filesGrid');
    if (view === 'list') {
        filesGrid.classList.add('list-view');
    } else {
        filesGrid.classList.remove('list-view');
    }
    
    // Re-render files
    renderFiles();
}

// Helper functions
function addFileToList(file) {
    currentFiles.unshift(file);
    renderFiles();
}

function removeFileFromList(fileId) {
    currentFiles = currentFiles.filter(file => file.id !== fileId);
    renderFiles();
}

function showNotification(message, type = 'info') {
    // Create notification element
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: ${type === 'success' ? '#48bb78' : type === 'error' ? '#f56565' : '#4299e1'};
        color: white;
        padding: 15px 20px;
        border-radius: 10px;
        box-shadow: 0 4px 20px rgba(0,0,0,0.2);
        z-index: 1001;
        animation: slideInRight 0.3s ease;
    `;
    notification.textContent = message;
    
    document.body.appendChild(notification);
    
    // Remove after 3 seconds
    setTimeout(() => {
        notification.style.animation = 'slideOutRight 0.3s ease';
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 300);
    }, 3000);
}

// Add CSS animations for notifications
const style = document.createElement('style');
style.textContent = `
    @keyframes slideInRight {
        from { transform: translateX(100%); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
    }
    
    @keyframes slideOutRight {
        from { transform: translateX(0); opacity: 1; }
        to { transform: translateX(100%); opacity: 0; }
    }
`;
document.head.appendChild(style); 