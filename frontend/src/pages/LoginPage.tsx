import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Video, Mail, Lock, User, ArrowLeft } from 'lucide-react'
import { useAuthStore } from '../store/useAuthStore'

export default function LoginPage() {
    const navigate = useNavigate()
    const { setUser, setError, error, isLoading, setLoading } = useAuthStore()

    const [isRegister, setIsRegister] = useState(false)
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [name, setName] = useState('')

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setLoading(true)
        setError(null)

        try {
            const endpoint = isRegister ? '/api/auth/register' : '/api/auth/login'
            const body = isRegister
                ? { email, password, name }
                : { email, password }

            const response = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            })

            const data = await response.json()

            if (!response.ok) {
                throw new Error(data.message || 'Authentication failed')
            }

            setUser(data.user, data.token)
            navigate('/')
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Authentication failed')
        } finally {
            setLoading(false)
        }
    }

    // For demo purposes, allow guest login
    const handleGuestLogin = () => {
        const guestUser = {
            id: `guest_${Date.now()}`,
            email: '',
            name: name || 'Guest User',
        }
        setUser(guestUser, 'guest-token')
        navigate('/')
    }

    return (
        <div className="min-h-screen flex-center" style={{
            background: 'linear-gradient(135deg, #0f0f0f 0%, #1a1a2e 50%, #16213e 100%)'
        }}>
            <div style={{ width: '100%', maxWidth: '420px', padding: 'var(--spacing-lg)' }}>
                {/* Back button */}
                <button
                    className="btn btn-ghost"
                    onClick={() => navigate('/')}
                    style={{ marginBottom: 'var(--spacing-lg)' }}
                >
                    <ArrowLeft size={18} />
                    Back to Home
                </button>

                {/* Logo */}
                <div style={{ textAlign: 'center', marginBottom: 'var(--spacing-2xl)' }}>
                    <div style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 'var(--spacing-sm)',
                        marginBottom: 'var(--spacing-md)'
                    }}>
                        <Video size={40} color="var(--color-primary)" />
                        <span style={{ fontSize: 'var(--font-size-2xl)', fontWeight: 700 }}>Roaya</span>
                    </div>
                    <h1 style={{ fontSize: 'var(--font-size-xl)', marginBottom: 'var(--spacing-sm)' }}>
                        {isRegister ? 'Create your account' : 'Welcome back'}
                    </h1>
                    <p style={{ color: 'var(--color-text-secondary)' }}>
                        {isRegister
                            ? 'Sign up to start hosting meetings'
                            : 'Sign in to access your meetings'}
                    </p>
                </div>

                {/* Form */}
                <div className="card">
                    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-md)' }}>
                        {isRegister && (
                            <div>
                                <label style={{
                                    display: 'block',
                                    marginBottom: 'var(--spacing-xs)',
                                    fontSize: 'var(--font-size-sm)',
                                    color: 'var(--color-text-secondary)'
                                }}>
                                    Full Name
                                </label>
                                <div style={{ position: 'relative' }}>
                                    <User size={18} style={{
                                        position: 'absolute',
                                        left: '12px',
                                        top: '50%',
                                        transform: 'translateY(-50%)',
                                        color: 'var(--color-text-muted)'
                                    }} />
                                    <input
                                        className="input"
                                        type="text"
                                        placeholder="John Doe"
                                        value={name}
                                        onChange={(e) => setName(e.target.value)}
                                        style={{ paddingLeft: '40px' }}
                                        required={isRegister}
                                    />
                                </div>
                            </div>
                        )}

                        <div>
                            <label style={{
                                display: 'block',
                                marginBottom: 'var(--spacing-xs)',
                                fontSize: 'var(--font-size-sm)',
                                color: 'var(--color-text-secondary)'
                            }}>
                                Email
                            </label>
                            <div style={{ position: 'relative' }}>
                                <Mail size={18} style={{
                                    position: 'absolute',
                                    left: '12px',
                                    top: '50%',
                                    transform: 'translateY(-50%)',
                                    color: 'var(--color-text-muted)'
                                }} />
                                <input
                                    className="input"
                                    type="email"
                                    placeholder="you@example.com"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    style={{ paddingLeft: '40px' }}
                                    required
                                />
                            </div>
                        </div>

                        <div>
                            <label style={{
                                display: 'block',
                                marginBottom: 'var(--spacing-xs)',
                                fontSize: 'var(--font-size-sm)',
                                color: 'var(--color-text-secondary)'
                            }}>
                                Password
                            </label>
                            <div style={{ position: 'relative' }}>
                                <Lock size={18} style={{
                                    position: 'absolute',
                                    left: '12px',
                                    top: '50%',
                                    transform: 'translateY(-50%)',
                                    color: 'var(--color-text-muted)'
                                }} />
                                <input
                                    className="input"
                                    type="password"
                                    placeholder="••••••••"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    style={{ paddingLeft: '40px' }}
                                    required
                                    minLength={8}
                                />
                            </div>
                        </div>

                        {error && (
                            <div style={{
                                padding: 'var(--spacing-sm) var(--spacing-md)',
                                background: 'rgba(239, 68, 68, 0.1)',
                                border: '1px solid var(--color-danger)',
                                borderRadius: 'var(--radius-md)',
                                color: 'var(--color-danger)',
                                fontSize: 'var(--font-size-sm)'
                            }}>
                                {error}
                            </div>
                        )}

                        <button
                            type="submit"
                            className="btn btn-primary btn-lg"
                            disabled={isLoading}
                            style={{ width: '100%', marginTop: 'var(--spacing-sm)' }}
                        >
                            {isLoading ? 'Please wait...' : (isRegister ? 'Create Account' : 'Sign In')}
                        </button>
                    </form>

                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 'var(--spacing-md)',
                        margin: 'var(--spacing-lg) 0'
                    }}>
                        <div style={{ flex: 1, height: '1px', background: 'var(--color-border)' }} />
                        <span style={{ color: 'var(--color-text-muted)', fontSize: 'var(--font-size-sm)' }}>or</span>
                        <div style={{ flex: 1, height: '1px', background: 'var(--color-border)' }} />
                    </div>

                    {/* Guest Login */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-sm)' }}>
                        <input
                            className="input"
                            type="text"
                            placeholder="Enter your name for guest access"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                        />
                        <button
                            type="button"
                            className="btn btn-ghost"
                            onClick={handleGuestLogin}
                            style={{ width: '100%' }}
                        >
                            Continue as Guest
                        </button>
                    </div>

                    <p style={{
                        textAlign: 'center',
                        marginTop: 'var(--spacing-lg)',
                        color: 'var(--color-text-secondary)',
                        fontSize: 'var(--font-size-sm)'
                    }}>
                        {isRegister ? 'Already have an account?' : "Don't have an account?"}{' '}
                        <button
                            type="button"
                            onClick={() => setIsRegister(!isRegister)}
                            style={{
                                background: 'none',
                                border: 'none',
                                color: 'var(--color-primary)',
                                cursor: 'pointer'
                            }}
                        >
                            {isRegister ? 'Sign in' : 'Sign up'}
                        </button>
                    </p>
                </div>
            </div>
        </div>
    )
}
