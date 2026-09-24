import { useEffect, useRef } from 'react';
import { googleSignIn, setStoredAuth } from '../../api/client';

const GOOGLE_CLIENT_ID = '781209907525-b2rq9lioerpkia275bg1kn6ingm6b62c.apps.googleusercontent.com';

// Renders the real Google Identity Services button — not a mock, this talks
// to Google for real. On success it hands us an ID token, which we exchange
// for our own JWT via /api/auth/google (see client.js).
export default function LoginScreen({ onSignedIn }) {
  const buttonRef = useRef(null);

  useEffect(() => {
    function init() {
      window.google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: async (response) => {
          try {
            const auth = await googleSignIn(response.credential);
            setStoredAuth(auth);
            onSignedIn(auth);
          } catch (err) {
            alert(`Sign-in failed: ${err.message}`);
          }
        },
      });
      window.google.accounts.id.renderButton(buttonRef.current, {
        theme: 'filled_black',
        size: 'large',
        shape: 'pill',
      });
    }

    if (window.google?.accounts?.id) {
      init();
    } else {
      const script = document.createElement('script');
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.onload = init;
      document.body.appendChild(script);
    }
  }, [onSignedIn]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', gap: 20 }}>
      <h1>Akiba</h1>
      <p style={{ color: 'var(--muted)', fontSize: 13 }}>Sign in to see your finances.</p>
      <div ref={buttonRef}></div>
    </div>
  );
}