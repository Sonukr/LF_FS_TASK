// ============================================================================
// FRONTEND: React Social Media App
// ============================================================================

import React, { useState, useEffect } from 'react';
import axios from 'axios';

const API_BASE_URL = 'http://localhost:3000/api';

// ============================================================================
// 1. USER PROFILE COMPONENT
// ============================================================================
const UserProfile = ({ userId }) => {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchUserProfile();
    }, [userId]);

    const fetchUserProfile = async () => {
        try {
            const response = await axios.get(`${API_BASE_URL}/users/${userId}`);
            setUser(response.data);
            setLoading(false);
        } catch (error) {
            console.error('Error fetching user:', error);
            setLoading(false);
        }
    };

    if (loading) return <div>Loading...</div>;
    if (!user) return <div>User not found</div>;

    return (
        <div className="user-profile">
            <img src={user.profile_picture_url} alt={user.username} />
            <h2>{user.username}</h2>
            <p>{user.bio}</p>
            <div className="stats">
                <div>Posts: {user.total_posts}</div>
                <div>Comments: {user.total_comments}</div>
                <div>Likes: {user.total_post_likes || 0}</div>
            </div>
        </div>
    );
};

// ============================================================================
// 2. POST COMPONENT
// ============================================================================
const Post = ({ post, onLike, onDelete, userId }) => {
    const [showComments, setShowComments] = useState(false);
    const [comments, setComments] = useState([]);
    const [newComment, setNewComment] = useState('');

    const fetchComments = async () => {
        try {
            const response = await axios.get(`${API_BASE_URL}/posts/${post.id}/comments`);
            setComments(response.data);
        } catch (error) {
            console.error('Error fetching comments:', error);
        }
    };

    const handleShowComments = () => {
        if (!showComments) {
            fetchComments();
        }
        setShowComments(!showComments);
    };

    const handleAddComment = async () => {
        if (!newComment.trim()) return;

        try {
            const token = localStorage.getItem('token');
            await axios.post(
                `${API_BASE_URL}/posts/${post.id}/comments`,
                { content: newComment },
                { headers: { Authorization: `Bearer ${token}` } }
            );
            setNewComment('');
            fetchComments();
        } catch (error) {
            console.error('Error posting comment:', error);
        }
    };

    return (
        <div className="post">
            <div className="post-header">
                <img src={post.profile_picture_url} alt={post.username} />
                <div>
                    <h4>{post.username}</h4>
                    <small>{new Date(post.created_at).toLocaleDateString()}</small>
                </div>
            </div>

            <h3>{post.title}</h3>
            <p>{post.content}</p>
            {post.image_url && <img src={post.image_url} alt="Post" />}

            <div className="post-stats">
                <button onClick={() => onLike(post.id)}>❤️ {post.likes_count}</button>
                <button onClick={handleShowComments}>💬 {post.comment_count}</button>
                {userId === post.user_id && (
                    <button onClick={() => onDelete(post.id)}>🗑️ Delete</button>
                )}
            </div>

            {showComments && (
                <div className="comments-section">
                    {comments.map(comment => (
                        <div key={comment.id} className="comment">
                            <img src={comment.profile_picture_url} alt={comment.username} />
                            <div>
                                <strong>{comment.username}</strong>
                                <p>{comment.content}</p>
                                <small>❤️ {comment.likes_count}</small>
                            </div>
                        </div>
                    ))}

                    <div className="add-comment">
                        <input
                            type="text"
                            placeholder="Add a comment..."
                            value={newComment}
                            onChange={(e) => setNewComment(e.target.value)}
                        />
                        <button onClick={handleAddComment}>Post</button>
                    </div>
                </div>
            )}
        </div>
    );
};

// ============================================================================
// 3. FEED COMPONENT
// ============================================================================
const Feed = ({ userId }) => {
    const [posts, setPosts] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchFeed();
    }, []);

    const fetchFeed = async () => {
        try {
            const response = await axios.get(`${API_BASE_URL}/posts`);
            setPosts(response.data.posts);
            setLoading(false);
        } catch (error) {
            console.error('Error fetching feed:', error);
            setLoading(false);
        }
    };

    const handleLike = async (postId) => {
        try {
            const token = localStorage.getItem('token');
            await axios.post(
                `${API_BASE_URL}/posts/${postId}/like`,
                {},
                { headers: { Authorization: `Bearer ${token}` } }
            );
            fetchFeed();
        } catch (error) {
            console.error('Error liking post:', error);
        }
    };

    const handleDelete = async (postId) => {
        try {
            const token = localStorage.getItem('token');
            await axios.delete(`${API_BASE_URL}/posts/${postId}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            fetchFeed();
        } catch (error) {
            console.error('Error deleting post:', error);
        }
    };

    if (loading) return <div>Loading feed...</div>;

    return (
        <div className="feed">
            {posts.map(post => (
                <Post
                    key={post.id}
                    post={post}
                    onLike={handleLike}
                    onDelete={handleDelete}
                    userId={userId}
                />
            ))}
        </div>
    );
};

// ============================================================================
// 4. CREATE POST COMPONENT
// ============================================================================
const CreatePost = ({ onPostCreated }) => {
    const [title, setTitle] = useState('');
    const [content, setContent] = useState('');
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);

        try {
            const token = localStorage.getItem('token');
            await axios.post(
                `${API_BASE_URL}/posts`,
                { title, content },
                { headers: { Authorization: `Bearer ${token}` } }
            );
            setTitle('');
            setContent('');
            onPostCreated();
        } catch (error) {
            console.error('Error creating post:', error);
        } finally {
            setLoading(false);
        }
    };

    return (
        <form className="create-post" onSubmit={handleSubmit}>
            <input
                type="text"
                placeholder="Post title..."
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
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
// 5. TRENDING POSTS COMPONENT
// ============================================================================
const TrendingPosts = () => {
    const [posts, setPosts] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchTrending();
    }, []);

    const fetchTrending = async () => {
        try {
            const response = await axios.get(`${API_BASE_URL}/trending`);
            setPosts(response.data);
            setLoading(false);
        } catch (error) {
            console.error('Error fetching trending:', error);
            setLoading(false);
        }
    };

    if (loading) return <div>Loading trending posts...</div>;

    return (
        <div className="trending">
            <h2>Trending Posts (Last 7 Days)</h2>
            {posts.map(post => (
                <div key={post.id} className="trending-item">
                    <h4>{post.title}</h4>
                    <p>By: {post.username}</p>
                    <p>❤️ {post.likes_count} | 💬 {post.comment_count}</p>
                </div>
            ))}
        </div>
    );
};

// ============================================================================
// 6. SEARCH COMPONENT
// ============================================================================
const Search = () => {
    const [query, setQuery] = useState('');
    const [results, setResults] = useState([]);
    const [searched, setSearched] = useState(false);

    const handleSearch = async (e) => {
        e.preventDefault();
        if (!query.trim()) return;

        try {
            const response = await axios.get(`${API_BASE_URL}/search`, {
                params: { q: query }
            });
            setResults(response.data);
            setSearched(true);
        } catch (error) {
            console.error('Error searching:', error);
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
                <button type="submit">Search</button>
            </form>

            {searched && (
                <div className="search-results">
                    {results.length === 0 ? (
                        <p>No results found</p>
                    ) : (
                        results.map(post => (
                            <div key={post.id} className="search-result">
                                <h4>{post.title}</h4>
                                <p>{post.content.substring(0, 100)}...</p>
                                <p>By: {post.username}</p>
                            </div>
                        ))
                    )}
                </div>
            )}
        </div>
    );
};

// ============================================================================
// 7. MAIN APP COMPONENT
// ============================================================================
const App = () => {
    const [userId] = useState(1);
    const [activeTab, setActiveTab] = useState('feed');
    const [refreshFeed, setRefreshFeed] = useState(false);

    return (
        <div className="app">
            <header className="header">
                <h1>📱 Social Media App</h1>
                <nav>
                    <button onClick={() => setActiveTab('feed')}>Feed</button>
                    <button onClick={() => setActiveTab('trending')}>Trending</button>
                    <button onClick={() => setActiveTab('search')}>Search</button>
                    <button onClick={() => setActiveTab('profile')}>Profile</button>
                </nav>
            </header>

            <main className="main">
                {activeTab === 'feed' && (
                    <>
                        <CreatePost onPostCreated={() => setRefreshFeed(!refreshFeed)} />
                        <Feed userId={userId} key={refreshFeed} />
                    </>
                )}
                {activeTab === 'trending' && <TrendingPosts />}
                {activeTab === 'search' && <Search />}
                {activeTab === 'profile' && <UserProfile userId={userId} />}
            </main>

            <style>{`
                * { margin: 0; padding: 0; box-sizing: border-box; }
                body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
                .app { max-width: 800px; margin: 0 auto; }
                .header { background: #1f2937; color: white; padding: 1rem; }
                nav button { margin: 0 0.5rem; padding: 0.5rem 1rem; cursor: pointer; }
                .post { border: 1px solid #e5e7eb; padding: 1rem; margin: 1rem 0; border-radius: 8px; }
                .post-header { display: flex; gap: 1rem; margin-bottom: 1rem; }
                .post-header img { width: 40px; height: 40px; border-radius: 50%; }
                .post-stats button { margin-right: 1rem; padding: 0.5rem; cursor: pointer; }
                .comments-section { margin-top: 1rem; padding-top: 1rem; border-top: 1px solid #e5e7eb; }
                .comment { display: flex; gap: 0.5rem; margin-bottom: 0.5rem; }
                .comment img { width: 32px; height: 32px; border-radius: 50%; }
                .create-post { margin: 1rem 0; padding: 1rem; border: 1px solid #e5e7eb; border-radius: 8px; }
                .create-post input, .create-post textarea { width: 100%; padding: 0.5rem; margin-bottom: 0.5rem; }
                .trending { padding: 1rem; }
                .trending-item { padding: 0.5rem; border-bottom: 1px solid #e5e7eb; }
            `}</style>
        </div>
    );
};

export default App;
