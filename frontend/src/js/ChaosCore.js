import UIController from './UIController';
import MediaRecorderManager from './MediaRecorder';

export default class ChaosCore {
    constructor(appWrapper) {
        this.app = appWrapper;
        this.ws = null;
        this.ui = null;
        this.recorder = null;

        this.offset = 0;
        this.loadingMore = false;
        this.hasMoreMessages = true;

        // DOM anchors
        this.viewport = this.app.querySelector('#chat-history-viewport');
        this.textInput = this.app.querySelector('#chat-core-text-input');
        this.clipInput = this.app.querySelector('#hidden-clip-file-input');
        this.pinBar = this.app.querySelector('#pinned-message-bar');
        this.pinText = this.app.querySelector('#pinned-content-preview-text');
    }

    init() {
        this.ui = new UIController(this.viewport, this.pinBar, this.pinText);
        this.recorder = new MediaRecorderManager((t) => {
            this.app.querySelector('#voice-live-timer').innerText = t;
        });

        // REQUEST FOR NATIVE NOTIFICATION PERMISSIONS (Notification API)
        if ('Notification' in window && Notification.permission !== 'granted' && Notification.permission !== 'denied') {
            Notification.requestPermission();
        }

        this.ws = new WebSocket('ws://localhost:7070/ws');

        this.bindNetworkEvents();
        this.bindUIEvents();

        this.loadMessagesChunk();
    }

    bindNetworkEvents() {
        this.ws.addEventListener('message', (e) => {
            const data = JSON.parse(e.data);

            if (data.type === 'delete-confirm') {
                const targetBubble = this.viewport.querySelector(`[data-id="${data.id}"]`);

                if (targetBubble) {
                    // Central informative gray headband
                    const infoBlock = document.createElement('div');
                    infoBlock.className = 'chat-info-center-block';
                    infoBlock.dataset.id = data.infoMsg.id;
                    infoBlock.dataset.category = 'text'; // So that updateCounters ignores it
                    infoBlock.innerHTML = `<span>${data.infoMsg.content}</span>`;

                    // Swap the balloon for the headband at the exact same spot
                    targetBubble.replaceWith(infoBlock);
                }

                // Recalculate statistics from the 3-dot menu on the fly
                this.updateAttachmentsCounters();
                return;
            }

            // Normal reception of ordinary or informative messages
            this.ui.renderMessage(data, true);
            this.viewport.scrollTop = this.viewport.scrollHeight;
            this.offset += 1;

            this.updateAttachmentsCounters();
        });
    }


    bindUIEvents() {
        const voiceBtn = this.app.querySelector('#btn-trigger-voice-rec');
        const sendBtn = this.app.querySelector('#btn-trigger-direct-send');
        const activePanel = this.app.querySelector('#voice-recorder-active-panel');
        const emojiTriggerBtn = this.app.querySelector('#btn-trigger-emojis');
        const clipUploadBtn = this.app.querySelector('#btn-trigger-clip-upload');
        const emojisPanel = this.app.querySelector('#emojis-popover-panel');
        const mediaPanel = this.app.querySelector('#media-categories-popover-panel');
        const mediaMenuBtn = this.app.querySelector('#btn-trigger-media-menu-toggle');
        const normalFooterWrapper = this.app.querySelector('#footer-normal-controls-wrapper');
        const categoryFooterWrapper = this.app.querySelector('#footer-category-view-mode-wrapper');
        const activeCategoryLabel = this.app.querySelector('#text-display-active-category');
        const backToGeneralBtn = this.app.querySelector('#btn-trigger-back-to-general');


        this.textInput.addEventListener('input', (e) => {
            const length = e.target.value.trim().length;
            if (length > 0) {
                voiceBtn.style.display = 'none';
                sendBtn.style.display = 'flex';
            } else {
                voiceBtn.style.display = 'flex';
                sendBtn.style.display = 'none';
            }
        });

        const dispatchTextMessage = () => {
            const txt = this.textInput.value.trim();
            if (!txt) return;

            // If it is a timed alarm command, the frontend processes it locally
            if (txt.startsWith('@schedule:')) {
                this.ui.renderMessage({
                    id: `user-sched-${Date.now()}`,
                    type: 'text',
                    content: txt,
                    date: Date.now(),
                    isBot: false
                }, true);

                this.parseAndSetupReminder(txt);
                this.textInput.value = '';
                voiceBtn.style.display = 'flex';
                sendBtn.style.display = 'none';
                return;
            }

            // If it is a standard message or an @chaos: command, it travels cleanly to the backend server
            this.ws.send(JSON.stringify({ type: 'text', content: txt }));
            this.textInput.value = '';
            voiceBtn.style.display = 'flex';
            sendBtn.style.display = 'none';
        };



        this.textInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') dispatchTextMessage();
        });

        sendBtn.addEventListener('click', dispatchTextMessage);

        this.app.querySelector('#btn-trigger-clip-upload').addEventListener('click', () => this.clipInput.click());
        this.clipInput.addEventListener('change', (e) => {
            if (e.target.files && e.target.files[0]) this.uploadBinaryFile(e.target.files[0]);
        });

        this.app.addEventListener('dragover', (e) => {
            e.preventDefault();
            this.app.classList.add('dragover');
        });
        this.app.addEventListener('dragleave', () => this.app.classList.remove('dragover'));
        this.app.addEventListener('drop', (e) => {
            e.preventDefault();
            this.app.classList.remove('dragover');
            if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                this.uploadBinaryFile(e.dataTransfer.files[0]);
            }
        });

        // MIRROR CLICKS (PIN AND ASYNCHRONOUS REMOVAL)
        this.viewport.addEventListener('click', (e) => {
            const action = e.target.dataset.action;
            const bubble = e.target.closest('.chat-bubble-row');
            if (!bubble) return;

            const id = bubble.dataset.id;

            if (action === 'pin') {
                const textToPin = bubble.querySelector('div')?.innerText || '📁 [Media Attachment]';
                this.ui.updatePinnedBar(textToPin);
                if (this.ws.readyState === WebSocket.OPEN) {
                    this.ws.send(JSON.stringify({ type: 'pin-info', text: textToPin }));
                }
            } else if (action === 'delete') {
                if (this.ws.readyState === WebSocket.OPEN) {
                    this.ws.send(JSON.stringify({ type: 'delete', id }));
                }
            }
        });

        this.app.querySelector('#btn-trigger-unpin').addEventListener('click', () => this.ui.hidePinnedBar());

        // Audio recorder with buttons
        voiceBtn.addEventListener('click', async () => {
            voiceBtn.style.display = 'none';
            this.textInput.style.display = 'none';
            emojiTriggerBtn.style.display = 'none';
            clipUploadBtn.style.display = 'none';
            emojisPanel.classList.add('emojis-popover-hidden');
            activePanel.style.display = 'flex';
            await this.recorder.start();
        });

        this.app.querySelector('#btn-save-voice-rec').addEventListener('click', async () => {
            const currentEmojiBtn = this.app.querySelector('#btn-trigger-emojis');
            const currentClipBtn = this.app.querySelector('#btn-trigger-clip-upload');

            voiceBtn.style.display = 'flex';
            this.textInput.style.display = 'block';
            currentEmojiBtn.style.display = 'flex';
            currentClipBtn.style.display = 'flex';
            activePanel.style.display = 'none';

            const blob = await this.recorder.stop(true);
            if (blob) {
                const file = new File([blob], 'voice-message.ogg', { type: 'audio/ogg' });
                this.uploadBinaryFile(file);
            }
        });

        this.app.querySelector('#btn-cancel-voice-rec').addEventListener('click', async () => {
            const currentEmojiBtn = this.app.querySelector('#btn-trigger-emojis');
            const currentClipBtn = this.app.querySelector('#btn-trigger-clip-upload');

            voiceBtn.style.display = 'flex';
            this.textInput.style.display = 'block';
            currentEmojiBtn.style.display = 'flex';
            currentClipBtn.style.display = 'flex';
            activePanel.style.display = 'none';
            await this.recorder.stop(false);
        });

        this.viewport.addEventListener('scroll', () => {
            if (this.viewport.scrollTop === 0 && !this.loadingMore && this.hasMoreMessages) {
                this.loadMessagesChunk();
            }
        });

        // INTERACTIVE SEARCH MAGNIFYING GLASS
        const searchToggleBtn = this.app.querySelector('#btn-trigger-search-toggle');
        const searchInput = this.app.querySelector('#chat-search-messages-input');

        searchToggleBtn.addEventListener('click', () => {
            searchInput.classList.toggle('search-active');
            if (searchInput.classList.contains('search-active')) {
                searchInput.focus();
            } else {
                searchInput.value = '';
                this.viewport.querySelectorAll('.chat-bubble-row').forEach(bubble => {
                    bubble.classList.remove('search-hidden');
                });
            }
        });

        searchInput.addEventListener('input', (e) => {
            const term = e.target.value.toLowerCase().trim();
            this.viewport.querySelectorAll('.chat-bubble-row').forEach(bubble => {
                const bubbleText = bubble.querySelector('div')?.innerText.toLowerCase() || '';
                if (bubbleText.includes(term)) {
                    bubble.classList.remove('search-hidden');
                } else {
                    bubble.classList.add('search-hidden');
                }
            });
        });

        // COMPACT EMOJI POP-UP MENU
        emojiTriggerBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            emojisPanel.classList.toggle('emojis-popover-hidden');
        });

        emojisPanel.addEventListener('click', (e) => {
            if (e.target.classList.contains('emoji-picker-item')) {
                this.textInput.value += e.target.innerText;
                this.textInput.dispatchEvent(new Event('input'));
                this.textInput.focus();
            }
        });

        document.addEventListener('click', () => {
            emojisPanel.classList.add('emojis-popover-hidden');
        });

        mediaMenuBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.updateAttachmentsCounters();
            mediaPanel.classList.toggle('media-popover-hidden');
        });

        mediaPanel.addEventListener('click', (e) => {
            const targetItem = e.target.closest('.media-category-menu-item');
            if (!targetItem) return;

            const filterType = targetItem.dataset.filter; // all, image, audio, video, file, url

            // Capture only the child node's text, ignoring the numeric badge
            const cleanFilterName = targetItem.childNodes[0].textContent.trim();

            // Bar mutation
            if (filterType !== 'all') {
                normalFooterWrapper.style.display = 'none';
                categoryFooterWrapper.style.display = 'flex';
                activeCategoryLabel.innerHTML = `Viewing Category: <strong>${cleanFilterName}</strong>`;
            } else {
                normalFooterWrapper.style.display = 'flex';
                categoryFooterWrapper.style.display = 'none';
            }

            const allBubbles = [...this.viewport.children];
            allBubbles.forEach(bubble => {
                const bubbleCategory = bubble.dataset.category;
                if (filterType === 'all') {
                    bubble.classList.remove('category-hidden');
                } else if (filterType === 'url' && bubbleCategory === 'url') {
                    bubble.classList.remove('category-hidden');
                } else if (bubbleCategory === filterType) {
                    bubble.classList.remove('category-hidden');
                } else {
                    bubble.classList.add('category-hidden');
                }
            });
        });

        // BACK BUTTON: Returns the bottom bar to its standard data-entry state
        backToGeneralBtn.addEventListener('click', () => {
            normalFooterWrapper.style.display = 'flex';
            categoryFooterWrapper.style.display = 'none';

            // Reset the timeline to show all chat messages
            const allBubbles = [...this.viewport.children];
            allBubbles.forEach(bubble => {
                bubble.classList.remove('category-hidden');
            });
        });

        // Ergonomic automatic closing upon clicking anywhere else
        document.addEventListener('click', () => {
            mediaPanel.classList.add('media-popover-hidden');
        });
    }

    // ⏰ THE INDEPENDENT LOCAL PARSER: Analyzes and calculates the alarm's duration in milliseconds.
    parseAndSetupReminder(text) {
        // MATCH TUNING: Match the exact date and optionally capture the remaining text
        const regex = /@schedule:\s*(\d{2}):(\d{2})\s+(\d{2})\.(\d{2})\.(\d{4})(?:\s+[«"']?(.+)[»"']?)?/i;
        const match = text.trim().match(regex);

        if (!match) {
            // If the user types the command incorrectly, the bot injects the visual assistance template below
            const errorHelpMsg = {
                id: `local-err-${Date.now()}`,
                type: 'text',
                content: '❌ **Ошибка формата напоминания!**\n\n' +
                    '💡 Используйте шаблон:\n' +
                    '`@schedule: ЧЧ:ММ ДД.ММ.ГГГГ Текст напоминания` (Текст и кавычки необязательны)',
                date: Date.now(),
                isBot: true
            };
            // Subtle 200ms delay to simulate natural processing after the user's message
            setTimeout(() => {
                this.ui.renderMessage(errorHelpMsg, true);
                this.viewport.scrollTop = this.viewport.scrollHeight;
            }, 200);
            return false;
        }

        const [_, hour, min, day, month, year, rawMessageText] = match;
        
        // If the text is empty, we inject a default reminder
        const messageText = rawMessageText ? rawMessageText.trim() : 'Будильник / Напоминание! ⏰';

        // Construct the native JavaScript date object with integer values
        const targetDate = new Date(parseInt(year), parseInt(month) - 1, parseInt(day), parseInt(hour), parseInt(min), 0);
        const msUntilTrigger = targetDate.getTime() - Date.now();

        if (msUntilTrigger <= 0) {
            const pastErr = {
                id: `local-err-${Date.now()}`,
                type: 'text',
                content: '❌ **Ошибка:** Указанное время напоминания уже прошло в нашей галактике! ⏳',
                date: Date.now(),
                isBot: true
            };
            setTimeout(() => {
                this.ui.renderMessage(pastErr, true);
                this.viewport.scrollTop = this.viewport.scrollHeight;
            }, 200);
            return false;
        }

        // If the format is correct, the bot injects the green confirmation at the bottom of the chat
        const successFeedback = {
            id: `local-ok-${Date.now()}`,
            type: 'text',
            content: `✅ **Напоминание успешно установлено** на ${targetDate.toLocaleString('ru-RU')}!\n\n🔔 Текст: "${messageText}"`,
            date: Date.now(),
            isBot: true
        };

        setTimeout(() => {
            this.ui.renderMessage(successFeedback, true);
            this.viewport.scrollTop = this.viewport.scrollHeight;
        }, 200);

        // Schedule the asynchronous timer in the background
        setTimeout(() => {
            this.triggerNativeNotification(messageText);
        }, msUntilTrigger);

        return true;
    }


    triggerNativeNotification(text) {
        // If the user has granted permissions, raise the floating banner
        if ('Notification' in window && Notification.permission === 'granted') {
            new Notification('Chaos Organizer ⏰', {
                body: text,
                tag: 'chaos-alert'
            });
        } else {
            alert(`⏰ Напоминание: ${text}`);
        }
    }

    async loadMessagesChunk() {
        this.loadingMore = true;
        const oldScrollHeight = this.viewport.scrollHeight;

        try {
            const response = await fetch(`http://localhost:7070/api/messages?offset=${this.offset}`);
            const result = await response.json();

            if (result.status === 'ok') {
                const chunk = result.data || [];
                this.hasMoreMessages = result.hasMore;

                chunk.forEach(msg => {
                    this.ui.renderMessage(msg, false);
                });

                this.offset += chunk.length;
                this.viewport.scrollTop = this.viewport.scrollHeight - oldScrollHeight;
            }
        } catch (err) {
            console.error('Error loading chunk:', err);
        } finally {
            this.loadingMore = false;
        }

        this.updateAttachmentsCounters();
    }

    async uploadBinaryFile(fileObject) {
        const formData = new FormData();
        formData.append('file', fileObject);

        try {
            const response = await fetch('http://localhost:7070/api/upload', {
                method: 'POST',
                body: formData
            });
            await response.json();
        } catch (err) {
            console.error('Error uploading binary:', err);
        }
    }

    updateAttachmentsCounters() {
        const bubbles = [...this.viewport.children];

        const counts = { all: 0, image: 0, audio: 0, video: 0, file: 0, url: 0 };

        bubbles.forEach(bubble => {
            // If the element is a central gray information banner, we skip it so that it does NOT count toward any statistics
            if (bubble.classList.contains('chat-info-center-block')) {
                return;
            }

            // If it's a legitimate chat bubble (user or bot), we extract its physical category
            const cat = bubble.dataset.category;

            // Add to the global counter for real chat messages
            counts.all += 1;

            // Add it to its corresponding multimedia category, if applicable
            if (cat in counts) {
                counts[cat] += 1;
            }
        });

        // Inject the purified numbers directly into the badge labels of the 3-point menu
        this.app.querySelector('#cnt-all').innerText = counts.all;
        this.app.querySelector('#cnt-image').innerText = counts.image;
        this.app.querySelector('#cnt-audio').innerText = counts.audio;
        this.app.querySelector('#cnt-video').innerText = counts.video;
        this.app.querySelector('#cnt-file').innerText = counts.file;
        this.app.querySelector('#cnt-url').innerText = counts.url;
    }

}
