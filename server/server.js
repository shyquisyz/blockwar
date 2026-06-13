'use strict';
const WebSocket = require('ws');
const wss = new WebSocket.Server({ port: process.env.PORT || 3000 });

const rooms = {};
const CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const genCode = () => Array.from({length:5}, () => CHARS[Math.random()*CHARS.length|0]).join('');

wss.on('connection', ws => {
  let code = null, slot = null;

  // 룸 내 다른 모든 플레이어에게 브로드캐스트
  const broadcast = (data, type) => {
    if (!code || !rooms[code]) return;
    let sent = 0;
    rooms[code].slots.forEach((peer, i) => {
      if (i !== slot && peer && peer.readyState === WebSocket.OPEN) {
        peer.send(data); sent++;
      }
    });
    if (sent === 0 && (type === 'state' || type === 'shot' || type === 'hit')) {
      console.log(`[${code}] BROADCAST FAILED (${type}) — no peers open`);
    }
  };

  ws.on('message', raw => {
    const data = raw.toString();
    let msg;
    try { msg = JSON.parse(data); } catch { return; }

    if (msg.type === 'create') {
      const mode = msg.mode || '1v1';
      const maxSlots = mode === 'coop3' ? 3 : 2;
      do { code = genCode(); } while (rooms[code]);
      rooms[code] = { slots: new Array(maxSlots).fill(null), mode, maxSlots };
      rooms[code].slots[0] = ws;
      slot = 0;
      ws.send(JSON.stringify({ type: 'created', code, mode, maxSlots }));
      console.log(`[${code}] ROOM CREATED mode=${mode}`);

    } else if (msg.type === 'join') {
      const c = (msg.code || '').toUpperCase().trim();
      if (!rooms[c]) {
        ws.send(JSON.stringify({ type: 'error', msg: '방을 찾을 수 없습니다' })); return;
      }
      const room = rooms[c];
      const emptySlot = room.slots.indexOf(null);
      if (emptySlot === -1) {
        ws.send(JSON.stringify({ type: 'error', msg: '방이 꽉 찼습니다' })); return;
      }
      code = c; slot = emptySlot;
      room.slots[slot] = ws;
      console.log(`[${code}] PLAYER JOINED slot=${slot} mode=${room.mode}`);

      const filled = room.slots.filter(Boolean).length;
      if (filled === room.maxSlots) {
        // 모든 플레이어 입장 완료 → 게임 시작
        room.slots.forEach((s, i) => {
          if (s && s.readyState === WebSocket.OPEN) {
            s.send(JSON.stringify({ type: 'start', yourSlot: i, mode: room.mode, maxSlots: room.maxSlots }));
          }
        });
        console.log(`[${code}] GAME START (${room.mode} ${filled}/${room.maxSlots})`);
      } else {
        // 아직 대기 중 → 현재 인원 알림 (전원에게)
        room.slots.forEach((s, i) => {
          if (s && s.readyState === WebSocket.OPEN) {
            s.send(JSON.stringify({ type: 'waiting', filled, maxSlots: room.maxSlots, yourSlot: i }));
          }
        });
      }

    } else {
      broadcast(data, msg.type);
    }
  });

  ws.on('close', () => {
    if (!code || !rooms[code]) return;
    broadcast(JSON.stringify({ type: 'disconnect', slot }), 'disconnect');
    rooms[code].slots[slot] = null;
    if (rooms[code].slots.every(s => s === null)) {
      delete rooms[code];
      console.log(`[${code}] room closed`);
    }
  });

  ws.on('error', err => console.error('ws error:', err.message));
});

console.log('BLOCK WAR relay server on port', process.env.PORT || 3000);
