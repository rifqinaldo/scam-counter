import { useState, useEffect, useRef } from 'react';
import './index.css';
import { fetchLiveData, pushLiveData } from './syncService';

const EMOJI_POOL = [
  '🦊', '👺', '😈', '🤡', '🦁', '🐼', '🤖', '🐙', 
  '🦄', '👽', '🤠', '👾', '👻', '🎃', '🦖', '😎', 
  '🐸', '🥸', '🥷', '💩', '🤪', '🗿'
];

const COLOR_CLASSES = ['rifqi', 'ilham', 'jonathan', 'fatwa', 'agung', 'dini'];

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
  // Dynamic people list state
  const [people, setPeople] = useState(() => {
    const saved = localStorage.getItem('scam_people_v3');
    if (saved) {
      try { return JSON.parse(saved); } catch (e) {}
    }
    return INITIAL_PEOPLE;
  });

  // Load initial counts from localStorage so refresh NEVER resets to 0
  const [counts, setCounts] = useState(() => {
    const saved = localStorage.getItem('scam_counts_v2');
    if (saved) {
      try { return JSON.parse(saved); } catch (e) {}
    }
    return INITIAL_PEOPLE.reduce((acc, p) => ({ ...acc, [p.name]: 0 }), {});
  });

  const [logs, setLogs] = useState(() => {
    const saved = localStorage.getItem('scam_logs_v2');
    if (saved) {
      try { return JSON.parse(saved); } catch (e) {}
    }
    return [];
  });

  const [isConnected, setIsConnected] = useState(true);
  const [selectedPerson, setSelectedPerson] = useState(null);
  const [customReason, setCustomReason] = useState('');
  const [isPlayingMusic, setIsPlayingMusic] = useState(false);
  const [isMuted, setIsMuted] = useState(false);

  // Modal for adding a new member
  const [isAddMemberOpen, setIsAddMemberOpen] = useState(false);
  const [newMemberName, setNewMemberName] = useState('');
  const [newMemberTitle, setNewMemberTitle] = useState('');
  const [newMemberAvatar, setNewMemberAvatar] = useState('😎');
  
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
  const currentShaRef = useRef(null);
  // Timestamp of the last local user action (ms since epoch)
  const lastUserActionRef = useRef(0);
  // Timestamp of the data currently shown (from cloud or local)
  const localUpdatedAtRef = useRef(0);

  // Save avatars to localStorage
  useEffect(() => {
    localStorage.setItem('scam_avatars', JSON.stringify(avatars));
  }, [avatars]);

  // Real-time BroadcastChannel for instant local tab sync
  useEffect(() => {
    try {
      const channel = new BroadcastChannel('scam_counter_channel');
      channelRef.current = channel;
      channel.onmessage = (event) => {
        if (event.data?.type === 'SYNC') {
          if (event.data.people) setPeople(event.data.people);
          if (event.data.counts) setCounts(event.data.counts);
          if (event.data.logs) setLogs(event.data.logs);
          if (event.data.avatars) setAvatars(event.data.avatars);
          if (event.data.updatedAt) {
            localUpdatedAtRef.current = event.data.updatedAt;
            lastUserActionRef.current = event.data.updatedAt;
          }
          playPopSound('up');
        }
      };
    } catch (e) {}
    return () => {
      if (channelRef.current) channelRef.current.close();
    };
  }, []);

  // Poll cloud data every 3s — use timestamp to determine who wins conflict
  useEffect(() => {
    let isMounted = true;

    const syncWithCloud = async () => {
      const res = await fetchLiveData();
      if (!res || !res.data || !isMounted) return;

      setIsConnected(true);
      if (res.sha) currentShaRef.current = res.sha;

      const cloudUpdatedAt = res.data.updatedAt || 0;
      const cloudPeople = res.data.people || null;
      const cloudCounts = res.data.counts || {};
      const cloudLogs = res.data.logs || [];
      const cloudAvatars = res.data.avatars || null;

      // If user acted recently AND our local data is newer, skip overwrite
      const timeSinceLastAction = Date.now() - lastUserActionRef.current;
      const localIsNewer = localUpdatedAtRef.current >= cloudUpdatedAt;

      if (timeSinceLastAction < 8000 && localIsNewer) {
        return;
      }

      // Cloud is newer — accept cloud state
      if (cloudUpdatedAt > localUpdatedAtRef.current) {
        localUpdatedAtRef.current = cloudUpdatedAt;

        if (cloudPeople && Array.isArray(cloudPeople)) {
          setPeople(cloudPeople);
          try { localStorage.setItem('scam_people_v3', JSON.stringify(cloudPeople)); } catch (e) {}
        }
        if (cloudAvatars) {
          setAvatars(cloudAvatars);
          try { localStorage.setItem('scam_avatars', JSON.stringify(cloudAvatars)); } catch (e) {}
        }

        setCounts(cloudCounts);
        setLogs(cloudLogs);

        try {
          localStorage.setItem('scam_counts_v2', JSON.stringify(cloudCounts));
          localStorage.setItem('scam_logs_v2', JSON.stringify(cloudLogs));
        } catch (e) {}
      }
    };

    // Initial fetch
    syncWithCloud();

    // Live polling every 3 seconds
    const interval = setInterval(syncWithCloud, 3000);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  // Save state to Cloud + LocalStorage + BroadcastChannel
  const saveState = async (newCounts, newLogs, newPeople = people, newAvatars = avatars) => {
    const now = Date.now();
    lastUserActionRef.current = now;
    localUpdatedAtRef.current = now;

    setCounts(newCounts);
    setLogs(newLogs);
    setPeople(newPeople);
    setAvatars(newAvatars);

    // Save to LocalStorage immediately
    try {
      localStorage.setItem('scam_people_v3', JSON.stringify(newPeople));
      localStorage.setItem('scam_counts_v2', JSON.stringify(newCounts));
      localStorage.setItem('scam_logs_v2', JSON.stringify(newLogs));
      localStorage.setItem('scam_avatars', JSON.stringify(newAvatars));
    } catch (e) {}

    // Broadcast across local browser tabs (instant)
    if (channelRef.current) {
      try {
        channelRef.current.postMessage({
          type: 'SYNC',
          people: newPeople,
          counts: newCounts,
          logs: newLogs,
          avatars: newAvatars,
          updatedAt: now
        });
      } catch (e) {}
    }

    // Push to GitHub Cloud
    try {
      const payload = {
        people: newPeople,
        counts: newCounts,
        logs: newLogs,
        avatars: newAvatars
      };
      const newSha = await pushLiveData(payload, currentShaRef.current);
      if (newSha) {
        currentShaRef.current = newSha;
        localUpdatedAtRef.current = now;
      }
    } catch (e) {}
  };

  // Handler to Add a New Member
  const handleAddMember = (e) => {
    e.preventDefault();
    const trimmedName = newMemberName.trim();
    if (!trimmedName) {
      alert('Nama member tidak boleh kosong!');
      return;
    }

    // Check duplicate
    if (people.some(p => p.name.toLowerCase() === trimmedName.toLowerCase())) {
      alert(`Member dengan nama "${trimmedName}" sudah ada!`);
      return;
    }

    const title = newMemberTitle.trim() || 'Tukang Wacana';
    const colorClass = COLOR_CLASSES[people.length % COLOR_CLASSES.length];
    const avatar = newMemberAvatar || '😎';

    const newPerson = {
      name: trimmedName,
      title: title,
      defaultAvatar: avatar,
      colorClass: colorClass
    };

    const newPeopleList = [...people, newPerson];
    const newCounts = { ...counts, [trimmedName]: 0 };
    const newAvatars = { ...avatars, [trimmedName]: avatar };
    
    const newLog = {
      id: Date.now(),
      name: trimmedName,
      reason: `Member baru "${trimmedName}" bergabung ke tongkrongan 🎉`,
      by: 'System',
      timestamp: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    };
    const newLogs = [newLog, ...logs.slice(0, 49)];

    saveState(newCounts, newLogs, newPeopleList, newAvatars);

    playPopSound('up');
    setNewMemberName('');
    setNewMemberTitle('');
    setNewMemberAvatar('😎');
    setIsAddMemberOpen(false);
  };

  // Handler to Remove a Member
  const handleRemoveMember = (name) => {
    if (!window.confirm(`Yakin mau menghapus ${name} dari daftar member?`)) return;

    const newPeopleList = people.filter(p => p.name !== name);
    const newCounts = { ...counts };
    delete newCounts[name];

    const newAvatars = { ...avatars };
    delete newAvatars[name];

    const newLog = {
      id: Date.now(),
      name,
      reason: `Member "${name}" telah dihapus dari tongkrongan 🚪`,
      by: 'System',
      timestamp: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    };
    const newLogs = [newLog, ...logs.slice(0, 49)];

    saveState(newCounts, newLogs, newPeopleList, newAvatars);
    playPopSound('down');
  };

  // Find Top Scammer (King)
  const maxCount = Math.max(...Object.values(counts), 0);
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
      }, 10000);
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

  const handleIncrement = (name, reason = 'Ngebual / Ngibulin temen', e = null) => {
    if (e) triggerConfetti(e);
    playPopSound('up');

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

    saveState(newCounts, newLogs);
  };

  const handleDecrement = (name, e = null) => {
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

    saveState(newCounts, newLogs);
  };

  const handleResetPerson = (name) => {
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

    saveState(newCounts, newLogs);
  };

  const handleResetAll = () => {
    if (!window.confirm('Yakin mau reset SEMUA hitungan scam hari ini?')) return;
    const newCounts = people.reduce((acc, p) => ({ ...acc, [p.name]: 0 }), {});
    const newLogs = [];

    saveState(newCounts, newLogs);
  };

  const handleRandomizeEmoji = (name) => {
    const current = avatars[name] || '😎';
    let nextEmoji;
    do {
      nextEmoji = EMOJI_POOL[Math.floor(Math.random() * EMOJI_POOL.length)];
    } while (nextEmoji === current && EMOJI_POOL.length > 1);

    const newAvatars = { ...avatars, [name]: nextEmoji };
    setAvatars(newAvatars);
    saveState(counts, logs, people, newAvatars);
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
          Pencatat ngibulin temen real-time! Tambah member baru, tambah/kurangi hitungan scam, & tandingkan siapa Raja Scammer hari ini!
        </p>

        <div className="status-bar">
          <div className="status-indicator">
            <span className="pulse-dot"></span>
            {isConnected ? 'Live Cloud Sync (Terhubung Realtime)' : 'Menghubungkan...'}
          </div>

          <button 
            onClick={() => setIsAddMemberOpen(true)}
            className="btn-reason"
            style={{ 
              width: 'auto', 
              background: 'rgba(59, 130, 246, 0.2)',
              borderColor: '#3B82F6',
              color: '#60A5FA',
              fontWeight: '700'
            }}
          >
            ➕ Tambah Member Baru
          </button>

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
          <span className="stat-label">Total Member</span>
          <span className="stat-value">{people.length} 👥</span>
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
        {people.map(person => {
          const count = counts[person.name] || 0;
          const isKing = topScammer === person.name;
          const currentEmoji = avatars[person.name] || person.defaultAvatar || '😎';

          return (
            <div 
              key={person.name} 
              className={`person-card ${person.colorClass || 'rifqi'} ${isKing ? 'king-scammer' : ''}`}
              style={{ position: 'relative' }}
            >
              {/* Delete Member Button */}
              <button 
                onClick={() => handleRemoveMember(person.name)}
                title="Hapus member ini"
                style={{
                  position: 'absolute',
                  top: '12px',
                  right: '12px',
                  background: 'rgba(239, 68, 68, 0.15)',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                  color: '#EF4444',
                  borderRadius: '50%',
                  width: '26px',
                  height: '26px',
                  cursor: 'pointer',
                  fontSize: '0.75rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  zIndex: 2
                }}
              >
                ✕
              </button>

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

      {/* Modal Add New Member */}
      {isAddMemberOpen && (
        <div className="modal-overlay" onClick={() => setIsAddMemberOpen(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <h3 className="modal-header">
              ➕ Tambah Member Tongkrongan Baru
            </h3>
            
            <form onSubmit={handleAddMember}>
              <div style={{ marginBottom: '14px' }}>
                <label style={{ display: 'block', fontSize: '0.85rem', color: '#9CA3AF', marginBottom: '6px' }}>
                  Nama Member:
                </label>
                <input 
                  type="text" 
                  className="custom-input"
                  placeholder="Contoh: Budi, Agus, dll..."
                  value={newMemberName}
                  onChange={e => setNewMemberName(e.target.value)}
                  autoFocus
                />
              </div>

              <div style={{ marginBottom: '14px' }}>
                <label style={{ display: 'block', fontSize: '0.85rem', color: '#9CA3AF', marginBottom: '6px' }}>
                  Gelar / Julukan (Opsional):
                </label>
                <input 
                  type="text" 
                  className="custom-input"
                  placeholder="Contoh: Si Tukang Janji, Master Wacana..."
                  value={newMemberTitle}
                  onChange={e => setNewMemberTitle(e.target.value)}
                />
              </div>

              <div style={{ marginBottom: '18px' }}>
                <label style={{ display: 'block', fontSize: '0.85rem', color: '#9CA3AF', marginBottom: '6px' }}>
                  Pilih Emoji Avatar:
                </label>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', maxHeight: '110px', overflowY: 'auto', padding: '4px' }}>
                  {EMOJI_POOL.map((emoji) => (
                    <button
                      type="button"
                      key={emoji}
                      onClick={() => setNewMemberAvatar(emoji)}
                      style={{
                        background: newMemberAvatar === emoji ? 'rgba(59, 130, 246, 0.3)' : 'rgba(255, 255, 255, 0.05)',
                        border: newMemberAvatar === emoji ? '2px solid #3B82F6' : '1px solid rgba(255, 255, 255, 0.1)',
                        borderRadius: '10px',
                        fontSize: '1.4rem',
                        padding: '6px 10px',
                        cursor: 'pointer',
                        transition: 'transform 0.15s'
                      }}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              </div>

              <div className="modal-actions">
                <button type="button" className="btn-cancel" onClick={() => setIsAddMemberOpen(false)}>
                  Batal
                </button>
                <button type="submit" className="btn-submit">
                  Simpan Member 🚀
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

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
