class RoomManager {
  constructor() {
    this.rooms = new Map();
  }

  joinRoom(socketId, roomName, user) {
    if (!this.rooms.has(roomName)) {
      this.rooms.set(roomName, new Map());
    }
    const room = this.rooms.get(roomName);
    room.set(socketId, { ...user, socketId, joinedAt: Date.now() });
    return this.getRoomUsers(roomName);
  }

  leaveRoom(socketId, roomName) {
    const room = this.rooms.get(roomName);
    if (!room) return [];
    room.delete(socketId);
    if (room.size === 0) {
      this.rooms.delete(roomName);
    }
    return this.getRoomUsers(roomName);
  }

  leaveAllRooms(socketId) {
    const leftRooms = [];
    for (const [roomName, room] of this.rooms.entries()) {
      if (room.has(socketId)) {
        room.delete(socketId);
        leftRooms.push(roomName);
        if (room.size === 0) {
          this.rooms.delete(roomName);
        }
      }
    }
    return leftRooms;
  }

  getRoomUsers(roomName) {
    const room = this.rooms.get(roomName);
    if (!room) return [];
    return Array.from(room.values());
  }

  getOnlineUsers() {
    const users = [];
    for (const [, room] of this.rooms.entries()) {
      for (const user of room.values()) {
        users.push(user);
      }
    }
    return users;
  }

  isUserOnline(userId) {
    for (const [, room] of this.rooms.entries()) {
      for (const [, user] of room.entries()) {
        if (user.userId === userId) return true;
      }
    }
    return false;
  }

  getUserSocketId(userId) {
    for (const [, room] of this.rooms.entries()) {
      for (const [socketId, user] of room.entries()) {
        if (user.userId === userId) return socketId;
      }
    }
    return null;
  }
}

module.exports = new RoomManager();
