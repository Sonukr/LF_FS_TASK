// ============================================================================
// BACKEND: Node.js + Express + Sequelize ORM
// ============================================================================

const express = require('express');
const { Sequelize, DataTypes } = require('sequelize');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const app = express();
app.use(express.json());

// ============================================================================
// DATABASE CONNECTION
// ============================================================================

const sequelize = new Sequelize('social_media_db', 'root', 'password', {
  host: 'host',
  dialect: 'mysql', 
  logging: console.log
});


// Test connection
sequelize.authenticate()
    .then(() => console.log('✓ Database connected'))
    .catch(err => console.error('✗ Database connection failed:', err));

// ============================================================================
// MODEL DEFINITIONS
// Define Sequelize models based on schema.sql
// ============================================================================

const User = sequelize.define('User', {
    // TODO: define fields based on schema.sql
}, { tableName: 'users', timestamps: true, underscored: true });

const Post = sequelize.define('Post', {
    // TODO: define fields based on schema.sql
}, { tableName: 'posts', timestamps: true, underscored: true });

const Comment = sequelize.define('Comment', {
    // TODO: define fields based on schema.sql
}, { tableName: 'comments', timestamps: true, underscored: true });

const Like = sequelize.define('Like', {
    // TODO: define fields based on schema.sql
}, { tableName: 'likes', timestamps: true, underscored: true });

// ============================================================================
// ASSOCIATIONS
// ============================================================================

// TODO: Define associations here

// ============================================================================
// MIDDLEWARE
// ============================================================================

const authenticateToken = (req, res, next) => {
    // TODO: implement authentication
    next()
};

const errorHandler = (err, req, res, next) => {
    console.error('Error:', err);
    res.status(err.status || 500).json({
        error: err.message || 'Internal server error'
    });
};

// ============================================================================
// USER ENDPOINTS
// ============================================================================

// GET all users
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

// GET user by ID with stats
app.get('/api/users/:id', async (req, res, next) => {
    try {
        const user = await User.findByPk(req.params.id, {
            attributes: { exclude: ['password_hash'] },
            include: [
                {
                    model: Post,
                    as: 'posts',
                    attributes: ['id'],
                    through: { attributes: [] }
                },
                {
                    model: Comment,
                    as: 'comments',
                    attributes: ['id']
                }
            ]
        });

        if (!user) return res.status(404).json({ error: 'User not found' });

        // Calculate stats
        const postsCount = await Post.count({ where: { user_id: user.id } });
        const commentsCount = await Comment.count({ where: { user_id: user.id } });
        const postsLikes = await Post.sum('likes_count', { where: { user_id: user.id } });

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

// CREATE user
app.post('/api/users', async (req, res, next) => {
    try {
        const { username, email, password, bio } = req.body;

        // Validate
        if (!username || !email || !password) {
            return res.status(400).json({ error: 'Username, email, and password required' });
        }

        // Check if user exists
        const exists = await User.findOne({ where: { email } });
        if (exists) return res.status(400).json({ error: 'Email already registered' });

        const hashedPassword = await bcrypt.hash(password, 10);

        const user = await User.create({
            username,
            email,
            password_hash: hashedPassword,
            bio: bio || ''
        });

        res.status(201).json({
            id: user.id,
            username: user.username,
            email: user.email
        });
    } catch (error) {
        next(error);
    }
});

// ============================================================================
// POST ENDPOINTS
// ============================================================================

// GET feed
app.get('/api/posts', async (req, res, next) => {
    try {
        const rows = await Post.findAll({
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
            order: [['created_at', 'DESC']]
        });

        const posts = rows.map(post => ({
            ...post.toJSON(),
            comment_count: post.comments.length
        }));

        res.json({ posts });
    } catch (error) {
        next(error);
    }
});

// GET post by ID with comments
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

        res.json(post);
    } catch (error) {
        next(error);
    }
});

// CREATE post
app.post('/api/posts', async (req, res, next) => {
    try {
        const { title, content, image_url } = req.body;

        if (!title || !content) {
            return res.status(400).json({ error: 'Title and content required' });
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
            content: post.content
        });
    } catch (error) {
        next(error);
    }
});

// UPDATE post
app.put('/api/posts/:id', async (req, res, next) => {
    try {
        const post = await Post.findByPk(req.params.id);

        if (!post) return res.status(404).json({ error: 'Post not found' });
        if (post.user_id !== req.user.id) {
            return res.status(403).json({ error: 'Not authorized' });
        }

        await post.update({
            title: req.body.title || post.title,
            content: req.body.content || post.content
        });

        res.json({ message: 'Post updated' });
    } catch (error) {
        next(error);
    }
});

// DELETE post
app.delete('/api/posts/:id', async (req, res, next) => {
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

// CREATE comment
app.post('/api/posts/:postId/comments', async (req, res, next) => {
    try {
        const { content } = req.body;

        if (!content) {
            return res.status(400).json({ error: 'Content required' });
        }

        const comment = await Comment.create({
            post_id: req.params.postId,
            user_id: req.user.id,
            content
        });

        res.status(201).json({
            id: comment.id,
            content: comment.content
        });
    } catch (error) {
        next(error);
    }
});

// GET comments for post
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

        res.json(comments);
    } catch (error) {
        next(error);
    }
});

// DELETE comment
app.delete('/api/comments/:id', async (req, res, next) => {
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

// LIKE a post
app.post('/api/posts/:postId/like', async (req, res, next) => {
    try {
        // Check if already liked
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

        // Add like
        await Like.create({
            user_id: req.user.id,
            post_id: req.params.postId
        });

        // Update post likes count
        const post = await Post.findByPk(req.params.postId);
        await post.increment('likes_count');

        res.status(201).json({ message: 'Post liked' });
    } catch (error) {
        next(error);
    }
});

// UNLIKE a post
app.delete('/api/posts/:postId/unlike', async (req, res, next) => {
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

        // Update post likes count
        const post = await Post.findByPk(req.params.postId);
        if (post.likes_count > 0) {
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

// GET trending posts (last 7 days)
app.get('/api/trending', async (req, res, next) => {
    try {
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

        const posts = await Post.findAll({
            where: {
                created_at: { [require('sequelize').Op.gte]: sevenDaysAgo }
            },
            include: [
                {
                    model: User,
                    as: 'author',
                    attributes: ['id', 'username']
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

        const result = posts.map(post => ({
            ...post.toJSON(),
            comment_count: post.comments.length
        }));

        res.json(result);
    } catch (error) {
        next(error);
    }
});

// ============================================================================
// SEARCH ENDPOINT
// ============================================================================

// SEARCH posts
app.get('/api/search', async (req, res, next) => {
    try {
        const { q } = req.query;

        if (!q || q.trim().length === 0) {
            return res.status(400).json({ error: 'Search query required' });
        }

        const { Op } = require('sequelize');

        const posts = await Post.findAll({
            where: {
                [Op.or]: [
                    { title: { [Op.like]: `%${q}%` } },
                    { content: { [Op.like]: `%${q}%` } }
                ]
            },
            include: [
                {
                    model: User,
                    as: 'author',
                    attributes: ['username']
                }
            ],
            order: [['created_at', 'DESC']],
            limit: 20
        });

        res.json(posts);
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
