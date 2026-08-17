import { useState, type FormEvent } from 'react';
import { api, ApiError, setSession } from '../api';

export function Login({ onLoggedIn }: { onLoggedIn: () => void }) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const result =
        mode === 'login' ? await api.login(email, password) : await api.register(email, password, name);
      setSession(result.token, result.name);
      onLoggedIn();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível ligar ao servidor.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-screen">
      <div className="login-card">
        <div className="login-card__brand">
          SOS Mend<em>o</em>nça
        </div>
        <p className="login-card__tagline">Painel do cuidador</p>

        <div className="login-tabs">
          <button type="button" aria-current={mode === 'login'} onClick={() => setMode('login')}>
            Entrar
          </button>
          <button type="button" aria-current={mode === 'register'} onClick={() => setMode('register')}>
            Criar conta
          </button>
        </div>

        <form onSubmit={submit}>
          {mode === 'register' && (
            <div className="field">
              <label htmlFor="name">O seu nome</label>
              <input id="name" value={name} onChange={(e) => setName(e.target.value)} required autoComplete="name" />
            </div>
          )}
          <div className="field">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
          </div>
          <div className="field">
            <label htmlFor="password">Palavra-passe</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={mode === 'register' ? 8 : undefined}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            />
          </div>

          {error && <p className="error-text">{error}</p>}

          <button className="button button--primary" type="submit" disabled={busy} style={{ width: '100%' }}>
            {busy ? 'Um momento…' : mode === 'login' ? 'Entrar' : 'Criar conta'}
          </button>
        </form>
      </div>
    </div>
  );
}
