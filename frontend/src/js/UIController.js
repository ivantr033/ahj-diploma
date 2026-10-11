export default class UIController {
    constructor(viewport, pinBar, pinText) {
        this.viewport = viewport;
        this.pinBar = pinBar;
        this.pinText = pinText;
    }

    // Automatically converts lines of plain text containing links into clickable <a> tags
    linkify(text) {
        const urlRegex = /(https?:\/\/[^\s]+)/g;
        return text.replace(urlRegex, (url) => {
            return `<a href="${url}" target="_blank" rel="noopener noreferrer" class="msg-text-link">${url}</a>`;
        });
    }

    renderMessage(msg, appendToBottom = true) {
        if (msg.type === 'info') {
            const infoBlock = document.createElement('div');
            infoBlock.className = 'chat-info-center-block';
            infoBlock.dataset.id = msg.id;
            // CATEGORY TAG: Information banners are saved as text/info type
            infoBlock.dataset.category = 'text';
            infoBlock.innerHTML = `<span>${msg.content}</span>`;

            if (appendToBottom) this.viewport.appendChild(infoBlock);
            else this.viewport.insertBefore(infoBlock, this.viewport.firstChild);
            return;
        }

        const bubble = document.createElement('div');
        const isBot = msg.isBot === true;
        bubble.className = `chat-bubble-row ${isBot ? 'incoming-bot' : 'outgoing-user'}`;
        bubble.dataset.id = msg.id;

        // LINK DETECTION RULE: If the text contains http/https, we mark it as the 'url' category
        const hasUrl = msg.type === 'text' && /(https?:\/\/[^\s]+)/g.test(msg.content);
        bubble.dataset.category = hasUrl ? 'url' : msg.type; // image, audio, video, file, text, url

        const timeStr = new Date(msg.date).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
        let coreHTML = '';

        if (msg.type === 'text') {
            coreHTML = `<div>${this.linkify(msg.content)}</div>`;
        } else if (msg.type === 'image') {
            coreHTML = `<img src="${msg.content}" class="bubble-media-player" style="max-height:200px;" />`;
        } else if (msg.type === 'audio') {
            coreHTML = `<audio src="${msg.content}" controls class="bubble-media-player"></audio>`;
        } else if (msg.type === 'video') {
            coreHTML = `
        <video controls class="bubble-media-player" preload="metadata" style="max-width:100%; border-radius:8px;">
          <source src="${msg.content}" type="video/mp4">
          Ваш браузер не поддерживает тег video.
        </video>
      `;
        } else if (msg.type === 'file') {
            coreHTML = `
        <div class="bubble-file-attachment">
          <span>📄 ${msg.name || 'File attachment'}</span>
        </div>
      `;
        }

        const downloadActionHTML = msg.type !== 'text'
            ? `<a href="${msg.content}" download="${msg.name || 'file'}" target="_blank" class="btn-download-attachment">⬇ Скачать</a>`
            : '';

        bubble.innerHTML = `
      ${coreHTML}
      <div style="display:flex; justify-content:space-between; align-items:center; width:100%; gap:10px;">
        ${downloadActionHTML}
        <span class="msg-timestamp-stamp">${timeStr}</span>
      </div>
      <div class="bubble-hover-actions-group">
        <button class="btn-bubble-action-trigger" data-action="pin" title="Pin Message">📌</button>
        <button class="btn-bubble-action-trigger delete-trash" data-action="delete" title="Delete Message">🗑️</button>
      </div>
    `;

        if (appendToBottom) this.viewport.appendChild(bubble);
        else this.viewport.insertBefore(bubble, this.viewport.firstChild);
    }


    updatePinnedBar(content) {
        this.pinText.innerText = content.length > 50 ? content.substring(0, 50) + '...' : content;
        this.pinBar.style.display = 'flex';
    }

    hidePinnedBar() {
        this.pinBar.style.display = 'none';
    }
}
