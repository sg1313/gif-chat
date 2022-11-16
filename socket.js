const SocketIO = require('socket.io');
const axios = require('axios');
const cookieParser = require('cookie-parser');
const cookie = require('cookie-signature');

module.exports = (server, app, sessionMiddleware) => {
    const io = SocketIO(server, { path: '/socket.io' });
    app.set('io', io);
    const room = io.of('/room');  // socket.io를 두개로 분리했다
    const chat = io.of('/chat');

    io.use((socket, next) => {
        cookieParser(process.env.COOKIE_SECRET)(socket.request, socket.request.res, next);
        sessionMiddleware(socket.request, socket.request.res, next);
    });

    //채팅방 개설
    room.on('connection', (socket) => {
        console.log('room 네임스페이스에 접속');
        socket.on('disconnect', () => {  // socket = 사용자 개인
            console.log('room 네임스페이스 접속 해제');
        });
    });

    // 채팅방
    chat.on('connection', (socket) => {
        console.log('chat 네임스페이스에 접속');
        const req = socket.request;
        const { headers: { referer } } = req;
        const roomId = referer
            .split('/')[referer.split('/').length - 1]
            .replace(/\?.+/, '');
        socket.join(roomId); // 해당되는 roomId 에 들어온 사람 ( join 은 이벤트임)
        socket.to(roomId).emit('join', {  // 에게 메시지 전송
            user: 'system',
            chat: `${req.session.color}님이 입장하셨습니다.`,
        });

        socket.on('disconnect', () => {
            console.log('chat 네임스페이스 접속 해제');
            socket.leave(roomId);
            const currentRoom = socket.adapter.rooms[roomId];  // 방 여러개랑 연결
            const userCount = currentRoom ? currentRoom.length : 0;
            if (userCount === 0) { // 유저가 0명이면 방 삭제
                const signedCookie = cookie.sign( req.signedCookies['connect.sid'], process.env.COOKIE_SECRET );
                const connectSID = `${signedCookie}`;
                axios.delete(`http://localhost:8005/room/${roomId}`, {
                    headers: {
                        Cookie: `connect.sid=s%3A${connectSID}`
                    }
                })
                    .then(() => {
                        console.log('방 제거 요청 성공');
                    })
                    .catch((error) => {
                        console.error(error);
                    });
            } else {
                socket.to(roomId).emit('exit', {
                    user: 'system',
                    chat: `${req.session.color}님이 퇴장하셨습니다.`,
                });
            }
        });
    });
};