import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import fs from 'fs'

let clients = [];
let scamData = {
  counts: {
    Rifqi: 0,
    Ilham: 0,
    Jonathan: 0,
    Fatwa: 0,
    Agung: 0,
    Dini: 0
  },
  logs: [
    {
      id: 1,
      name: 'Rifqi',
      reason: 'Bilang OTW padahal baru mandi',
      by: 'Temen',
      timestamp: '10:15:00'
    },
    {
      id: 2,
      name: 'Jonathan',
      reason: 'Traktir es teh tapi minta gantian 20rb',
      by: 'Temen',
      timestamp: '10:30:12'
    }
  ]
};

function scamSyncPlugin() {
  return {
    name: 'scam-sync-plugin',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url === '/api/king-song.mp3') {
          const mp3Path = '/home/morkarito/Documents/puad_squad_team_dj_lagi_santai_dapat_kawan_baru_main_mahjong_dj_.mp3';
          if (fs.existsSync(mp3Path)) {
            const stat = fs.statSync(mp3Path);
            res.writeHead(200, {
              'Content-Type': 'audio/mpeg',
              'Content-Length': stat.size,
              'Accept-Ranges': 'bytes',
              'Cache-Control': 'public, max-age=3600'
            });
            fs.createReadStream(mp3Path).pipe(res);
          } else {
            res.writeHead(404);
            res.end('Song file not found');
          }
          return;
        }

        if (req.url === '/api/events') {
          res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            'Access-Control-Allow-Origin': '*'
          });
          clients.push(res);
          res.write(`data: ${JSON.stringify({ type: 'INIT', data: scamData })}\n\n`);
          req.on('close', () => {
            clients = clients.filter(c => c !== res);
          });
          return;
        }

        if (req.url === '/api/scam' && req.method === 'POST') {
          let body = '';
          req.on('data', chunk => { body += chunk; });
          req.on('end', () => {
            try {
              const payload = JSON.parse(body);
              if (payload.type === 'INCREMENT' && scamData.counts.hasOwnProperty(payload.name)) {
                scamData.counts[payload.name] = (scamData.counts[payload.name] || 0) + 1;
                const newLog = {
                  id: Date.now(),
                  name: payload.name,
                  reason: payload.reason || 'Ngebual / Ngibulin temen',
                  by: payload.by || 'Seseorang',
                  timestamp: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
                };
                scamData.logs.unshift(newLog);
                if (scamData.logs.length > 50) scamData.logs.pop();

                const msg = `data: ${JSON.stringify({ type: 'UPDATE', data: scamData, newLog })}\n\n`;
                clients.forEach(c => c.write(msg));
              } else if (payload.type === 'DECREMENT' && scamData.counts.hasOwnProperty(payload.name)) {
                scamData.counts[payload.name] = Math.max(0, (scamData.counts[payload.name] || 0) - 1);
                const newLog = {
                  id: Date.now(),
                  name: payload.name,
                  reason: 'Dikurangi 1 scam (Salah pencet / Ampunan)',
                  by: payload.by || 'Seseorang',
                  timestamp: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
                };
                scamData.logs.unshift(newLog);
                if (scamData.logs.length > 50) scamData.logs.pop();

                const msg = `data: ${JSON.stringify({ type: 'UPDATE', data: scamData, newLog })}\n\n`;
                clients.forEach(c => c.write(msg));
              } else if (payload.type === 'RESET_PERSON' && scamData.counts.hasOwnProperty(payload.name)) {
                scamData.counts[payload.name] = 0;
                const newLog = {
                  id: Date.now(),
                  name: payload.name,
                  reason: `Hitungan scam ${payload.name} di-reset ke 0`,
                  by: 'System',
                  timestamp: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
                };
                scamData.logs.unshift(newLog);
                if (scamData.logs.length > 50) scamData.logs.pop();

                const msg = `data: ${JSON.stringify({ type: 'UPDATE', data: scamData, newLog })}\n\n`;
                clients.forEach(c => c.write(msg));
              } else if (payload.type === 'RESET') {
                scamData.counts = { Rifqi: 0, Ilham: 0, Jonathan: 0, Fatwa: 0, Agung: 0, Dini: 0 };
                scamData.logs = [];
                const msg = `data: ${JSON.stringify({ type: 'INIT', data: scamData })}\n\n`;
                clients.forEach(c => c.write(msg));
              }
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ success: true, data: scamData }));
            } catch (err) {
              res.writeHead(400);
              res.end('Bad Request');
            }
          });
          return;
        }

        next();
      });
    }
  }
}

// https://vite.dev/config/
export default defineConfig({
  base: '/scam-counter/',
  plugins: [react(), scamSyncPlugin()],
  server: {
    allowedHosts: true
  }
})

