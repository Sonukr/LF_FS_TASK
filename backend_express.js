// ============================================================================
// BACKEND: Node.js + Express + Sequelize ORM
// ============================================================================

const express = require('express');
const { Sequelize, DataTypes, Op } = require('sequelize');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const app = express();
app.use(express.json({ limit: '100kb' }));

// Allow frontend (Vite) to call this API from another origin
app.use((req, res, next) => {
    const origin = process.env.CORS_ORIGIN || 'http://localhost:5173';
    res.header('Access-Control-Allow-Origin', origin);
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
});

// ============================================================================
// DATABASE CONNECTION — credentials from env (never hardcode secrets)
// ============================================================================

const sequelize = new Sequelize(
    process.env.DB_NAME || 'social_media_db',
    process.env.DB_USER || 'root',
    process.env.DB_PASSWORD || '',
    {
        host: process.env.DB_HOST || 'localhost',
        dialect: 'mysql',
        logging: process.env.NODE_ENV === 'production' ? false : console.log
    }
);

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
    console.warn('⚠ JWT_SECRET is not set — set it in .env before deploying');
}

// Test connection
sequelize.authenticate()
    .then(() => console.log('✓ Database connected'))
    .catch(err => console.error('✗ Database connection failed:', err));

// ============================================================================
// MODEL DEFINITIONS — fields match schema.sql
// ============================================================================

// User account profile and credentials
const User = sequelize.define('User', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    username: { type: DataTypes.STRING(50), allowNull: false, unique: true },
    email: { type: DataTypes.STRING(100), allowNull: false, unique: true },
    password_hash: { type: DataTypes.STRING(255), allowNull: false },
    profile_picture_url: { type: DataTypes.STRING(255), allowNull: true },
    bio: { type: DataTypes.TEXT, allowNull: true }
}, { tableName: 'users', timestamps: true, underscored: true });

// Post authored by a user
const Post = sequelize.define('Post', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    user_id: { type: DataTypes.INTEGER, allowNull: false },
    title: { type: DataTypes.STRING(200), allowNull: false },
    content: { type: DataTypes.TEXT, allowNull: false },
    image_url: { type: DataTypes.STRING(255), allowNull: true },
    likes_count: { type: DataTypes.INTEGER, defaultValue: 0 }
}, { tableName: 'posts', timestamps: true, underscored: true });

// Comment on a post
const Comment = sequelize.define('Comment', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    post_id: { type: DataTypes.INTEGER, allowNull: false },
    user_id: { type: DataTypes.INTEGER, allowNull: false },
    content: { type: DataTypes.TEXT, allowNull: false },
    likes_count: { type: DataTypes.INTEGER, defaultValue: 0 }
}, { tableName: 'comments', timestamps: true, underscored: true });

// Like on a post or comment (likes table has no updated_at)
const Like = sequelize.define('Like', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    user_id: { type: DataTypes.INTEGER, allowNull: false },
    post_id: { type: DataTypes.INTEGER, allowNull: true },
    comment_id: { type: DataTypes.INTEGER, allowNull: true }
}, { tableName: 'likes', timestamps: true, underscored: true, updatedAt: false });

// ============================================================================
// ASSOCIATIONS — includes Like relations that were missing
// ============================================================================

// User ↔ Post
User.hasMany(Post, { foreignKey: 'user_id', as: 'posts' });
Post.belongsTo(User, { foreignKey: 'user_id', as: 'author' });

// User ↔ Comment
User.hasMany(Comment, { foreignKey: 'user_id', as: 'comments' });
Comment.belongsTo(User, { foreignKey: 'user_id', as: 'author' });

// Post ↔ Comment
Post.hasMany(Comment, { foreignKey: 'post_id', as: 'comments' });
Comment.belongsTo(Post, { foreignKey: 'post_id', as: 'post' });

// Like relations (FK exists on model but associations were missing)
User.hasMany(Like, { foreignKey: 'user_id', as: 'likes' });
Like.belongsTo(User, { foreignKey: 'user_id', as: 'user' });
Post.hasMany(Like, { foreignKey: 'post_id', as: 'likes' });
Like.belongsTo(Post, { foreignKey: 'post_id', as: 'post' });
Comment.hasMany(Like, { foreignKey: 'comment_id', as: 'likes' });
Like.belongsTo(Comment, { foreignKey: 'comment_id', as: 'comment' });

// ============================================================================
// HELPERS — flatten nested author so frontend can read username at top level
// ============================================================================

const flattenAuthor = (record) => {
    const json = typeof record.toJSON === 'function' ? record.toJSON() : { ...record };
    if (json.author) {
        json.username = json.author.username;
        json.profile_picture_url = json.author.profile_picture_url;
    }
    return json;
};

const signToken = (user) => {
    if (!JWT_SECRET) {
        const err = new Error('Server misconfigured: JWT_SECRET missing');
        err.status = 500;
        throw err;
    }
    return jwt.sign(
        { id: user.id, username: user.username },
        JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );
};

// ============================================================================
// MIDDLEWARE
// ============================================================================

// Verify Bearer JWT and attach req.user (fixes empty auth that crashed protected routes)
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: 'Access token required' });
    }

    if (!JWT_SECRET) {
        return res.status(500).json({ error: 'Server misconfigured: JWT_SECRET missing' });
    }

    jwt.verify(token, JWT_SECRET, (err, payload) => {
        if (err) return res.status(403).json({ error: 'Invalid or expired token' });
        req.user = payload;
        next();
    });
};

const errorHandler = (err, req, res, next) => {
    console.error('Error:', err);
    // Avoid leaking internal details in production
    const message = process.env.NODE_ENV === 'production' && !err.status
        ? 'Internal server error'
        : (err.message || 'Internal server error');
    res.status(err.status || 500).json({ error: message });
};

// ============================================================================
// AUTH ENDPOINTS
// ============================================================================

// Login — was missing; issues JWT so clients can call protected routes
app.post('/api/login', async (req, res, next) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password required' });
        }

        const user = await User.findOne({ where: { email } });
        if (!user) {
            return res.status(401).json({ error: 'Invalid email or password' });
        }

        const valid = await bcrypt.compare(password, user.password_hash);
        if (!valid) {
            return res.status(401).json({ error: 'Invalid email or password' });
        }

        const token = signToken(user);
        res.json({
            token,
            user: {
                id: user.id,
                username: user.username,
                email: user.email,
                profile_picture_url: user.profile_picture_url
            }
        });
    } catch (error) {
        next(error);
    }
});

// ============================================================================
// USER ENDPOINTS
// ============================================================================

// GET all users (never expose password_hash)
app.get('/api/users', async (req, res, next) => {
    try {
        const users = await User.findAll({
            attributes: { exclude: ['password_hash'] },
            limit: 100
        });
        res.json(users);
    } catch (error) {
        next(error);
    }
});

// GET user by ID with stats (removed invalid belongsToMany `through` on hasMany)
app.get('/api/users/:id', async (req, res, next) => {
    try {
        const userId = Number(req.params.id);
        if (Number.isNaN(userId)) {
            return res.status(400).json({ error: 'Invalid user id' });
        }

        const user = await User.findByPk(userId, {
            attributes: { exclude: ['password_hash'] }
        });

        if (!user) return res.status(404).json({ error: 'User not found' });

        // Single-pass counts instead of loading all related rows
        const [postsCount, commentsCount, postsLikes] = await Promise.all([
            Post.count({ where: { user_id: user.id } }),
            Comment.count({ where: { user_id: user.id } }),
            Post.sum('likes_count', { where: { user_id: user.id } })
        ]);

        res.json({
            ...user.toJSON(),
            total_posts: postsCount,
            total_comments: commentsCount,
            total_post_likes: postsLikes || 0
        });
    } catch (error) {
        next(error);
    }
});

// CREATE / register user — also returns token for immediate login
app.post('/api/users', async (req, res, next) => {
    try {
        const { username, email, password, bio } = req.body;

        if (!username || !email || !password) {
            return res.status(400).json({ error: 'Username, email, and password required' });
        }

        if (typeof password !== 'string' || password.length < 6) {
            return res.status(400).json({ error: 'Password must be at least 6 characters' });
        }

        const exists = await User.findOne({
            where: { [Op.or]: [{ email }, { username }] }
        });
        if (exists) {
            return res.status(400).json({ error: 'Email or username already registered' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const user = await User.create({
            username,
            email,
            password_hash: hashedPassword,
            bio: bio || ''
        });

        const token = signToken(user);
        res.status(201).json({
            id: user.id,
            username: user.username,
            email: user.email,
            token
        });
    } catch (error) {
        next(error);
    }
});

// ============================================================================
// POST ENDPOINTS
// ============================================================================

// GET feed with pagination (production-ready for large datasets)
app.get('/api/posts', async (req, res, next) => {
    try {
        const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
        const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 50);
        const offset = (page - 1) * limit;

        const { rows, count } = await Post.findAndCountAll({
            include: [
                {
                    model: User,
                    as: 'author',
                    attributes: ['id', 'username', 'profile_picture_url']
                },
                {
                    model: Comment,
                    as: 'comments',
                    attributes: ['id']
                }
            ],
            order: [['created_at', 'DESC']],
            limit,
            offset,
            distinct: true
        });

        // Flatten author fields to match frontend expectations
        const posts = rows.map(post => {
            const flat = flattenAuthor(post);
            flat.comment_count = post.comments ? post.comments.length : 0;
            delete flat.comments;
            return flat;
        });

        res.json({
            posts,
            pagination: {
                page,
                limit,
                total: count,
                total_pages: Math.ceil(count / limit) || 1
            }
        });
    } catch (error) {
        next(error);
    }
});

// GET post by ID with comments (flattened author on post + comments)
app.get('/api/posts/:id', async (req, res, next) => {
    try {
        const post = await Post.findByPk(req.params.id, {
            include: [
                {
                    model: User,
                    as: 'author',
                    attributes: ['id', 'username', 'profile_picture_url']
                },
                {
                    model: Comment,
                    as: 'comments',
                    include: [
                        {
                            model: User,
                            as: 'author',
                            attributes: ['id', 'username', 'profile_picture_url']
                        }
                    ]
                }
            ]
        });

        if (!post) return res.status(404).json({ error: 'Post not found' });

        const result = flattenAuthor(post);
        result.comments = (result.comments || []).map(flattenAuthor);
        result.comment_count = result.comments.length;
        res.json(result);
    } catch (error) {
        next(error);
    }
});

// CREATE post (auth required)
app.post('/api/posts', authenticateToken, async (req, res, next) => {
    try {
        const { title, content, image_url } = req.body;

        if (!title || !content) {
            return res.status(400).json({ error: 'Title and content required' });
        }

        if (title.length > 200) {
            return res.status(400).json({ error: 'Title must be 200 characters or fewer' });
        }

        const post = await Post.create({
            user_id: req.user.id,
            title,
            content,
            image_url: image_url || null
        });

        res.status(201).json({
            id: post.id,
            title: post.title,
            content: post.content,
            user_id: post.user_id,
            created_at: post.created_at
        });
    } catch (error) {
        next(error);
    }
});

// UPDATE post (auth + ownership)
app.put('/api/posts/:id', authenticateToken, async (req, res, next) => {
    try {
        const post = await Post.findByPk(req.params.id);

        if (!post) return res.status(404).json({ error: 'Post not found' });
        if (post.user_id !== req.user.id) {
            return res.status(403).json({ error: 'Not authorized' });
        }

        await post.update({
            title: req.body.title || post.title,
            content: req.body.content || post.content,
            image_url: req.body.image_url !== undefined ? req.body.image_url : post.image_url
        });

        res.json({ message: 'Post updated', post });
    } catch (error) {
        next(error);
    }
});

// DELETE post (auth + ownership)
app.delete('/api/posts/:id', authenticateToken, async (req, res, next) => {
    try {
        const post = await Post.findByPk(req.params.id);

        if (!post) return res.status(404).json({ error: 'Post not found' });
        if (post.user_id !== req.user.id) {
            return res.status(403).json({ error: 'Not authorized' });
        }

        await post.destroy();
        res.json({ message: 'Post deleted' });
    } catch (error) {
        next(error);
    }
});

// ============================================================================
// COMMENT ENDPOINTS
// ============================================================================

// CREATE comment (auth required)
app.post('/api/posts/:postId/comments', authenticateToken, async (req, res, next) => {
    try {
        const { content } = req.body;

        if (!content || !String(content).trim()) {
            return res.status(400).json({ error: 'Content required' });
        }

        const post = await Post.findByPk(req.params.postId);
        if (!post) return res.status(404).json({ error: 'Post not found' });

        const comment = await Comment.create({
            post_id: req.params.postId,
            user_id: req.user.id,
            content: String(content).trim()
        });

        res.status(201).json({
            id: comment.id,
            content: comment.content,
            user_id: comment.user_id,
            post_id: comment.post_id
        });
    } catch (error) {
        next(error);
    }
});

// GET comments for post (flattened author fields for UI)
app.get('/api/posts/:postId/comments', async (req, res, next) => {
    try {
        const comments = await Comment.findAll({
            where: { post_id: req.params.postId },
            include: [
                {
                    model: User,
                    as: 'author',
                    attributes: ['id', 'username', 'profile_picture_url']
                }
            ],
            order: [['created_at', 'DESC']]
        });

        res.json(comments.map(flattenAuthor));
    } catch (error) {
        next(error);
    }
});

// DELETE comment (auth + ownership)
app.delete('/api/comments/:id', authenticateToken, async (req, res, next) => {
    try {
        const comment = await Comment.findByPk(req.params.id);

        if (!comment) return res.status(404).json({ error: 'Comment not found' });
        if (comment.user_id !== req.user.id) {
            return res.status(403).json({ error: 'Not authorized' });
        }

        await comment.destroy();
        res.json({ message: 'Comment deleted' });
    } catch (error) {
        next(error);
    }
});

// ============================================================================
// LIKE ENDPOINTS
// ============================================================================

// LIKE a post (auth required)
app.post('/api/posts/:postId/like', authenticateToken, async (req, res, next) => {
    try {
        const post = await Post.findByPk(req.params.postId);
        if (!post) return res.status(404).json({ error: 'Post not found' });

        const existingLike = await Like.findOne({
            where: {
                user_id: req.user.id,
                post_id: req.params.postId,
                comment_id: null
            }
        });

        if (existingLike) {
            return res.status(400).json({ error: 'Already liked' });
        }

        await Like.create({
            user_id: req.user.id,
            post_id: req.params.postId
        });

        await post.increment('likes_count');
        res.status(201).json({ message: 'Post liked' });
    } catch (error) {
        next(error);
    }
});

// UNLIKE a post (auth required)
app.delete('/api/posts/:postId/unlike', authenticateToken, async (req, res, next) => {
    try {
        const like = await Like.findOne({
            where: {
                user_id: req.user.id,
                post_id: req.params.postId,
                comment_id: null
            }
        });

        if (!like) return res.status(404).json({ error: 'Like not found' });

        await like.destroy();

        const post = await Post.findByPk(req.params.postId);
        if (post && post.likes_count > 0) {
            await post.decrement('likes_count');
        }

        res.json({ message: 'Post unliked' });
    } catch (error) {
        next(error);
    }
});

// ============================================================================
// TRENDING ENDPOINTS
// ============================================================================

// GET trending posts (last 7 days) — Op imported at top (no inline require)
app.get('/api/trending', async (req, res, next) => {
    try {
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

        const posts = await Post.findAll({
            where: {
                created_at: { [Op.gte]: sevenDaysAgo }
            },
            include: [
                {
                    model: User,
                    as: 'author',
                    attributes: ['id', 'username', 'profile_picture_url']
                },
                {
                    model: Comment,
                    as: 'comments',
                    attributes: ['id']
                }
            ],
            order: [['likes_count', 'DESC']],
            limit: 20
        });

        const result = posts.map(post => {
            const flat = flattenAuthor(post);
            flat.comment_count = post.comments ? post.comments.length : 0;
            delete flat.comments;
            return flat;
        });

        res.json(result);
    } catch (error) {
        next(error);
    }
});

// ============================================================================
// SEARCH ENDPOINT
// ============================================================================

// SEARCH posts — Op imported at top; escape LIKE wildcards from user input
app.get('/api/search', async (req, res, next) => {
    try {
        const { q } = req.query;

        if (!q || q.trim().length === 0) {
            return res.status(400).json({ error: 'Search query required' });
        }

        if (q.length > 100) {
            return res.status(400).json({ error: 'Search query too long' });
        }

        const safe = q.trim().replace(/[%_]/g, '\\$&');

        const posts = await Post.findAll({
            where: {
                [Op.or]: [
                    { title: { [Op.like]: `%${safe}%` } },
                    { content: { [Op.like]: `%${safe}%` } }
                ]
            },
            include: [
                {
                    model: User,
                    as: 'author',
                    attributes: ['id', 'username', 'profile_picture_url']
                }
            ],
            order: [['created_at', 'DESC']],
            limit: 20
        });

        res.json(posts.map(flattenAuthor));
    } catch (error) {
        next(error);
    }
});

// ============================================================================
// ERROR HANDLING
// ============================================================================

app.use(errorHandler);

// ============================================================================
// SYNC DATABASE AND START SERVER
// ============================================================================

const PORT = process.env.PORT || 3000;

sequelize.sync({ alter: false })
    .then(() => {
        app.listen(PORT, () => {
            console.log(`✓ Server running on http://localhost:${PORT}`);
        });
    })
    .catch(err => {
        console.error('✗ Failed to sync database:', err);
    });

module.exports = app;
