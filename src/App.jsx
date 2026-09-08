import { useState, useEffect, useRef } from 'react';
import './index.css';
import { db, ref, onValue, set } from './firebase';

const EMOJI_POOL = [
  '🦊', '👺', '😈', '🤡', '🦁', '🐼', '🤖', '🐙', 
  '🦄', '👽', '🤠', '👾', '👻', '🎃', '🦖', '😎', 
  '🐸', '🥸', '🥷', '💩', '🤪', '🗿'
];

const INITIAL_PEOPLE = [
  { name: 'Rifqi', title: 'The OTW Phantom', defaultAvatar: '🦊', colorClass: 'rifqi' },
  { name: 'Ilham', title: 'Suhu Wacana', defaultAvatar: '👺', colorClass: 'ilham' },
  { name: 'Jonathan', title: 'Lord Scammer', defaultAvatar: '😈', colorClass: 'jonathan' },
  { name: 'Fatwa', title: 'Master Pranker', defaultAvatar: '🤡', colorClass: 'fatwa' },
  { name: 'Agung', title: 'King of Drama', defaultAvatar: '🤖', colorClass: 'agung' },
  { name: 'Dini', title: 'Ratu Alasan', defaultAvatar: '🦄', colorClass: 'dini' }
];

const PRESET_REASONS = [
  "Bilang OTW padahal baru mandi 🚿",
  "Katanya mau traktir ternyata kagak 💸",
  "Wacana nongkrong tapi malah turu 😴",
  "Ngarang cerita fiktif di tongkrongan 🤡",
  "Janji jemput jam 7 dateng jam 9 ⏰",
  "Lupa bawa dompet pas mau bayar 👛"
];

function playPopSound(type = 'up') {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    
    osc.type = 'sine';
    if (type === 'up') {
      osc.frequency.setValueAtTime(400, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(850, ctx.currentTime + 0.1);
    } else {
      osc.frequency.setValueAtTime(600, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(250, ctx.currentTime + 0.1);
    }
    
    gain.gain.setValueAtTime(0.25, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.1);
    
    osc.connect(gain);
    gain.connect(ctx.destination);
    
    osc.start();
    osc.stop(ctx.currentTime + 0.12);
  } catch (e) {
    // Ignore audio policy errors
  }
}

function App() {
  const [counts, setCounts] = useState({
    Rifqi: 0, Ilham: 0, Jonathan: 0, Fatwa: 0, Agung: 0, Dini: 0
  });
  const [logs, setLogs] = useState([]);
  const [isConnected, setIsConnected] = useState(false);
  const [selectedPerson, setSelectedPerson] = useState(null);
  const [customReason, setCustomReason] = useState('');
  const [isPlayingMusic, setIsPlayingMusic] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  
  // Custom emojis state per person
  const [avatars, setAvatars] = useState(() => {
    const saved = localStorage.getItem('scam_avatars');
    if (saved) {
      try { return JSON.parse(saved); } catch (e) {}
    }
    return INITIAL_PEOPLE.reduce((acc, p) => ({ ...acc, [p.name]: p.defaultAvatar }), {});
  });

  const canvasRef = useRef(null);
  const audioRef = useRef(null);
  const musicTimerRef = useRef(null);
  const channelRef = useRef(null);

  // Save avatars to localStorage
  useEffect(() => {
    localStorage.setItem('scam_avatars', JSON.stringify(avatars));
  }, [avatars]);

  // Real-time broadcast channel for instant multi-tab sync
  useEffect(() => {
    try {
      const channel = new BroadcastChannel('scam_counter_channel');
      channelRef.current = channel;
      channel.onmessage = (event) => {
        if (event.data?.type === 'SYNC') {
          if (event.data.counts) setCounts(event.data.counts);
          if (event.data.logs) setLogs(event.data.logs);
          playPopSound('up');
        }
      };
    } catch (e) {}
    return () => {
      if (channelRef.current) channelRef.current.close();
    };
  }, []);

  // Load / Sync real-time state from Firebase DB & SSE (Local server fallback)
  useEffect(() => {
    let unsubscribeFirebase = null;
    
    // 1. Firebase Realtime Database Listener
    if (db) {
      try {
        const scamRef = ref(db, 'scamData');
        unsubscribeFirebase = onValue(scamRef, (snapshot) => {
          const data = snapshot.val();
          if (data) {
            if (data.counts) setCounts(data.counts);
            if (data.logs) setLogs(data.logs);
            setIsConnected(true);
          } else {
            setIsConnected(true);
          }
        }, (err) => {
          console.warn("Firebase sync error, falling back", err);
          setIsConnected(false);
        });
      } catch (e) {
        console.warn("Firebase listener setup error", e);
      }
    }

    // 2. Fallback SSE for local Vite server if running locally
    let eventSource;
    if (import.meta.env.DEV) {
      try {
        eventSource = new EventSource('/api/events');
        eventSource.onopen = () => setIsConnected(true);
        eventSource.onmessage = (event) => {
          try {
            const payload = JSON.parse(event.data);
            if (payload.type === 'INIT') {
              setCounts(payload.data.counts);
              setLogs(payload.data.logs || []);
            } else if (payload.type === 'UPDATE') {
              setCounts(payload.data.counts);
              if (payload.newLog) {
                setLogs(prev => [payload.newLog, ...prev.slice(0, 49)]);
              }
              playPopSound('up');
            }
          } catch (err) {}
        };
      } catch (e) {}
    } else if (!db) {
      // LocalStorage fallback for static hosting if no DB
      const localCounts = localStorage.getItem('scam_counts');
      const localLogs = localStorage.getItem('scam_logs');
      if (localCounts) try { setCounts(JSON.parse(localCounts)); } catch (e) {}
      if (localLogs) try { setLogs(JSON.parse(localLogs)); } catch (e) {}
      setIsConnected(true);
    }

    return () => {
      if (unsubscribeFirebase) unsubscribeFirebase();
      if (eventSource) eventSource.close();
    };
  }, []);

  // Sync state to Firebase / BroadcastChannel / LocalStorage
  const updateGlobalState = (newCounts, newLogs) => {
    setCounts(newCounts);
    setLogs(newLogs);

    // Save to LocalStorage
    try {
      localStorage.setItem('scam_counts', JSON.stringify(newCounts));
      localStorage.setItem('scam_logs', JSON.stringify(newLogs));
    } catch (e) {}

    // Broadcast across browser tabs
    if (channelRef.current) {
      try {
        channelRef.current.postMessage({ type: 'SYNC', counts: newCounts, logs: newLogs });
      } catch (e) {}
    }

    // Sync to Firebase DB
    if (db) {
      try {
        set(ref(db, 'scamData'), { counts: newCounts, logs: newLogs });
      } catch (e) {
        console.warn("Failed to write to Firebase", e);
      }
    }
  };

  // Find Top Scammer (King)
  const maxCount = Math.max(...Object.values(counts));
  const topScammer = maxCount > 0 ? Object.keys(counts).find(name => counts[name] === maxCount) : null;
  const totalScams = Object.values(counts).reduce((a, b) => a + b, 0);

  // Audio path for DJ Mahjong song
  const audioSrc = `${import.meta.env.BASE_URL}king-song.mp3`;

  // Play DJ Mahjong song for EXACTLY 10 seconds when someone becomes King
  const play10SecSong = () => {
    const audio = audioRef.current;
    if (!audio) return;

    if (musicTimerRef.current) clearTimeout(musicTimerRef.current);

    audio.currentTime = 0;
    audio.play().then(() => {
      setIsPlayingMusic(true);
      musicTimerRef.current = setTimeout(() => {
        audio.pause();
        audio.currentTime = 0;
        setIsPlayingMusic(false);
      }, 10000); // 10 Seconds
    }).catch(err => {
      console.log('Autoplay waiting for user interaction');
    });
  };

  useEffect(() => {
    if (topScammer && maxCount > 0 && !isMuted) {
      play10SecSong();
    } else if (!topScammer || maxCount === 0) {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
      }
      setIsPlayingMusic(false);
      if (musicTimerRef.current) clearTimeout(musicTimerRef.current);
    }
  }, [topScammer, maxCount, isMuted]);

  const toggleMusic = () => {
    const audio = audioRef.current;
    if (!audio) return;

    if (isPlayingMusic) {
      if (musicTimerRef.current) clearTimeout(musicTimerRef.current);
      audio.pause();
      audio.currentTime = 0;
      setIsPlayingMusic(false);
      setIsMuted(true);
    } else {
      setIsMuted(false);
      play10SecSong();
    }
  };

  // Confetti Particle Burst Effect
  const triggerConfetti = (e) => {
    const canvas = canvasRef.current;
    if (!canvas || !e) return;
    const ctx = canvas.getContext('2d');
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const rect = e.target.getBoundingClientRect();
    const startX = rect.left + rect.width / 2;
    const startY = rect.top + rect.height / 2;

    const particles = Array.from({ length: 30 }, () => ({
      x: startX,
      y: startY,
      vx: (Math.random() - 0.5) * 10,
      vy: (Math.random() - 0.5) * 10 - 2,
      color: ['#FF6B00', '#A855F7', '#06B6D4', '#10B981', '#EC4899', '#F59E0B'][Math.floor(Math.random() * 6)],
      size: Math.random() * 6 + 4,
      alpha: 1
    }));

    let animationFrame;
    const render = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      let alive = false;
      particles.forEach(p => {
        if (p.alpha > 0.02) {
          alive = true;
          p.x += p.vx;
          p.y += p.vy;
          p.vy += 0.2;
          p.alpha *= 0.94;
          ctx.globalAlpha = p.alpha;
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
          ctx.fill();
        }
      });
      if (alive) {
        animationFrame = requestAnimationFrame(render);
      } else {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
    };
    render();
  };

  const handleIncrement = async (name, reason = 'Ngebual / Ngibulin temen', e = null) => {
    if (e) triggerConfetti(e);
    playPopSound('up');

    // Unlock browser audio context if needed
    if (audioRef.current && !isPlayingMusic && !isMuted && topScammer) {
      play10SecSong();
    }

    const newCounts = { ...counts, [name]: (counts[name] || 0) + 1 };
    const newLog = {
      id: Date.now(),
      name,
      reason,
      by: 'Tongkrongan',
      timestamp: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    };
    const newLogs = [newLog, ...logs.slice(0, 49)];

    updateGlobalState(newCounts, newLogs);

    // Call local dev API if running in dev mode
    if (import.meta.env.DEV) {
      try {
        await fetch('/api/scam', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'INCREMENT', name, reason, by: 'Tongkrongan' })
        });
      } catch (err) {}
    }
  };

  const handleDecrement = async (name, e = null) => {
    playPopSound('down');
    const newCounts = { ...counts, [name]: Math.max(0, (counts[name] || 0) - 1) };
    const newLog = {
      id: Date.now(),
      name,
      reason: 'Dikurangi 1 scam (Salah pencet / Ampunan)',
      by: 'Tongkrongan',
      timestamp: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    };
    const newLogs = [newLog, ...logs.slice(0, 49)];

    updateGlobalState(newCounts, newLogs);

    if (import.meta.env.DEV) {
      try {
        await fetch('/api/scam', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'DECREMENT', name, by: 'Tongkrongan' })
        });
      } catch (err) {}
    }
  };

  const handleResetPerson = async (name) => {
    if (!window.confirm(`Reset jumlah scam ${name} kembali ke 0?`)) return;
    playPopSound('down');
    const newCounts = { ...counts, [name]: 0 };
    const newLog = {
      id: Date.now(),
      name,
      reason: `Hitungan scam ${name} di-reset ke 0`,
      by: 'System',
      timestamp: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    };
    const newLogs = [newLog, ...logs.slice(0, 49)];

    updateGlobalState(newCounts, newLogs);

    if (import.meta.env.DEV) {
      try {
        await fetch('/api/scam', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'RESET_PERSON', name })
        });
      } catch (e) {}
    }
  };

  const handleResetAll = async () => {
    if (!window.confirm('Yakin mau reset SEMUA hitungan scam hari ini?')) return;
    const newCounts = { Rifqi: 0, Ilham: 0, Jonathan: 0, Fatwa: 0, Agung: 0, Dini: 0 };
    const newLogs = [];

    updateGlobalState(newCounts, newLogs);

    if (import.meta.env.DEV) {
      try {
        await fetch('/api/scam', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'RESET' })
        });
      } catch (e) {}
    }
  };

  const handleRandomizeEmoji = (name) => {
    const current = avatars[name];
    let nextEmoji;
    do {
      nextEmoji = EMOJI_POOL[Math.floor(Math.random() * EMOJI_POOL.length)];
    } while (nextEmoji === current && EMOJI_POOL.length > 1);

    setAvatars(prev => ({ ...prev, [name]: nextEmoji }));
    playPopSound('up');
  };

  return (
    <div className="container">
      {/* Audio Player for DJ Mahjong Song */}
      <audio 
        ref={audioRef} 
        src={audioSrc} 
        preload="auto"
      />

      {/* Canvas layer for particle burst */}
      <canvas 
        ref={canvasRef} 
        style={{ position: 'fixed', top: 0, left: 0, pointerEvents: 'none', zIndex: 9999 }} 
      />

      {/* Header */}
      <header className="app-header">
        <div className="title-badge">🚨 Official Tongkrongan Tracker</div>
        <h1 className="app-title">SCAM COUNTER HARI INI</h1>
        <p className="app-subtitle">
          Pencatat ngibulin temen real-time! Tambah/kurangi hitungan scam, acak emoji avatar, & tandingkan siapa Raja Scammer hari ini!
        </p>

        <div className="status-bar">
          <div className="status-indicator">
            <span className="pulse-dot"></span>
            {isConnected ? 'Real-time Live Sync (Terhubung)' : 'Mode Lokal / Offline'}
          </div>

          <button 
            onClick={toggleMusic} 
            className="btn-reason"
            style={{ 
              width: 'auto', 
              background: isPlayingMusic ? 'rgba(245, 158, 11, 0.2)' : 'rgba(255, 255, 255, 0.06)',
              borderColor: isPlayingMusic ? '#F59E0B' : 'rgba(255, 255, 255, 0.1)'
            }}
          >
            {isPlayingMusic ? '🎵 DJ Mahjong (Main 10dtk 🔊)' : '🔊 Putar 10dtk DJ Mahjong'}
          </button>

          <button onClick={handleResetAll} className="btn-reset">
            🔄 Reset Semua Member
          </button>
        </div>
      </header>

      {/* Overview Banner */}
      <div className="overview-card">
        <div className="stat-item">
          <span className="stat-label">Total Scam Hari Ini</span>
          <span className="stat-value">{totalScams} 🔥</span>
        </div>
        <div className="stat-item">
          <span className="stat-label">Raja Scammer (Top 1)</span>
          <span className="stat-value stat-highlight">
            {topScammer ? `👑 ${topScammer} (${maxCount}x)` : 'Belum Ada 😇'}
          </span>
        </div>
      </div>

      {/* King DJ Music Banner Notification */}
      {topScammer && (
        <div 
          style={{
            background: 'linear-gradient(135deg, rgba(245, 158, 11, 0.25), rgba(217, 119, 6, 0.15))',
            border: '1px solid #F59E0B',
            borderRadius: '16px',
            padding: '12px 20px',
            marginBottom: '28px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
            boxShadow: '0 0 20px rgba(245, 158, 11, 0.2)'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '1.5rem' }}>🀄🎵</span>
            <div>
              <strong style={{ color: '#F59E0B' }}>KING OF SCAM: {topScammer}!</strong>
              <div style={{ fontSize: '0.82rem', color: '#D1D5DB' }}>
                Memutar lagu 10 detik "Puad Squad Team DJ Mahjong" 🔥
              </div>
            </div>
          </div>
          <button 
            onClick={toggleMusic} 
            className="btn-reason"
            style={{ width: 'auto', padding: '6px 12px', fontSize: '0.8rem' }}
          >
            {isPlayingMusic ? '⏸ Pause (10dtk)' : '▶ Putar (10dtk)'}
          </button>
        </div>
      )}

      {/* Cards Grid */}
      <div className="cards-grid">
        {INITIAL_PEOPLE.map(person => {
          const count = counts[person.name] || 0;
          const isKing = topScammer === person.name;
          const currentEmoji = avatars[person.name] || person.defaultAvatar;

          return (
            <div 
              key={person.name} 
              className={`person-card ${person.colorClass} ${isKing ? 'king-scammer' : ''}`}
            >
              {isKing && <div className="king-banner">👑 KING OF SCAM</div>}
              
              <div 
                className="avatar-wrapper"
                title="Klik untuk acak emoji!"
                onClick={() => handleRandomizeEmoji(person.name)}
              >
                {currentEmoji}
              </div>
              <button 
                className="btn-random-emoji"
                onClick={() => handleRandomizeEmoji(person.name)}
              >
                🎲 Acak Emoji
              </button>
              
              <h2 className="person-name">{person.name}</h2>
              <span className="person-tag">{person.title}</span>
              
              <div className="counter-box">
                <div className="count-number">{count}</div>
                <div className="count-label">kali ngibulin</div>
              </div>

              <div className="card-actions">
                <div className="counter-controls">
                  <button 
                    className="btn-control btn-dec"
                    title="Kurangi 1 scam"
                    onClick={(e) => handleDecrement(person.name, e)}
                  >
                    -1
                  </button>
                  <button 
                    className="btn-control btn-inc"
                    onClick={(e) => handleIncrement(person.name, 'Ngebual / Ngibulin temen', e)}
                  >
                    ⚡ +1 SCAM!
                  </button>
                  <button 
                    className="btn-control btn-reset-person"
                    title="Reset hitungan orang ini"
                    onClick={() => handleResetPerson(person.name)}
                  >
                    ↺ Reset
                  </button>
                </div>

                <button 
                  className="btn-reason"
                  onClick={() => setSelectedPerson(person.name)}
                >
                  📝 + Alasan Spesifik...
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Live Activity Feed */}
      <section className="feed-section">
        <div className="feed-header">
          <h3 className="feed-title">
            <span>📢</span> Catatan Aksi Scam Terbaru
          </h3>
          <span style={{ fontSize: '0.8rem', color: '#9CA3AF' }}>{logs.length} riwayat</span>
        </div>

        <div className="feed-list">
          {logs.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '20px', color: '#9CA3AF', fontSize: '0.9rem' }}>
              Belum ada riwayat scam hari ini. Temen-temen masih alim! 😇
            </div>
          ) : (
            logs.map((item) => (
              <div key={item.id} className="feed-item">
                <div>
                  <span className="feed-user">{item.name}</span>
                  {' '}:{' '}
                  <span className="feed-reason">"{item.reason}"</span>
                </div>
                <span className="feed-time">{item.timestamp}</span>
              </div>
            ))
          )}
        </div>
      </section>

      {/* Modal for adding custom / preset reason */}
      {selectedPerson && (
        <div className="modal-overlay" onClick={() => setSelectedPerson(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <h3 className="modal-header">
              Tambah Scam untuk <span style={{ color: '#3B82F6' }}>{selectedPerson}</span>
            </h3>
            
            <p style={{ fontSize: '0.85rem', color: '#9CA3AF', marginBottom: '12px' }}>
              Pilih alasan bawaan atau tulis sendiri:
            </p>

            <div className="preset-reasons">
              {PRESET_REASONS.map((preset, idx) => (
                <button 
                  key={idx} 
                  className="preset-btn"
                  onClick={() => {
                    handleIncrement(selectedPerson, preset);
                    setSelectedPerson(null);
                  }}
                >
                  👉 {preset}
                </button>
              ))}
            </div>

            <input 
              type="text" 
              className="custom-input"
              placeholder="Tulis alasan scam custom..."
              value={customReason}
              onChange={e => setCustomReason(e.target.value)}
            />

            <div className="modal-actions">
              <button className="btn-cancel" onClick={() => setSelectedPerson(null)}>
                Batal
              </button>
              <button 
                className="btn-submit"
                onClick={() => {
                  if (customReason.trim()) {
                    handleIncrement(selectedPerson, customReason.trim());
                    setCustomReason('');
                    setSelectedPerson(null);
                  }
                }}
              >
                Kirim Scam 🚀
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
