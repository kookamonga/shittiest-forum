class SocialLite {
  constructor() {
    this.selectedFiles = new WeakMap();
    this.fileCache = {};
    this.isResizing = false;
    this.currentPage = 1;
    this.postsPerPage = 50;
    this.totalPages = 1;
    this.activeTopic = null;
    this.init();
  }

  init() {
    if (['ar', 'he', 'fa', 'ur'].includes(navigator.language.split('-')[0])) {
      document.body.classList.add('rtl');
    }
    this.applyStoredTheme();
    this.bindEvents();
    this.setupSidebar();
    this.setupPagination();
    
    // Load settings from localStorage
    const savedPerPage = localStorage.getItem('postsPerPage');
    if (savedPerPage) {
      this.postsPerPage = parseInt(savedPerPage);
      document.getElementById('posts-per-page').value = savedPerPage;
    }
    
    if (window.location.pathname === '/board') {
      this.loadUserInfo();
      this.loadPosts();
      this.loadHeaderGif();
    }
  }

  setupPagination() {
    const prevBtn = document.getElementById('prev-page');
    const nextBtn = document.getElementById('next-page');
    const perPageSelect = document.getElementById('posts-per-page');
    
    if (prevBtn && nextBtn) {
      prevBtn.addEventListener('click', () => {
        if (this.currentPage > 1) {
          this.currentPage--;
          this.loadPosts();
        }
      });
      
      nextBtn.addEventListener('click', () => {
        if (this.currentPage < this.totalPages) {
          this.currentPage++;
          this.loadPosts();
        }
      });
    }
    
    if (perPageSelect) {
      perPageSelect.addEventListener('change', (e) => {
        this.postsPerPage = parseInt(e.target.value);
        localStorage.setItem('postsPerPage', e.target.value);
        this.currentPage = 1;
        this.loadPosts();
      });
    }
  }

  setupSidebar() {
    this.sidebar = document.getElementById('sidebar');
    this.fileContent = document.getElementById('file-content');
    this.modelContainer = document.getElementById('model-container');
    this.closeSidebar = document.getElementById('close-sidebar');
    this.sidebarHandle = document.getElementById('sidebar-handle');
    
    if (this.closeSidebar) {
      this.closeSidebar.addEventListener('click', () => {
        this.sidebar.style.display = 'none';
        this.modelContainer.style.display = 'none';
        this.fileContent.style.display = 'block';
      });
    }
    
    if (this.sidebarHandle) {
      this.sidebarHandle.addEventListener('mousedown', this.startResize.bind(this));
    }
  }

  startResize(e) {
    e.preventDefault();
    this.isResizing = true;
    this.startX = e.clientX;
    this.startWidth = parseInt(document.defaultView.getComputedStyle(this.sidebar).width, 10);
    document.documentElement.classList.add('resizing');
    
    document.addEventListener('mousemove', this.resizeSidebar.bind(this));
    document.addEventListener('mouseup', this.stopResize.bind(this));
  }

  resizeSidebar(e) {
    if (!this.isResizing) return;
    
    const viewportWidth = window.innerWidth;
    const widthDiff = this.startX - e.clientX;
    const newWidth = this.startWidth + widthDiff;
    const minWidth = 300;
    const maxWidth = Math.min(800, viewportWidth * 0.8);
    
    if (newWidth > minWidth && newWidth < maxWidth) {
      this.sidebar.style.width = `${newWidth}px`;
    }
  }

  stopResize() {
    this.isResizing = false;
    document.documentElement.classList.remove('resizing');
    document.removeEventListener('mousemove', this.resizeSidebar);
    document.removeEventListener('mouseup', this.stopResize);
  }

  applyStoredTheme() {
    const savedTheme = localStorage.getItem('theme') || 'light';
    document.documentElement.setAttribute('data-theme', savedTheme);
    console.log(`Applied theme: ${savedTheme}`);
  }

  async loadHeaderGif() {
    const headerGif = document.getElementById('header-gif');
    if (!headerGif) {
      console.error('Header GIF element not found');
      return;
    }

    try {
      console.log('Fetching GIFs from /api/media/gifs');
      const response = await fetch('/api/media/gifs');
      const data = await response.json();
      if (data.success && data.gifs && data.gifs.length > 0) {
        const gif = data.gifs[0];
        console.log('Selected GIF:', gif);
        headerGif.src = `/media/${gif}`;
        headerGif.alt = `Y2K Retro GIF: ${gif}`;
      } else {
        console.warn('No GIFs found, using fallback');
        headerGif.src = '/media/fallback.png';
        headerGif.alt = 'Y2K Fallback Image';
      }
    } catch (error) {
      console.error('Failed to load header GIF:', error.message);
      headerGif.src = '/media/fallback.png';
    }
  }

  bindEvents() {
    if (window.location.pathname === '/') {
      this.bindAuthEvents();
    }
    if (window.location.pathname === '/board') {
      this.bindBoardEvents();
      this.bindThemePickerEvents();
      this.bindFileEvents();
      this.bindTopicEvents();
    }
  }

  bindTopicEvents() {
    document.addEventListener('click', (e) => {
      if (e.target.classList.contains('topic-tag')) {
        const topic = e.target.dataset.topic;
        this.activeTopic = topic;
        this.currentPage = 1;
        this.loadPosts();
        e.preventDefault();
      }
      
      if (e.target.id === 'clear-topic') {
        this.activeTopic = null;
        this.currentPage = 1;
        this.loadPosts();
        e.preventDefault();
      }
    });
  }

  bindFileEvents() {
    document.addEventListener('click', (e) => {
      const fileLink = e.target.closest('.file-link');
      if (fileLink) {
        e.preventDefault();
        const fileId = fileLink.dataset.fileId;
        const file = this.fileCache[fileId];
        if (file) this.handleFileClick(file);
      }
    });
  }

  bindAuthEvents() {
    const loginForm = document.getElementById('login-form');
    const generateForm = document.getElementById('generate-form');
    if (loginForm) loginForm.addEventListener('submit', (e) => this.handleLogin(e));
    if (generateForm) generateForm.addEventListener('submit', (e) => this.handleGenerate(e));
  }

  bindBoardEvents() {
    const postForm = document.getElementById('post-form');
    const logoutBtn = document.getElementById('logout-btn');

    if (postForm) {
      postForm.addEventListener('submit', (e) => this.handlePost(e));
      const fileInput = postForm.querySelector('input[name="files"]');
      const customButton = postForm.querySelector('.custom-file-button');

      // Create topic input
      const topicInput = document.createElement('input');
      topicInput.type = 'text';
      topicInput.name = 'topic';
      topicInput.placeholder = 'Focus (one topic only)';
      topicInput.className = 'topic-input';
      const textarea = postForm.querySelector('textarea');
      textarea.parentNode.insertBefore(topicInput, textarea.nextSibling);

      if (fileInput && customButton) {
        customButton.addEventListener('click', () => fileInput.click());
        fileInput.addEventListener('change', (e) => {
          console.log('Files selected:', Array.from(e.target.files).map(f => f.name));
          this.displaySelectedFiles(e, postForm, 5);
        });
      } else {
        console.error('File input or custom button missing in post form!');
      }

      postForm.addEventListener('click', (e) => {
        if (e.target.classList.contains('file-remove')) {
          const fileItem = e.target.closest('.file-item');
          const index = parseInt(fileItem.dataset.index);
          const selectedFiles = this.selectedFiles.get(postForm) || [];
          console.log(`Removing file at index ${index}: ${selectedFiles[index]?.name}`);
          selectedFiles.splice(index, 1);
          this.selectedFiles.set(postForm, selectedFiles);
          this.displaySelectedFiles({ target: fileInput }, postForm, 5, false);
        }
      });
    }

    if (logoutBtn) {
      logoutBtn.addEventListener('click', (e) => this.handleLogout(e));
    }
  }

  bindThemePickerEvents() {
    const themePickerBtn = document.querySelector('.theme-picker-btn');
    const themeDropdown = document.querySelector('.theme-dropdown');

    if (themePickerBtn && themeDropdown) {
      themePickerBtn.addEventListener('click', () => {
        themeDropdown.classList.toggle('active');
        console.log('Theme picker toggled:', themeDropdown.classList.contains('active') ? 'open' : 'closed');
      });

      // Close dropdown when clicking outside
      document.addEventListener('click', (e) => {
        if (!themePickerBtn.contains(e.target) && !themeDropdown.contains(e.target)) {
          themeDropdown.classList.remove('active');
        }
      });

      // Handle theme selection
      const themeOptions = themeDropdown.querySelectorAll('.theme-option');
      themeOptions.forEach(option => {
        option.addEventListener('click', () => {
          const theme = option.dataset.theme;
          document.documentElement.setAttribute('data-theme', theme);
          localStorage.setItem('theme', theme);
          themeDropdown.classList.remove('active');
          console.log(`Theme changed to: ${theme}`);
        });
      });
    } else {
      console.error('Theme picker button or dropdown not found');
    }
  }

  displaySelectedFiles(event, form, maxFiles, addNewFiles = true) {
    const fileInput = event.target;
    let newFiles = addNewFiles ? Array.from(fileInput.files) : [];
    let fileDisplay = form.querySelector('.file-display');

    // Create file display if it doesn't exist
    if (!fileDisplay) {
      fileDisplay = document.createElement('div');
      fileDisplay.className = 'file-display';
      fileInput.parentElement.appendChild(fileDisplay);
    }

    // Get current selected files
    let selectedFiles = this.selectedFiles.get(form) || [];
    const existingFileNames = new Set(selectedFiles.map(file => file.name));

    if (addNewFiles) {
      // Filter out duplicates
      const uniqueNewFiles = newFiles.filter(file => !existingFileNames.has(file.name));
      // Add new files, respecting max limit
      const filesToAdd = uniqueNewFiles.slice(0, maxFiles - selectedFiles.length);
      selectedFiles = [...selectedFiles, ...filesToAdd];
    }

    // Update the stored list
    this.selectedFiles.set(form, selectedFiles);

    // Sync file input with selectedFiles
    const dataTransfer = new DataTransfer();
    selectedFiles.forEach(file => dataTransfer.items.add(file));
    fileInput.files = dataTransfer.files;

    console.log('Current files:', selectedFiles.map(f => f.name));

    // Update UI
    if (selectedFiles.length > 0) {
      fileDisplay.innerHTML = selectedFiles.map((file, index) => {
        const shortName = file.name.length > 20 ? file.name.substring(0, 17) + '...' : file.name;
        return `
          <div class="file-item" data-index="${index}">
            <span class="file-name">${this.escapeHtml(shortName)}</span>
            <button type="button" class="file-remove btn btn-small btn-danger">x</button>
          </div>
        `;
      }).join('');
    } else {
      fileDisplay.innerHTML = ''; // Clear display if no files
    }
  }

  async handleFileClick(file) {
    console.log('Handling file click:', file.file_name, file.mime_type);
    
    if (file.mime_type === 'text/plain' || 
        file.mime_type === 'text/markdown' || 
        file.file_name.endsWith('.txt') || 
        file.file_name.endsWith('.md')) {
      await this.renderTextFile(file);
    } else if (file.mime_type === 'application/pdf' || file.file_name.endsWith('.pdf')) {
      await this.renderPDFFile(file);
    } else if (file.mime_type === 'image/svg+xml' || file.file_name.endsWith('.svg')) {
      await this.renderSVGFile(file);
    } else if (file.file_name.endsWith('.stl') || file.file_name.endsWith('.obj')) {
      await this.render3DModel(file);
    } else if (file.file_name.endsWith('.kicad_pcb')) {
      await this.renderTextFile(file);
    } else {
      // Open other files in new tab
      window.open(`/files/${file.id}`, '_blank');
    }
  }

  async renderTextFile(file) {
    try {
      const response = await fetch(`/files/${file.id}`);
      const text = await response.text();
      
      if (file.mime_type === 'text/markdown' || file.file_name.endsWith('.md')) {
        this.fileContent.innerHTML = DOMPurify.sanitize(marked.parse(text, { gfm: true, breaks: true }));
      } else {
        this.fileContent.innerHTML = `<pre>${this.escapeHtml(text)}</pre>`;
      }
      
      this.sidebar.style.display = 'flex';
      this.modelContainer.style.display = 'none';
      this.fileContent.style.display = 'block';
      
      // Process LaTeX in the sidebar
      if (window.MathJax) {
        MathJax.typesetPromise([this.fileContent]);
      }
    } catch (error) {
      console.error('Error loading text file:', error);
      this.showMessage('Failed to load file content', 'error');
    }
  }

  async renderPDFFile(file) {
    try {
      const response = await fetch(`/files/${file.id}`);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      
      this.fileContent.innerHTML = `
        <object data="${url}" type="application/pdf" width="100%" height="100%">
          <p>Your browser doesn't support PDFs. <a href="${url}" download="${file.file_name}">Download instead</a></p>
        </object>
      `;
      
      this.sidebar.style.display = 'flex';
      this.modelContainer.style.display = 'none';
      this.fileContent.style.display = 'block';
    } catch (error) {
      console.error('Error loading PDF file:', error);
      this.showMessage('Failed to load PDF file', 'error');
    }
  }

  async renderSVGFile(file) {
    try {
      const response = await fetch(`/files/${file.id}`);
      const svgContent = await response.text();
      
      // Sanitize SVG content
      const cleanSVG = DOMPurify.sanitize(svgContent, { USE_PROFILES: { svg: true, svgFilters: true } });
      
      this.fileContent.innerHTML = cleanSVG;
      this.sidebar.style.display = 'flex';
      this.modelContainer.style.display = 'none';
      this.fileContent.style.display = 'block';
    } catch (error) {
      console.error('Error loading SVG file:', error);
      this.showMessage('Failed to load SVG file', 'error');
    }
  }

  async render3DModel(file) {
    try {
      this.fileContent.style.display = 'none';
      this.modelContainer.style.display = 'block';
      this.modelContainer.innerHTML = '';
      
      this.sidebar.style.display = 'flex';
      
      const response = await fetch(`/files/${file.id}`);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      
      // Set up Three.js scene
      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0xf0f8ff);
      
      const camera = new THREE.PerspectiveCamera(75, this.modelContainer.clientWidth / this.modelContainer.clientHeight, 0.1, 1000);
      camera.position.z = 5;
      
      const renderer = new THREE.WebGLRenderer({ antialias: true });
      renderer.setSize(this.modelContainer.clientWidth, this.modelContainer.clientHeight);
      this.modelContainer.appendChild(renderer.domElement);
      
      // Add lighting
      const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
      scene.add(ambientLight);
      
      const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
      directionalLight.position.set(1, 1, 1);
      scene.add(directionalLight);
      
      // Load model based on file type
      let loader;
      if (file.file_name.endsWith('.stl')) {
        loader = new THREE.STLLoader();
      } else if (file.file_name.endsWith('.obj')) {
        loader = new THREE.OBJLoader();
      } else {
        throw new Error('Unsupported 3D file format');
      }
      
      loader.load(url, (object) => {
        // Center the model
        const box = new THREE.Box3().setFromObject(object);
        const center = box.getCenter(new THREE.Vector3());
        object.position.sub(center);
        
        // Scale the model
        const size = box.getSize(new THREE.Vector3()).length();
        const scale = 5 / size;
        object.scale.set(scale, scale, scale);
        
        scene.add(object);
        
        // Add rotation controls
        const animate = () => {
          requestAnimationFrame(animate);
          object.rotation.x += 0.005;
          object.rotation.y += 0.005;
          renderer.render(scene, camera);
        };
        
        animate();
        
        // Handle window resize
        window.addEventListener('resize', () => {
          camera.aspect = this.modelContainer.clientWidth / this.modelContainer.clientHeight;
          camera.updateProjectionMatrix();
          renderer.setSize(this.modelContainer.clientWidth, this.modelContainer.clientHeight);
        });
      });
    } catch (error) {
      console.error('Error rendering 3D model:', error);
      this.showMessage('Failed to render 3D model', 'error');
    }
  }

  async handleLogin(e) {
    e.preventDefault();
    const formData = new FormData(e.target);
    const privateKey = formData.get('privateKey');
    if (!privateKey) {
      this.showMessage('Please enter your private key', 'error');
      return;
    }
    try {
      const response = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ privateKey })
      });
      const data = await response.json();
      if (data.success) window.location.href = data.redirect;
      else this.showMessage(data.error || 'Login failed', 'error');
    } catch (error) {
      this.showMessage('Network error. Please try again.', 'error');
      console.error('Login error:', error);
    }
  }

  async handleGenerate(e) {
    e.preventDefault();
    const formData = new FormData(e.target);
    const moniker = formData.get('moniker');
    if (!moniker) {
      this.showMessage('Please enter a moniker', 'error');
      return;
    }
    try {
      const response = await fetch('/api/generate-key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ moniker })
      });
      const data = await response.json();
      if (data.success) this.showKeyGenerated(data);
      else this.showMessage(data.error || 'Key generation failed', 'error');
    } catch (error) {
      this.showMessage('Network error. Please try again.', 'error');
      console.error('Generate key error:', error);
    }
  }

  async handlePost(e) {
    e.preventDefault();
    const form = e.target;
    const formData = new FormData(form);
    const content = formData.get('content');
    const topic = formData.get('topic');

    console.log('handlePost: Content:', content);
    console.log('handlePost: Topic:', topic);
    console.log('handlePost: Files:', Array.from(formData.getAll('files')).map(f => f.name));

    if (!content.trim()) {
      this.showMessage('Please enter some content', 'error');
      return;
    }

    try {
      const response = await fetch('/api/post', {
        method: 'POST',
        body: formData
      });
      const data = await response.json();
      if (data.success) {
        form.reset();
        this.selectedFiles.delete(form);
        const fileDisplay = form.querySelector('.file-display');
        if (fileDisplay) fileDisplay.innerHTML = '';
        console.log('Post submitted successfully');
        this.currentPage = 1;
        this.loadPosts();
      } else {
        this.showMessage(data.error || 'Post failed', 'error');
        console.error('Post failed:', data.error);
      }
    } catch (error) {
      this.showMessage('Network error. Please try again.', 'error');
      console.error('Post error:', error);
    }
  }

  async handleComment(postId, content, files) {
    if (!content.trim()) {
      this.showMessage('Please enter a comment', 'error');
      return;
    }

    const formData = new FormData();
    formData.append('postId', postId);
    formData.append('content', content);
    files.forEach(file => formData.append('files', file));

    console.log('handleComment: Post ID:', postId);
    console.log('handleComment: Files:', files.map(f => f.name));

    try {
      const response = await fetch('/api/comment', {
        method: 'POST',
        body: formData
      });
      const data = await response.json();
      if (data.success) {
        this.loadPosts();
        console.log('Comment submitted successfully');
      } else {
        this.showMessage(data.error || 'Comment failed', 'error');
        console.error('Comment failed:', data.error);
      }
    } catch (error) {
      this.showMessage('Network error. Please try again.', 'error');
      console.error('Comment error:', error);
    }
  }

  async handleLogout(e) {
    e.preventDefault();
    try {
      const response = await fetch('/api/logout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      const data = await response.json();
      if (data.success) {
        localStorage.removeItem('theme'); // Clear theme on logout
        window.location.href = data.redirect;
      } else {
        this.showMessage('Logout failed', 'error');
      }
    } catch (error) {
      this.showMessage('Network error. Please try again.', 'error');
      console.error('Logout error:', error);
    }
  }

  async loadUserInfo() {
    try {
      const response = await fetch('/api/user');
      const data = await response.json();
      if (data.moniker) {
        const userInfo = document.getElementById('user-info');
        if (userInfo) {
          userInfo.innerHTML = `
            <span class="user-info">
              ${data.moniker}
              <span class="user-key">${data.publicKey}</span>
            </span>
          `;
        }
      }
    } catch (error) {
      console.error('Failed to load user info:', error);
    }
  }

  async loadPosts() {
    const postsContainer = document.getElementById('posts');
    if (!postsContainer) {
      console.error('Posts container not found');
      return;
    }

    try {
      const url = new URL('/api/posts', window.location.origin);
      url.searchParams.set('page', this.currentPage);
      url.searchParams.set('perPage', this.postsPerPage);
      if (this.activeTopic) {
        url.searchParams.set('topic', this.activeTopic);
      }
      
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
      }
      const data = await response.json();
      
      const posts = data.posts;
      this.totalPages = data.totalPages;
      console.log('Loaded posts with files:', posts.map(p => ({
        id: p.id,
        files: p.files,
        comments: p.comments.map(c => ({ id: c.id, files: c.files }))
      })));
      
      // Update file cache
      this.fileCache = {};
      posts.forEach(post => {
        (post.files || []).forEach(file => this.fileCache[file.id] = file);
        (post.comments || []).forEach(comment => {
          (comment.files || []).forEach(file => this.fileCache[file.id] = file);
        });
      });
      
      postsContainer.innerHTML = posts.map(post => this.renderPost(post)).join('');
      this.bindCommentForms();
      this.bindCommentButtons();
      
      // Update pagination UI
      this.updatePaginationUI();
      
      // Process LaTeX in posts
      if (window.MathJax) {
        MathJax.typesetPromise([postsContainer]);
      }
    } catch (error) {
      postsContainer.innerHTML = '<div class="loading">Failed to load posts</div>';
      console.error('Failed to load posts:', error);
    }
  }

  updatePaginationUI() {
    const pageInfo = document.getElementById('page-info');
    const prevBtn = document.getElementById('prev-page');
    const nextBtn = document.getElementById('next-page');
    
    if (pageInfo) {
      pageInfo.textContent = `Page ${this.currentPage} of ${this.totalPages}`;
    }
    
    if (prevBtn) {
      prevBtn.disabled = this.currentPage <= 1;
    }
    
    if (nextBtn) {
      nextBtn.disabled = this.currentPage >= this.totalPages;
    }
    
    // Show topic filter indicator
    const topicFilter = document.querySelector('.topic-filter');
    if (!topicFilter) {
      const topicContainer = document.querySelector('.user-bar-left');
      if (topicContainer) {
        const filterEl = document.createElement('div');
        filterEl.className = 'topic-filter';
        topicContainer.appendChild(filterEl);
      }
    }
    
    if (this.activeTopic) {
      const filterEl = document.querySelector('.topic-filter');
      if (filterEl) {
        filterEl.innerHTML = `
          <span>Filtering by: <strong>${this.activeTopic}</strong></span>
          <a href="#" id="clear-topic" class="btn btn-small">Clear</a>
        `;
      }
    } else if (document.querySelector('.topic-filter')) {
      document.querySelector('.topic-filter').innerHTML = '';
    }
  }

  renderPost(post) {
    const uniquePostFiles = [];
    const seenFileNames = new Set();
    for (const file of post.files || []) {
      if (!seenFileNames.has(file.file_name)) {
        seenFileNames.add(file.file_name);
        uniquePostFiles.push(file);
      }
    }

    const postFilesHtml = uniquePostFiles.map(file => {
      console.log('Rendering post file:', { id: file.id, file_name: file.file_name, mime_type: file.mime_type });
      if (file.mime_type.startsWith('image/')) {
        return `<a href="#" data-file-id="${file.id}" class="file-link"><img src="/files/${file.id}" class="file-image" alt="${this.escapeHtml(file.file_name)}"></a>`;
      } else {
        const shortName = file.file_name.length > 20 ? file.file_name.substring(0, 17) + '...' : file.file_name;
        return `<a href="#" data-file-id="${file.id}" class="file-link file-button">${this.escapeHtml(shortName)}</a>`;
      }
    }).join('');

    // Render topics as clickable tags
    let topicsHtml = '';
    if (post.topics && post.topics.length > 0) {
      topicsHtml = `
        <div class="post-topics">
          ${post.topics.map(topic => `
            <a href="#" class="topic-tag" data-topic="${this.escapeHtml(topic)}">${this.escapeHtml(topic)}</a>
          `).join('')}
        </div>
      `;
    }

    const commentsHtml = post.comments.map(comment => {
      const uniqueCommentFiles = [];
      const seenCommentFileNames = new Set();
      for (const file of comment.files || []) {
        if (!seenCommentFileNames.has(file.file_name)) {
          seenCommentFileNames.add(file.file_name);
          uniqueCommentFiles.push(file);
        }
      }

      console.log('Rendering comment files for comment ID:', comment.id, uniqueCommentFiles.map(f => ({
        id: f.id,
        file_name: f.file_name,
        mime_type: f.mime_type
      })));

      const commentFilesHtml = uniqueCommentFiles.map(file => {
        if (file.mime_type.startsWith('image/')) {
          return `<a href="#" data-file-id="${file.id}" class="file-link"><img src="/files/${file.id}" class="file-image" alt="${this.escapeHtml(file.file_name)}"></a>`;
        } else {
          const shortName = file.file_name.length > 20 ? file.file_name.substring(0, 17) + '...' : file.file_name;
          return `<a href="#" data-file-id="${file.id}" class="file-link file-button">${this.escapeHtml(shortName)}</a>`;
        }
      }).join('');

      return `
        <div class="comment">
          <div class="comment-header">
            <span>
              <span class="comment-author">${this.escapeHtml(comment.moniker)}</span>
              <span class="comment-key">${comment.public_key}</span>
            </span>
            <span class="comment-time">${this.formatDate(comment.timestamp)}</span>
          </div>
          <div class="comment-content">${this.renderMarkdown(comment.content)}</div>
          ${commentFilesHtml ? `<div class="file-container">${commentFilesHtml}</div>` : ''}
        </div>
      `;
    }).join('');

    return `
      <div class="post">
        <div class="post-header">
          <span>
            <span class="post-author">${this.escapeHtml(post.moniker)}</span>
            <span class="post-key">${post.public_key}</span>
          </span>
          <span class="post-time">${this.formatDate(post.timestamp)}</span>
        </div>
        ${topicsHtml}
        <div class="post-content">${this.renderMarkdown(post.content)}</div>
        ${postFilesHtml ? `<div class="file-container">${postFilesHtml}</div>` : ''}
        ${post.comments.length > 0 ? `<div class="comments">${commentsHtml}</div>` : ''}
        <div class="comment-form">
          <button class="comment-button" data-post-id="${post.id}">Add Comment</button>
          <form class="comment-form-element" data-post-id="${post.id}">
            <textarea name="content" placeholder="Add a comment (Markdown supported)" required></textarea>
            <div class="form-group">
              <button type="button" class="custom-file-button btn btn-small">Choose Files</button>
              <input type="file" name="files" multiple accept="image/*,.pdf,.txt,.zip,.img,.svg,.stl,.obj,.kicad_pcb" style="display: none;">
              <div class="file-display"></div>
            </div>
            <button type="submit" class="btn btn-small">Reply</button>
          </form>
        </div>
      </div>
    `;
  }

  bindCommentForms() {
    const commentForms = document.querySelectorAll('.comment-form-element');
    commentForms.forEach(form => {
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const postId = form.dataset.postId;
        const formData = new FormData(form);
        const content = formData.get('content');
        const selectedFiles = this.selectedFiles.get(form) || [];
        await this.handleComment(postId, content, selectedFiles);
        form.reset();
        this.selectedFiles.delete(form);
        const fileDisplay = form.querySelector('.file-display');
        if (fileDisplay) fileDisplay.innerHTML = '';
        form.classList.remove('active');
        console.log('Comment form submitted and reset');
      });
      const fileInput = form.querySelector('input[name="files"]');
      const customButton = form.querySelector('.custom-file-button');
      if (fileInput && customButton) {
        customButton.addEventListener('click', () => fileInput.click());
        fileInput.addEventListener('change', (e) => {
          console.log('Comment form file input changed, files:', Array.from(e.target.files).map(f => f.name));
          this.displaySelectedFiles(e, form, 5);
        });
      } else {
        console.error('Comment form file input or custom button not found');
      }
      form.addEventListener('click', (e) => {
        if (e.target.classList.contains('file-remove')) {
          const fileItem = e.target.closest('.file-item');
          const index = parseInt(fileItem.dataset.index);
          const selectedFiles = this.selectedFiles.get(form) || [];
          console.log(`Removing file at index ${index}: ${selectedFiles[index]?.name}`);
          selectedFiles.splice(index, 1);
          this.selectedFiles.set(form, selectedFiles);
          this.displaySelectedFiles({ target: fileInput }, form, 5, false);
        }
      });
    });
  }

  bindCommentButtons() {
    const commentButtons = document.querySelectorAll('.comment-button');
    commentButtons.forEach(button => {
      button.addEventListener('click', (e) => {
        const form = e.target.nextElementSibling;
        form.classList.toggle('active');
        e.target.textContent = form.classList.contains('active') ? 'Cancel' : 'Add Comment';
      });
    });
  }

  showKeyGenerated(data) {
    const container = document.querySelector('.auth-container');
    const keyDisplay = document.createElement('div');
    keyDisplay.className = 'key-display';
    keyDisplay.innerHTML = `
      <h4>Account Created Successfully!</h4>
      <div>
        <strong>Moniker:</strong> ${this.escapeHtml(data.moniker)}<br>
        <strong>Public Key:</strong> <span class="user-key">${data.publicKey}</span>
      </div>
      <div class="generated-key">${data.privateKey}</div>
      <div class="key-warning">⚠️ Save your private key! You cannot recover it if lost.</div>
      <button class="btn" onclick="window.location.reload()">Back to Login</button>
    `;
    container.innerHTML = '';
    container.appendChild(keyDisplay);
  }

  showMessage(message, type = 'error') {
    const existingMessage = document.querySelector('.status-message');
    if (existingMessage) existingMessage.remove();
    const messageDiv = document.createElement('div');
    messageDiv.className = `status-message status-${type}`;
    messageDiv.textContent = message;
    const container = document.querySelector('.container');
    container.insertBefore(messageDiv, container.firstChild);
    setTimeout(() => messageDiv.remove(), 5000);
  }

  formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  renderMarkdown(text) {
    return DOMPurify.sanitize(marked.parse(text, { gfm: true, breaks: true }));
  }
}

document.addEventListener('DOMContentLoaded', () => new SocialLite());
