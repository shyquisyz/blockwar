'use strict';
const WebSocket = require('ws');
const wss = new WebSocket.Server({ port: process.env.PORT || 3000 });

const rooms = {};
const CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const genCode = () => Array.from({length:5}, () => CHARS[Math.random()*CHARS.length|0]).join('');

wss.on('connection', ws => {
  let code = null, slot = null;

  const relay = raw => {
    if (!code || !rooms[code]) return;
    const peer = rooms[code][1 - slot];
    if (peer && peer.readyState === WebSocket.OPEN) peer.send(raw);
  };

  ws.on('message', raw => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }

    if (msg.type === 'create') {
      do { code = genCode(); } while (rooms[code]);
      rooms[code] = [ws, null];
      slot = 0;
      ws.send(JSON.stringify({ type: 'created', code }));
      console.log(`[${code}] created`);

    } else if (msg.type === 'join') {
      const c = (msg.code || '').toUpperCase().trim();
      if (!rooms[c]) {
        ws.send(JSON.stringify({ type: 'error', msg: '방을 찾을 수 없습니다' })); return;
      }
      if (rooms[c][1]) {
        ws.send(JSON.stringify({ type: 'error', msg: '방이 꽉 찼습니다' })); return;
      }
      code = c; slot = 1;
      rooms[code][1] = ws;
      console.log(`[${code}] player 2 joined`);
      rooms[code][0].send(JSON.stringify({ type: 'start', yourSlot: 0 }));
      rooms[code][1].send(JSON.stringify({ type: 'start', yourSlot: 1 }));

    } else {
      relay(raw);
    }
  });

  ws.on('close', () => {
    if (!code || !rooms[code]) return;
    relay(JSON.stringify({ type: 'disconnect' }));
    rooms[code][slot] = null;
    if (!rooms[code][0] && !rooms[code][1]) {
      delete rooms[code];
      console.log(`[${code}] room closed`);
    }
  });

  ws.on('error', err => console.error('ws error:', err.message));
});

console.log('BLOCK WAR relay server on port', process.env.PORT || 3000);
