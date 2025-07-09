const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');
const session = require('express-session');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const multer = require('multer');

const app = express();
const port = process.env.PORT || 3000;

// Check for 'local' command-line argument
const isLocal = process.argv.includes('local');
const host = isLocal ? '0.0.0.0' : 'localhost';

// Directories
const dbDir = path.join(__dirname, 'db');
const uploadsDir = path.join(__dirname, 'db', 'uploads');
const mediaDir = path.join(__dirname, 'public', 'media');
if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir);
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
if (!fs.existsSync(mediaDir)) fs.mkdirSync(mediaDir, { recursive: true });

// Multer setup for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    console.log('Multer destination: Saving to', uploadsDir);
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const uniqueName = `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${ext}`;
    console.log('Multer filename:', uniqueName);
    cb(null, uniqueName);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    console.log('Multer fileFilter: Processing file', file.originalname, file.mimetype);
    cb(null, true);
  }
});

// Database setup
const db = new sqlite3.Database(path.join(dbDir, 'database.sqlite'), (err) => {
  if (err) console.error('Database connection error:', err.message);
  console.log('Connected to SQLite database.');
});

db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    moniker TEXT NOT NULL,
    public_key TEXT UNIQUE NOT NULL,
    private_key_hash TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS posts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    content TEXT NOT NULL,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    post_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    content TEXT NOT NULL,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (post_id) REFERENCES posts(id),
    FOREIGN KEY (user_id) REFERENCES users(id)
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS files (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    post_id INTEGER,
    comment_id INTEGER,
    file_name TEXT NOT NULL,
    file_path TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (post_id) REFERENCES posts(id),
    FOREIGN KEY (comment_id) REFERENCES comments(id)
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS topics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS post_topics (
    post_id INTEGER NOT NULL,
    topic_id INTEGER NOT NULL,
    PRIMARY KEY (post_id, topic_id),
    FOREIGN KEY (post_id) REFERENCES posts(id),
    FOREIGN KEY (topic_id) REFERENCES topics(id)
  )`);
});

// Middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
  secret: 'social-lite-y2k-secret-key',
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 24 * 60 * 60 * 1000,
    secure: false,
    httpOnly: true
  }
}));

app.use((err, req, res, next) => {
  console.error('Global error handler:', err.stack);
  if (err instanceof multer.MulterError) {
    return res.status(400).json({ error: `Multer error: ${err.message}`, code: err.code });
  }
  res.status(500).json({ error: 'Internal server error', details: err.message });
});

// Routes
app.get('/files/:fileId', (req, res) => {
  const fileId = req.params.fileId;
  db.get(
    `SELECT file_name, file_path, mime_type FROM files WHERE id = ?`,
    [fileId],
    (err, file) => {
      if (err || !file) {
        console.error('Error fetching file:', err?.message || 'File not found', { fileId });
        return res.status(404).send('File not found');
      }
      console.log('Serving file:', { fileId, file_path: file.file_path, mime_type: file.mime_type });
      res.setHeader('Content-Type', file.mime_type);
      const disposition = file.mime_type.startsWith('image/') ? 'inline' : `attachment; filename="${file.file_name}"`;
      res.setHeader('Content-Disposition', disposition);
      res.sendFile(path.join(__dirname, file.file_path), (err) => {
        if (err) {
          console.error('Error sending file:', err.message, { fileId, file_path: file.file_path });
          res.status(500).json({ error: 'Error serving file' });
        }
      });
    }
  );
});

app.get('/api/media/gifs', (req, res) => {
  fs.readdir(mediaDir, (err, files) => {
    if (err) {
      console.error('Error reading media directory:', err.message);
      return res.status(500).json({ error: 'Unable to read media directory' });
    }
    const gifs = files.filter(file => file.toLowerCase().endsWith('.gif'));
    res.json({ success: true, gifs });
  });
});

function generatePublicKey() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let key = '';
  for (let i = 0; i < 9; i++) {
    key += chars.charAt(Math.floor(Math.random() * chars.length));
    if (i === 2 || i === 5) key += '-';
  }
  return key;
}

function generatePrivateKey() {
  const bytes = crypto.randomBytes(32);
  return bytes.toString('base64url');
}

function requireAuth(req, res, next) {
  if (req.session.userId) {
    console.log('Authenticated user ID:', req.session.userId);
    return next();
  }
  console.log('Unauthenticated request, redirecting to /');
  res.redirect('/');
}

app.get('/', (req, res) => {
  if (req.session.userId) {
    return res.redirect('/board');
  }
  res.sendFile(path.join(__dirname, 'views', 'auth.html'));
});

app.get('/board', requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'index.html'));
});

app.get('/api/user', requireAuth, (req, res) => {
  db.get(
    `SELECT moniker, public_key FROM users WHERE id = ?`,
    [req.session.userId],
    (err, user) => {
      if (err || !user) {
        console.error('Error fetching user:', err?.message || 'User not found');
        return res.status(500).json({ error: 'User not found' });
      }
      res.json({
        moniker: user.moniker,
        publicKey: user.public_key
      });
    }
  );
});

app.get('/api/posts', (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const perPage = parseInt(req.query.perPage) || 50;
  const offset = (page - 1) * perPage;
  const topic = req.query.topic;

  let query = `
    SELECT 
      p.id, 
      p.content, 
      p.timestamp, 
      u.moniker, 
      u.public_key,
      t.name as topic
    FROM posts p
    JOIN users u ON p.user_id = u.id
    LEFT JOIN post_topics pt ON p.id = pt.post_id
    LEFT JOIN topics t ON pt.topic_id = t.id
  `;
  let countQuery = `SELECT COUNT(DISTINCT p.id) as total FROM posts p`;
  let params = [];
  let countParams = [];

  if (topic) {
    query += ` WHERE t.name = ?`;
    countQuery += ` JOIN post_topics pt ON p.id = pt.post_id JOIN topics t ON pt.topic_id = t.id WHERE t.name = ?`;
    params = [topic, perPage, offset];
    countParams = [topic];
  } else {
    params = [perPage, offset];
  }

  query += ` GROUP BY p.id ORDER BY p.timestamp DESC LIMIT ? OFFSET ?`;

  console.log('Executing posts query:', query, 'with params:', params);

  db.get(countQuery, countParams, (err, countResult) => {
    if (err) {
      console.error('Error fetching post count:', err.message);
      return res.status(500).json({ error: 'Database error fetching post count', details: err.message });
    }

    const total = countResult.total;
    const totalPages = Math.ceil(total / perPage);

    db.all(query, params, (err, posts) => {
      if (err) {
        console.error('Error fetching posts:', err.message);
        return res.status(500).json({ error: 'Database error fetching posts', details: err.message });
      }

      posts.forEach(post => {
        post.topics = post.topic ? [post.topic] : [];
      });

      db.all(`
        SELECT 
          c.id, 
          c.content, 
          c.timestamp, 
          c.post_id, 
          u.moniker, 
          u.public_key
        FROM comments c
        JOIN users u ON c.user_id = u.id
        ORDER BY c.timestamp ASC
      `, [], (err, comments) => {
        if (err) {
          console.error('Error fetching comments:', err.message);
          return res.status(500).json({ error: 'Database error fetching comments', details: err.message });
        }

        db.all(`
          SELECT 
            id, 
            post_id, 
            comment_id, 
            file_name, 
            file_path, 
            mime_type
          FROM files
        `, [], (err, files) => {
          if (err) {
            console.error('Error fetching files:', err.message);
            return res.status(500).json({ error: 'Database error fetching files', details: err.message });
          }

          const postsWithComments = posts.map(post => ({
            ...post,
            comments: comments.filter(comment => comment.post_id === post.id).map(comment => ({
              ...comment,
              files: files.filter(file => file.comment_id === comment.id).map(file => ({
                id: file.id,
                file_name: file.file_name,
                mime_type: file.mime_type
              }))
            })),
            files: files.filter(file => file.post_id === post.id).map(file => ({
              id: file.id,
              file_name: file.file_name,
              mime_type: file.mime_type
            }))
          }));

          console.log('Posts fetched successfully:', postsWithComments.length);
          res.json({
            posts: postsWithComments,
            total,
            totalPages
          });
        });
      });
    });
  });
});

app.post('/api/generate-key', async (req, res) => {
  const { moniker } = req.body;

  if (!moniker || moniker.trim().length === 0) {
    return res.status(400).json({ error: 'Moniker is required' });
  }

  const publicKey = generatePublicKey();
  const privateKey = generatePrivateKey();

  try {
    const privateKeyHash = await bcrypt.hash(privateKey, 12);

    db.run(
      `INSERT INTO users (moniker, public_key, private_key_hash) VALUES (?, ?, ?)`,
      [moniker.trim(), publicKey, privateKeyHash],
      function(err) {
        if (err) {
          if (err.message.includes('UNIQUE constraint failed')) {
            console.error('Unique constraint failed (public_key):', err.message);
            return res.status(400).json({ error: 'Public key conflict (try again)' });
          }
          console.error('Database error during user insertion:', err.message);
          return res.status(500).json({ error: 'Database error' });
        }

        res.json({
          success: true,
          moniker: moniker.trim(),
          publicKey,
          privateKey
        });
      }
    );
  } catch (err) {
    console.error('Server error during key generation:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/login', async (req, res) => {
  const { privateKey } = req.body;

  if (!privateKey || privateKey.trim().length === 0) {
    console.log('Login failed: No private key provided');
    return res.status(400).json({ error: 'Private key is required' });
  }

  try {
    db.all(`SELECT id, moniker, private_key_hash FROM users`, [], async (err, users) => {
      if (err) {
        console.error('Database error fetching users:', err.message);
        return res.status(500).json({ error: 'Database error' });
      }

      if (!users || users.length === 0) {
        console.log('No users found in database');
        return res.status(401).json({ error: 'Invalid private key' });
      }

      const comparisons = users.map(user =>
        bcrypt.compare(privateKey.trim(), user.private_key_hash)
          .then(match => ({ match, user }))
          .catch(err => {
            console.error(`Error comparing key for user ${user.moniker}:`, err.message);
            return { match: false, user };
          })
      );

      const results = await Promise.all(comparisons);

      const matchedUser = results.find(result => result.match)?.user;

      if (matchedUser) {
        console.log('Private key matched for user:', matchedUser.moniker);
        req.session.userId = matchedUser.id;
        req.session.moniker = matchedUser.moniker;
        return res.json({ success: true, redirect: '/board' });
      }

      console.log('No matching private key found');
      res.status(401).json({ error: 'Invalid private key' });
    });
  } catch (err) {
    console.error('Server error during login:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

async function processTopic(postId, topic) {
  if (!topic || topic.trim().length === 0) return;
  
  try {
    // Insert topic if it doesn't exist
    await new Promise((resolve, reject) => {
      db.run(
        `INSERT OR IGNORE INTO topics (name) VALUES (?)`,
        [topic.trim()],
        (err) => {
          if (err) {
            console.error('Error inserting topic:', err.message);
            reject(err);
          } else {
            resolve();
          }
        }
      );
    });
    
    // Get topic ID
    const topicRow = await new Promise((resolve, reject) => {
      db.get(`SELECT id FROM topics WHERE name = ?`, [topic.trim()], (err, row) => {
        if (err) {
          console.error('Error fetching topic ID:', err.message);
          reject(err);
        } else {
          resolve(row);
        }
      });
    });
    
    if (!topicRow) {
      throw new Error('Topic not found after insertion');
    }
    
    // Check if a topic is already associated with this post
    const existingTopic = await new Promise((resolve, reject) => {
      db.get(`SELECT topic_id FROM post_topics WHERE post_id = ?`, [postId], (err, row) => {
        if (err) {
          console.error('Error checking existing topic:', err.message);
          reject(err);
        } else {
          resolve(row);
        }
      });
    });

    if (existingTopic) {
      throw new Error('Post already has a topic assigned');
    }

    // Insert into post_topics
    await new Promise((resolve, reject) => {
      db.run(
        `INSERT OR IGNORE INTO post_topics (post_id, topic_id) VALUES (?, ?)`,
        [postId, topicRow.id],
        (err) => {
          if (err) {
            console.error('Error inserting post_topic:', err.message);
            reject(err);
          } else {
            resolve();
          }
        }
      );
    });
  } catch (err) {
    throw err;
  }
}

app.post('/api/post', [requireAuth, upload.array('files', 5)], async (req, res, next) => {
  try {
    console.log('POST /api/post received:', {
      content: req.body.content,
      topic: req.body.topic,
      files: req.files ? req.files.map(f => ({ name: f.originalname, mimetype: f.mimetype, path: f.path })) : []
    });

    const { content, topic } = req.body;
    const files = req.files;

    if (!content || content.trim().length === 0) {
      console.log('Post failed: No content provided');
      return res.status(400).json({ error: 'Post content is required' });
    }

    db.run(
      `INSERT INTO posts (user_id, content) VALUES (?, ?)`,
      [req.session.userId, content.trim()],
      async function(err) {
        if (err) {
          console.error('Database error creating post:', err.message);
          return res.status(500).json({ error: 'Database error creating post' });
        }

        const postId = this.lastID;
        console.log('Post created with ID:', postId);

        try {
          if (topic && topic.trim().length > 0) {
            await processTopic(postId, topic);
          }
        } catch (err) {
          console.error('Error processing topic:', err.message);
          return res.status(400).json({ error: err.message || 'Database error processing topic' });
        }

        if (files && files.length > 0) {
          const fileInserts = files.map(file => {
            return new Promise((resolve, reject) => {
              const relativePath = path.join('db', 'uploads', file.filename);
              console.log('Inserting file into database:', {
                post_id: postId,
                file_name: file.originalname,
                file_path: relativePath,
                mime_type: file.mimetype,
                file_size: file.size
              });
              db.run(
                `INSERT INTO files (post_id, file_name, file_path, mime_type) VALUES (?, ?, ?, ?)`,
                [postId, file.originalname, relativePath, file.mimetype],
                (err) => {
                  if (err) {
                    console.error('Error inserting file:', err.message, {
                      post_id: postId,
                      file_name: file.originalname
                    });
                    reject(err);
                  } else {
                    fs.access(path.join(__dirname, relativePath), fs.constants.F_OK, (fsErr) => {
                      if (fsErr) {
                        console.error('File not found in file system:', relativePath, fsErr.message);
                      } else {
                        console.log('File confirmed in file system:', relativePath);
                      }
                      resolve();
                    });
                  }
                }
              );
            });
          });

          Promise.all(fileInserts)
            .then(() => {
              console.log('Post and files created successfully by user ID:', req.session.userId);
              res.json({ success: true });
            })
            .catch(err => {
              console.error('Database error saving files:', err.message);
              res.status(500).json({ error: 'Database error saving files' });
            });
        } else {
          console.log('Post created successfully by user ID:', req.session.userId);
          res.json({ success: true });
        }
      }
    );
  } catch (err) {
    console.error('Error in /api/post:', err.message);
    next(err);
  }
});

app.post('/api/comment', [requireAuth, upload.array('files', 5)], async (req, res, next) => {
  try {
    console.log('POST /api/comment received:', {
      postId: req.body.postId,
      content: req.body.content,
      files: req.files ? req.files.map(f => ({ name: f.originalname, mimetype: f.mimetype, path: f.path })) : []
    });

    const { postId, content } = req.body;
    const files = req.files;

    if (!content || content.trim().length === 0) {
      console.log('Comment failed: No content provided');
      return res.status(400).json({ error: 'Comment content is required' });
    }

    if (!postId || isNaN(postId)) {
      console.log('Comment failed: Invalid post ID');
      return res.status(400).json({ error: 'Valid post ID is required' });
    }

    db.run(
      `INSERT INTO comments (post_id, user_id, content) VALUES (?, ?, ?)`,
      [postId, req.session.userId, content.trim()],
      function(err) {
        if (err) {
          console.error('Database error creating comment:', err.message);
          return res.status(500).json({ error: 'Database error creating comment' });
        }

        const commentId = this.lastID;
        console.log('Comment created with ID:', commentId);

        if (files && files.length > 0) {
          const fileInserts = files.map(file => {
            return new Promise((resolve, reject) => {
              const relativePath = path.join('db', 'uploads', file.filename);
              console.log('Inserting file into database:', {
                comment_id: commentId,
                file_name: file.originalname,
                file_path: relativePath,
                mime_type: file.mimetype,
                file_size: file.size
              });
              db.run(
                `INSERT INTO files (comment_id, file_name, file_path, mime_type) VALUES (?, ?, ?, ?)`,
                [commentId, file.originalname, relativePath, file.mimetype],
                (err) => {
                  if (err) {
                    console.error('Error inserting file:', err.message, {
                      comment_id: commentId,
                      file_name: file.originalname
                    });
                    reject(err);
                  } else {
                    fs.access(path.join(__dirname, relativePath), fs.constants.F_OK, (fsErr) => {
                      if (fsErr) {
                        console.error('File not found in file system:', relativePath, fsErr.message);
                      } else {
                        console.log('File confirmed in file system:', relativePath);
                      }
                      resolve();
                    });
                  }
                }
              );
            });
          });

          Promise.all(fileInserts)
            .then(() => {
              console.log('Comment and files created successfully for post ID:', postId);
              res.json({ success: true });
            })
            .catch(err => {
              console.error('Database error saving files:', err.message);
              res.status(500).json({ error: 'Database error saving files' });
            });
        } else {
          console.log('Comment created successfully for post ID:', postId);
          res.json({ success: true });
        }
      }
    );
  } catch (err) {
    console.error('Error in /api/comment:', err.message);
    next(err);
  }
});

app.post('/api/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error('Logout failed:', err.message);
      return res.status(500).json({ error: 'Logout failed' });
    }
    console.log('User logged out successfully');
    res.json({ success: true, redirect: '/' });
  });
});

app.listen(port, host, () => {
  console.log(`Silica Social running at http://${host}:${port}`);
  console.log('💾 Database: SQLite');
  console.log('🎨 Style: Y2K af');
});