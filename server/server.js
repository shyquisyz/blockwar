'use strict';
const WebSocket = require('ws');
const wss = new WebSocket.Server({ port: process.env.PORT || 3000 });

const rooms = {};
const CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const genCode = () => Array.from({length:5}, () => CHARS[Math.random()*CHARS.length|0]).join('');

wss.on('connection', ws => {
  let code = null, slot = null;

  const relay = (data, type) => {
    if (!code || !rooms[code]) return;
    const peer = rooms[code][1 - slot];
    if (peer && peer.readyState === WebSocket.OPEN) {
      peer.send(data);
    } else if (type === 'state' || type === 'shot' || type === 'hit') {
      console.log(`[${code}] RELAY FAILED (${type}) — peer slot${1-slot} not open`);
    }
  };

  ws.on('message', raw => {
    const data = raw.toString();
    let msg;
    try { msg = JSON.parse(data); } catch { return; }

    if (msg.type === 'create') {
      do { code = genCode(); } while (rooms[code]);
      rooms[code] = [ws, null];
      slot = 0;
      ws.send(JSON.stringify({ type: 'created', code }));
      console.log(`[${code}] ROOM CREATED`);

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
      console.log(`[${code}] PLAYER JOINED`);
      rooms[code][0].send(JSON.stringify({ type: 'start', yourSlot: 0 }));
      rooms[code][1].send(JSON.stringify({ type: 'start', yourSlot: 1 }));
      console.log(`[${code}] GAME START`);

    } else {
      relay(data, msg.type);
    }
  });

  ws.on('close', () => {
    if (!code || !rooms[code]) return;
    relay(JSON.stringify({ type: 'disconnect' }), 'disconnect');
    rooms[code][slot] = null;
    if (!rooms[code][0] && !rooms[code][1]) {
      delete rooms[code];
      console.log(`[${code}] room closed`);
    }
  });

  ws.on('error', err => console.error('ws error:', err.message));
});

console.log('BLOCK WAR relay server on port', process.env.PORT || 3000);
