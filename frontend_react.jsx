// ============================================================================
// FRONTEND: React Social Media App
// ============================================================================

import React, { useState, useEffect } from 'react';
import axios from 'axios';

// Prefer Vite env var so API URL is not hardcoded per environment
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

// Shared axios instance with auth header attached when a token exists
const api = axios.create({ baseURL: API_BASE_URL });

api.interceptors.request.use((config) => {
    const token = localStorage.getItem('token');
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
});

// Read human-friendly error text from API or network failures
const getErrorMessage = (error, fallback = 'Something went wrong') => {
    return error?.response?.data?.error || error?.message || fallback;
};

// Safe avatar when profile picture is missing
const Avatar = ({ src, alt, size = 40 }) => (
    <img
        src={src || `https://robohash.org/${encodeURIComponent(alt || 'user')}`}
        alt={alt || 'user'}
        style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', background: '#e5e7eb' }}
        onError={(e) => {
            e.target.onerror = null;
            e.target.src = `https://robohash.org/${encodeURIComponent(alt || 'user')}`;
        }}
    />
);

// ============================================================================
// 1. AUTH COMPONENT — login / register (was missing)
// ============================================================================
const AuthForm = ({ onAuthSuccess }) => {
    const [mode, setMode] = useState('login');
    const [username, setUsername] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        try {
            if (mode === 'login') {
                const { data } = await api.post('/login', { email, password });
                localStorage.setItem('token', data.token);
                localStorage.setItem('user', JSON.stringify(data.user));
                onAuthSuccess(data.user);
            } else {
                const { data } = await api.post('/users', { username, email, password });
                localStorage.setItem('token', data.token);
                localStorage.setItem('user', JSON.stringify({
                    id: data.id,
                    username: data.username,
                    email: data.email
                }));
                onAuthSuccess({ id: data.id, username: data.username, email: data.email });
            }
        } catch (err) {
            setError(getErrorMessage(err, mode === 'login' ? 'Login failed' : 'Registration failed'));
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="auth-form">
            <h2>{mode === 'login' ? 'Log in' : 'Create account'}</h2>
            <p className="hint">
                Seed users use non-bcrypt hashes — register a new account to try auth end to end.
            </p>
            {error && <div className="error-banner">{error}</div>}
            <form onSubmit={handleSubmit}>
                {mode === 'register' && (
                    <input
                        type="text"
                        placeholder="Username"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        required
                    />
                )}
                <input
                    type="email"
                    placeholder="Email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                />
                <input
                    type="password"
                    placeholder="Password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={6}
                />
                <button type="submit" disabled={loading}>
                    {loading ? 'Please wait...' : mode === 'login' ? 'Log in' : 'Register'}
                </button>
            </form>
            <button
                type="button"
                className="link-btn"
                onClick={() => {
                    setMode(mode === 'login' ? 'register' : 'login');
                    setError('');
                }}
            >
                {mode === 'login' ? 'Need an account? Register' : 'Have an account? Log in'}
            </button>
        </div>
    );
};

// ============================================================================
// 2. USER PROFILE COMPONENT
// ============================================================================
const UserProfile = ({ userId }) => {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        let cancelled = false;

        const fetchUserProfile = async () => {
            setLoading(true);
            setError('');
            try {
                const response = await api.get(`/users/${userId}`);
                if (!cancelled) setUser(response.data);
            } catch (err) {
                if (!cancelled) {
                    setUser(null);
                    setError(getErrorMessage(err, 'Failed to load profile'));
                }
            } finally {
                if (!cancelled) setLoading(false);
            }
        };

        if (userId) fetchUserProfile();
        return () => { cancelled = true; };
    }, [userId]);

    if (loading) return <div className="state">Loading profile...</div>;
    if (error) return <div className="error-banner">{error}</div>;
    if (!user) return <div className="state">User not found</div>;

    return (
        <div className="user-profile">
            <Avatar src={user.profile_picture_url} alt={user.username} size={72} />
            <h2>{user.username}</h2>
            <p>{user.bio || 'No bio yet.'}</p>
            <div className="stats">
                <div>Posts: {user.total_posts}</div>
                <div>Comments: {user.total_comments}</div>
                <div>Likes: {user.total_post_likes || 0}</div>
            </div>
        </div>
    );
};

// ============================================================================
// 3. POST COMPONENT — uses flattened username / profile_picture_url from API
// ============================================================================
const Post = ({ post, onLike, onDelete, userId, isAuthenticated }) => {
    const [showComments, setShowComments] = useState(false);
    const [comments, setComments] = useState([]);
    const [newComment, setNewComment] = useState('');
    const [commentsError, setCommentsError] = useState('');
    const [commentLoading, setCommentLoading] = useState(false);

    const fetchComments = async () => {
        setCommentsError('');
        try {
            const response = await api.get(`/posts/${post.id}/comments`);
            setComments(Array.isArray(response.data) ? response.data : []);
        } catch (error) {
            setCommentsError(getErrorMessage(error, 'Failed to load comments'));
        }
    };

    const handleShowComments = () => {
        if (!showComments) fetchComments();
        setShowComments(!showComments);
    };

    const handleAddComment = async () => {
        if (!newComment.trim()) return;
        if (!isAuthenticated) {
            setCommentsError('Please log in to comment');
            return;
        }

        setCommentLoading(true);
        setCommentsError('');
        try {
            await api.post(`/posts/${post.id}/comments`, { content: newComment });
            setNewComment('');
            await fetchComments();
        } catch (error) {
            setCommentsError(getErrorMessage(error, 'Failed to post comment'));
        } finally {
            setCommentLoading(false);
        }
    };

    const displayName = post.username || post.author?.username || 'Unknown';
    const avatarUrl = post.profile_picture_url || post.author?.profile_picture_url;

    return (
        <div className="post">
            <div className="post-header">
                <Avatar src={avatarUrl} alt={displayName} />
                <div>
                    <h4>{displayName}</h4>
                    <small>
                        {post.created_at
                            ? new Date(post.created_at).toLocaleDateString()
                            : ''}
                    </small>
                </div>
            </div>

            <h3>{post.title}</h3>
            <p>{post.content}</p>
            {post.image_url && (
                <img className="post-image" src={post.image_url} alt="Post" />
            )}

            <div className="post-stats">
                <button onClick={() => onLike(post.id)} disabled={!isAuthenticated}>
                    ❤️ {post.likes_count ?? 0}
                </button>
                <button onClick={handleShowComments}>
                    💬 {post.comment_count ?? 0}
                </button>
                {userId === post.user_id && (
                    <button onClick={() => onDelete(post.id)}>🗑️ Delete</button>
                )}
            </div>

            {showComments && (
                <div className="comments-section">
                    {commentsError && <div className="error-banner">{commentsError}</div>}
                    {comments.length === 0 && !commentsError && (
                        <p className="muted">No comments yet.</p>
                    )}
                    {comments.map(comment => (
                        <div key={comment.id} className="comment">
                            <Avatar
                                src={comment.profile_picture_url || comment.author?.profile_picture_url}
                                alt={comment.username || comment.author?.username}
                                size={32}
                            />
                            <div>
                                <strong>{comment.username || comment.author?.username || 'User'}</strong>
                                <p>{comment.content}</p>
                                <small>❤️ {comment.likes_count ?? 0}</small>
                            </div>
                        </div>
                    ))}

                    {isAuthenticated ? (
                        <div className="add-comment">
                            <input
                                type="text"
                                placeholder="Add a comment..."
                                value={newComment}
                                onChange={(e) => setNewComment(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && handleAddComment()}
                            />
                            <button onClick={handleAddComment} disabled={commentLoading}>
                                {commentLoading ? 'Posting...' : 'Post'}
                            </button>
                        </div>
                    ) : (
                        <p className="muted">Log in to leave a comment.</p>
                    )}
                </div>
            )}
        </div>
    );
};

// ============================================================================
// 4. FEED COMPONENT — pagination + like toggle + empty/error states
// ============================================================================
const Feed = ({ userId, isAuthenticated, refreshKey }) => {
    const [posts, setPosts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [page, setPage] = useState(1);
    const [pagination, setPagination] = useState(null);
    const [actionError, setActionError] = useState('');

    useEffect(() => {
        setPage(1);
    }, [refreshKey]);

    useEffect(() => {
        let cancelled = false;

        const fetchFeed = async () => {
            setLoading(true);
            setError('');
            try {
                const response = await api.get('/posts', { params: { page, limit: 10 } });
                if (!cancelled) {
                    setPosts(response.data.posts || []);
                    setPagination(response.data.pagination || null);
                }
            } catch (err) {
                if (!cancelled) {
                    setPosts([]);
                    setError(getErrorMessage(err, 'Failed to load feed'));
                }
            } finally {
                if (!cancelled) setLoading(false);
            }
        };

        fetchFeed();
        return () => { cancelled = true; };
    }, [page, refreshKey]);

    // Toggle like: if already liked, unlike instead
    const handleLike = async (postId) => {
        if (!isAuthenticated) {
            setActionError('Please log in to like posts');
            return;
        }
        setActionError('');
        try {
            await api.post(`/posts/${postId}/like`);
            setPosts(prev => prev.map(p =>
                p.id === postId ? { ...p, likes_count: (p.likes_count || 0) + 1 } : p
            ));
        } catch (error) {
            if (error?.response?.status === 400) {
                try {
                    await api.delete(`/posts/${postId}/unlike`);
                    setPosts(prev => prev.map(p =>
                        p.id === postId
                            ? { ...p, likes_count: Math.max((p.likes_count || 0) - 1, 0) }
                            : p
                    ));
                } catch (unlikeErr) {
                    setActionError(getErrorMessage(unlikeErr, 'Failed to unlike'));
                }
            } else {
                setActionError(getErrorMessage(error, 'Failed to like post'));
            }
        }
    };

    const handleDelete = async (postId) => {
        if (!window.confirm('Delete this post?')) return;
        setActionError('');
        try {
            await api.delete(`/posts/${postId}`);
            setPosts(prev => prev.filter(p => p.id !== postId));
        } catch (error) {
            setActionError(getErrorMessage(error, 'Failed to delete post'));
        }
    };

    if (loading) return <div className="state">Loading feed...</div>;
    if (error) return <div className="error-banner">{error}</div>;

    return (
        <div className="feed">
            {actionError && <div className="error-banner">{actionError}</div>}
            {posts.length === 0 ? (
                <div className="state">No posts yet. Be the first to share something.</div>
            ) : (
                posts.map(post => (
                    <Post
                        key={post.id}
                        post={post}
                        onLike={handleLike}
                        onDelete={handleDelete}
                        userId={userId}
                        isAuthenticated={isAuthenticated}
                    />
                ))
            )}
            {pagination && pagination.total_pages > 1 && (
                <div className="pagination">
                    <button
                        disabled={page <= 1}
                        onClick={() => setPage(p => p - 1)}
                    >
                        Previous
                    </button>
                    <span>
                        Page {pagination.page} of {pagination.total_pages}
                    </span>
                    <button
                        disabled={page >= pagination.total_pages}
                        onClick={() => setPage(p => p + 1)}
                    >
                        Next
                    </button>
                </div>
            )}
        </div>
    );
};

// ============================================================================
// 5. CREATE POST COMPONENT
// ============================================================================
const CreatePost = ({ onPostCreated }) => {
    const [title, setTitle] = useState('');
    const [content, setContent] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError('');

        try {
            await api.post('/posts', { title, content });
            setTitle('');
            setContent('');
            onPostCreated();
        } catch (err) {
            setError(getErrorMessage(err, 'Failed to create post'));
        } finally {
            setLoading(false);
        }
    };

    return (
        <form className="create-post" onSubmit={handleSubmit}>
            {error && <div className="error-banner">{error}</div>}
            <input
                type="text"
                placeholder="Post title..."
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
                maxLength={200}
            />
            <textarea
                placeholder="What's on your mind?"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                required
            />
            <button type="submit" disabled={loading}>
                {loading ? 'Posting...' : 'Post'}
            </button>
        </form>
    );
};

// ============================================================================
// 6. TRENDING POSTS COMPONENT
// ============================================================================
const TrendingPosts = () => {
    const [posts, setPosts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        let cancelled = false;

        const fetchTrending = async () => {
            setLoading(true);
            setError('');
            try {
                const response = await api.get('/trending');
                if (!cancelled) setPosts(Array.isArray(response.data) ? response.data : []);
            } catch (err) {
                if (!cancelled) setError(getErrorMessage(err, 'Failed to load trending'));
            } finally {
                if (!cancelled) setLoading(false);
            }
        };

        fetchTrending();
        return () => { cancelled = true; };
    }, []);

    if (loading) return <div className="state">Loading trending posts...</div>;
    if (error) return <div className="error-banner">{error}</div>;

    return (
        <div className="trending">
            <h2>Trending Posts (Last 7 Days)</h2>
            {posts.length === 0 ? (
                <p className="muted">No trending posts right now.</p>
            ) : (
                posts.map(post => (
                    <div key={post.id} className="trending-item">
                        <h4>{post.title}</h4>
                        <p>By: {post.username || post.author?.username || 'Unknown'}</p>
                        <p>❤️ {post.likes_count ?? 0} | 💬 {post.comment_count ?? 0}</p>
                    </div>
                ))
            )}
        </div>
    );
};

// ============================================================================
// 7. SEARCH COMPONENT
// ============================================================================
const Search = () => {
    const [query, setQuery] = useState('');
    const [results, setResults] = useState([]);
    const [searched, setSearched] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const handleSearch = async (e) => {
        e.preventDefault();
        if (!query.trim()) return;

        setLoading(true);
        setError('');
        try {
            const response = await api.get('/search', { params: { q: query } });
            setResults(Array.isArray(response.data) ? response.data : []);
            setSearched(true);
        } catch (err) {
            setError(getErrorMessage(err, 'Search failed'));
            setResults([]);
            setSearched(true);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="search">
            <form onSubmit={handleSearch}>
                <input
                    type="text"
                    placeholder="Search posts..."
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                />
                <button type="submit" disabled={loading}>
                    {loading ? 'Searching...' : 'Search'}
                </button>
            </form>

            {error && <div className="error-banner">{error}</div>}

            {searched && !error && (
                <div className="search-results">
                    {results.length === 0 ? (
                        <p>No results found</p>
                    ) : (
                        results.map(post => (
                            <div key={post.id} className="search-result">
                                <h4>{post.title}</h4>
                                <p>
                                    {(post.content || '').substring(0, 100)}
                                    {(post.content || '').length > 100 ? '...' : ''}
                                </p>
                                <p>By: {post.username || post.author?.username || 'Unknown'}</p>
                            </div>
                        ))
                    )}
                </div>
            )}
        </div>
    );
};

// ============================================================================
// 8. MAIN APP COMPONENT — real session instead of hardcoded userId
// ============================================================================
const App = () => {
    const [user, setUser] = useState(() => {
        try {
            const raw = localStorage.getItem('user');
            return raw ? JSON.parse(raw) : null;
        } catch {
            return null;
        }
    });
    const [activeTab, setActiveTab] = useState('feed');
    const [refreshFeed, setRefreshFeed] = useState(0);
    const [showAuth, setShowAuth] = useState(false);

    const isAuthenticated = Boolean(user && localStorage.getItem('token'));

    const handleLogout = () => {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        setUser(null);
        setShowAuth(false);
    };

    const handleAuthSuccess = (authUser) => {
        setUser(authUser);
        setShowAuth(false);
        setActiveTab('feed');
    };

    return (
        <div className="app">
            <header className="header">
                <h1>Social Media App</h1>
                <nav>
                    <button
                        className={activeTab === 'feed' ? 'active' : ''}
                        onClick={() => setActiveTab('feed')}
                    >
                        Feed
                    </button>
                    <button
                        className={activeTab === 'trending' ? 'active' : ''}
                        onClick={() => setActiveTab('trending')}
                    >
                        Trending
                    </button>
                    <button
                        className={activeTab === 'search' ? 'active' : ''}
                        onClick={() => setActiveTab('search')}
                    >
                        Search
                    </button>
                    {isAuthenticated && (
                        <button
                            className={activeTab === 'profile' ? 'active' : ''}
                            onClick={() => setActiveTab('profile')}
                        >
                            Profile
                        </button>
                    )}
                    {isAuthenticated ? (
                        <button onClick={handleLogout}>
                            Log out ({user.username})
                        </button>
                    ) : (
                        <button onClick={() => setShowAuth(true)}>Log in</button>
                    )}
                </nav>
            </header>

            <main className="main">
                {showAuth && !isAuthenticated && (
                    <AuthForm onAuthSuccess={handleAuthSuccess} />
                )}

                {activeTab === 'feed' && (
                    <>
                        {isAuthenticated ? (
                            <CreatePost onPostCreated={() => setRefreshFeed(k => k + 1)} />
                        ) : (
                            !showAuth && (
                                <div className="state">
                                    Log in to create posts, comment, and like.
                                </div>
                            )
                        )}
                        <Feed
                            userId={user?.id}
                            isAuthenticated={isAuthenticated}
                            refreshKey={refreshFeed}
                        />
                    </>
                )}
                {activeTab === 'trending' && <TrendingPosts />}
                {activeTab === 'search' && <Search />}
                {activeTab === 'profile' && isAuthenticated && (
                    <UserProfile userId={user.id} />
                )}
            </main>

            <style>{`
                * { margin: 0; padding: 0; box-sizing: border-box; }
                body { font-family: Georgia, 'Times New Roman', serif; background: linear-gradient(180deg, #f0f4f8 0%, #e2e8f0 100%); min-height: 100vh; }
                .app { max-width: 800px; margin: 0 auto; padding-bottom: 2rem; }
                .header { background: #1f2937; color: white; padding: 1rem; }
                .header h1 { margin-bottom: 0.75rem; font-size: 1.4rem; }
                nav { display: flex; flex-wrap: wrap; gap: 0.4rem; }
                nav button { padding: 0.45rem 0.9rem; cursor: pointer; border: none; border-radius: 4px; background: #374151; color: white; }
                nav button.active { background: #3b82f6; }
                .main { padding: 0 1rem; }
                .post { border: 1px solid #d1d5db; padding: 1rem; margin: 1rem 0; border-radius: 8px; background: white; }
                .post-header { display: flex; gap: 1rem; margin-bottom: 1rem; align-items: center; }
                .post-image { max-width: 100%; margin-top: 0.75rem; border-radius: 6px; }
                .post-stats button { margin-right: 0.75rem; margin-top: 0.75rem; padding: 0.45rem 0.7rem; cursor: pointer; }
                .post-stats button:disabled { opacity: 0.5; cursor: not-allowed; }
                .comments-section { margin-top: 1rem; padding-top: 1rem; border-top: 1px solid #e5e7eb; }
                .comment { display: flex; gap: 0.5rem; margin-bottom: 0.75rem; }
                .add-comment { display: flex; gap: 0.5rem; margin-top: 0.75rem; }
                .add-comment input { flex: 1; padding: 0.5rem; }
                .create-post, .auth-form { margin: 1rem 0; padding: 1rem; border: 1px solid #d1d5db; border-radius: 8px; background: white; }
                .create-post input, .create-post textarea,
                .auth-form input { width: 100%; padding: 0.5rem; margin-bottom: 0.5rem; }
                .create-post textarea { min-height: 80px; resize: vertical; }
                .auth-form button[type="submit"] { width: 100%; padding: 0.6rem; cursor: pointer; }
                .link-btn { background: none; border: none; color: #2563eb; cursor: pointer; margin-top: 0.75rem; text-decoration: underline; }
                .hint { font-size: 0.85rem; color: #6b7280; margin-bottom: 0.75rem; }
                .trending, .search { padding: 1rem 0; }
                .trending-item, .search-result { padding: 0.75rem; border-bottom: 1px solid #e5e7eb; background: white; }
                .user-profile { background: white; padding: 1.25rem; margin-top: 1rem; border-radius: 8px; border: 1px solid #d1d5db; }
                .stats { display: flex; gap: 1.25rem; margin-top: 0.75rem; }
                .error-banner { background: #fef2f2; color: #b91c1c; border: 1px solid #fecaca; padding: 0.6rem 0.75rem; border-radius: 6px; margin: 0.5rem 0; }
                .state { padding: 1.25rem; color: #4b5563; }
                .muted { color: #6b7280; font-size: 0.9rem; }
                .pagination { display: flex; align-items: center; justify-content: center; gap: 1rem; margin: 1rem 0; }
                .pagination button { padding: 0.4rem 0.8rem; cursor: pointer; }
                .pagination button:disabled { opacity: 0.4; cursor: not-allowed; }
                .search form { display: flex; gap: 0.5rem; margin-bottom: 1rem; }
                .search input { flex: 1; padding: 0.5rem; }
            `}</style>
        </div>
    );
};

export default App;
