import express from 'express';
import cors from 'cors';
import multer from 'multer';
import { WebSocketServer, WebSocket } from 'ws';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

app.use(cors());
app.use(express.json());
// We serve the uploaded files folder statically for downloads
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Configuring Multer to store Drag & Drop files with their original names
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, path.join(__dirname, 'uploads')),
    filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`)
});
const upload = multer({ storage });

// In-memory database
const messagesState = [
    { id: 'demo-1', type: 'text', content: 'Привет! Я твой глобальный бот-органайзер. Закидывай сюда текст, ссылки или файлы через Drag & Drop!', date: Date.now() - 50000, isBot: true }
];

// 1. REST Endpoint: Binary file upload (Drag & Drop or Clip)
app.post('/api/upload', upload.single('file'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ status: 'error', message: 'No file uploaded' });
    }

    const fileUrl = `http://localhost:7070/uploads/${req.file.filename}`;
    let mediaType = 'file';

    if (req.file.mimetype.startsWith('image/')) mediaType = 'image';
    else if (req.file.mimetype.startsWith('audio/')) mediaType = 'audio';
    else if (req.file.mimetype.startsWith('video/')) mediaType = 'video';

    const newMsg = {
        id: `${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
        type: mediaType,
        content: fileUrl,
        name: req.file.originalname,
        date: Date.now()
    };

    messagesState.push(newMsg);
    broadcastToAll(newMsg); // Synchronize all open tabs
    res.json({ status: 'ok', data: newMsg });
});

// 2. ENDPOINT REST: Lazy Loading progressive by 10
app.get('/api/messages', (req, res) => {
    const offset = parseInt(req.query.offset) || 0;
    const limit = 10;

    // Reverse chronological order to segment the rows of 10
    const sorted = [...messagesState].sort((a, b) => b.date - a.date);
    const chunk = sorted.slice(offset, offset + limit);

    res.json({ status: 'ok', data: chunk, hasMore: offset + limit < messagesState.length });
});

// 🤖 Interactive Bot Logic (@chaos)
function processBotCommand(text) {
    const cleanText = text.trim();
    // The backend only listens strictly to commands that start with @chaos:
    if (!cleanText.startsWith('@chaos:')) return null;

    const commandBody = cleanText.replace('@chaos:', '').trim();
    const coreCommand = commandBody.toLowerCase();

    let reply = '';
    let statusIcon = '✅';

    const jokes = [
        'Существует 10 типов людей: те, кто понимает двоичную систему счисления, и те, кто нет.',
        'Почему программисты предпочитают темную тему? — Потому что свет привлекает багов.',
        'Разработчик — это устройство, перерабатывающее кофеин в исходный код.',
        'В мире есть две сложные вещи: инвалидация кэша, именование переменных и ошибка на единицу.'
    ];

    const quotes = [
        '«Прежде чем писать код, решите задачу». — Джон Джонсон.',
        '«Хороший код — это лучший комментарий». — Стив Макконнелл.',
        '«Программы должны писаться для людей, которые будут их читать, и только во вторую очередь — для машин, которые будут их исполнять». — Харольд Абельсон.',
        '«Если вы можете это представить, вы можете это запрограммировать». — Джон Бэкус.'
    ];

    if (coreCommand === 'help') {
        reply = '🤖 **Гид по командам Chaos Organizer:**\n\n' +
            '⚙️ `@chaos: help` - Показать это меню\n' +
            '⏰ `@chaos: time` - Текущее время сервера\n' +
            '🃏 `@chaos: joke` - Случайная шутка\n' +
            '📜 `@chaos: quote` - Мудрая цитата\n' +
            '☀️ `@chaos: weather` - Прогноз погоды';
    } else if (coreCommand === 'time') {
        reply = `Время на сервере: ${new Date().toLocaleTimeString('ru-RU')}`;
    } else if (coreCommand === 'joke') {
        reply = jokes[Math.floor(Math.random() * jokes.length)];
    } else if (coreCommand === 'quote') {
        reply = quotes[Math.floor(Math.random() * quotes.length)];
    } else if (coreCommand === 'погода' || coreCommand === 'weather') {
        const weathers = ['Солнечно, +25°C ☀️', 'Дождь, +12°C 🌧️', 'Облачно, +18°C ☁️'];
        reply = `Прогноз погоды: ${weathers[Math.floor(Math.random() * weathers.length)]}`;
    } else {
        // If the user enters a non-existent @chaos: command, we notify him with a red cross.
        statusIcon = '❌';
        reply = `❌ Неизвестная команда: "${coreCommand}"\n\n💡 Введите "@chaos: help" для просмотра списка команд.`;
    }

    return {
        id: `bot-${Date.now()}`,
        type: 'text',
        content: `${statusIcon} ${reply}`,
        date: Date.now(),
        isBot: true
    };
}

// 🔌 WEBSOCKETS CONTROLLER (SUPPORT FOR DELETING AND INFO)
wss.on('connection', (ws) => {
    ws.on('message', (message) => {
        const received = JSON.parse(message);

        if (received.type === 'text') {
            const userMsg = {
                id: `msg-${Date.now()}`,
                type: 'text',
                content: received.content,
                date: Date.now()
            };
            messagesState.push(userMsg);
            broadcastToAll(userMsg);

            const botResponse = processBotCommand(received.content);
            if (botResponse) {
                setTimeout(() => {
                    messagesState.push(botResponse);
                    broadcastToAll(botResponse);
                }, 600);
            }
        }

        // Asynchronous deletion from all screens
        if (received.type === 'delete') {
            const idx = messagesState.findIndex(m => m.id === received.id);
            if (idx !== -1) {
                const msgToDelete = messagesState[idx];

                // Store the URL in an immutable constant to safeguard the asynchronous thread
                const targetContent = msgToDelete.content;

                // HARD DRIVE ACTION: If the message contains a physical file, we delete it
                if (msgToDelete.type !== 'text' && targetContent.includes('/uploads/')) {
                    const fileName = targetContent.split('/uploads/')[1];
                    const filePath = path.join(__dirname, 'uploads', fileName);

                    fs.unlink(filePath, (err) => {
                        if (err) console.error(`❌ The physical file could not be deleted ${fileName}:`, err);
                        else console.log(`🗑️ Physical file successfully deleted from the hard drive: ${fileName}`);
                    });
                }

                // Once the path is secured, we remove it from the server's RAM
                messagesState.splice(idx, 1);

                const infoMsg = {
                    id: `info-${Date.now()}`,
                    type: 'info',
                    content: 'Вы удалили данное сообщение',
                    date: Date.now()
                };
                messagesState.push(infoMsg);
                broadcastToAll({ type: 'delete-confirm', id: received.id, infoMsg });
            }
        }

        // EMISSION OF THE GLITTER WHEN PINNING A MESSAGE
        if (received.type === 'pin-info') {
            const pinInfoMsg = {
                id: `info-${Date.now()}`,
                type: 'info',
                content: `Вы закрепили сообщение: "${received.text}"`,
                date: Date.now()
            };
            messagesState.push(pinInfoMsg);
            broadcastToAll(pinInfoMsg);
        }
    });
});


function broadcastToAll(data) {
    wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(data));
        }
    });
}

// Initialization of the uploads folder if it does not exist, to prevent crashes
if (!fs.existsSync(path.join(__dirname, 'uploads'))) {
    fs.mkdirSync(path.join(__dirname, 'uploads'));
}

server.listen(7070, () => {
    console.log('🚀 Chaos Organizer running on http://localhost:7070');
});
